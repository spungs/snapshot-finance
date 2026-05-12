-- legacy 백필로 자동 생성된 cashAccounts 의 label='예수금' 항목을
-- 사용자의 첫 BrokerageAccount 이름으로 이관한다.
--
-- 안전장치:
--  - BrokerageAccount 가 하나라도 있는 사용자에게만 적용 (없으면 매핑 불가하므로 그대로 유지)
--  - 라벨이 이미 같은 항목이 있으면 amount 를 합산해 단일 행으로 통합 (중복 행 방지)
--  - 멱등성: 실행 후 label='예수금' 행이 사라지므로 재실행 시 WHERE EXISTS 가 거름

WITH affected_users AS (
    SELECT u.id, MIN(ba.name) FILTER (WHERE ba_rank.rn = 1) AS first_account_name
    FROM "users" u
    JOIN (
        SELECT
            ba2.id,
            ba2."userId",
            ROW_NUMBER() OVER (
                PARTITION BY ba2."userId"
                ORDER BY ba2."displayOrder", ba2."createdAt"
            ) AS rn
        FROM "brokerage_accounts" ba2
    ) ba_rank ON ba_rank."userId" = u.id
    JOIN "brokerage_accounts" ba ON ba.id = ba_rank.id
    WHERE jsonb_typeof(u."cashAccounts") = 'array'
      AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(u."cashAccounts") elem
          WHERE elem->>'label' = '예수금'
      )
    GROUP BY u.id
),
exploded AS (
    SELECT
        au.id AS user_id,
        au.first_account_name,
        CASE
            WHEN (elem->>'label') = '예수금' THEN au.first_account_name
            ELSE elem->>'label'
        END AS new_label,
        elem->>'id' AS orig_id,
        (elem->>'amount')::numeric AS amount,
        ord AS orig_ord
    FROM affected_users au
    JOIN "users" u ON u.id = au.id
    CROSS JOIN LATERAL jsonb_array_elements(u."cashAccounts") WITH ORDINALITY AS x(elem, ord)
),
merged AS (
    SELECT
        user_id,
        new_label,
        (ARRAY_AGG(orig_id ORDER BY orig_ord))[1] AS id,
        SUM(amount) AS total_amount,
        MIN(orig_ord) AS sort_ord
    FROM exploded
    GROUP BY user_id, new_label
),
new_arrays AS (
    SELECT
        user_id,
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'label', new_label,
                'amount', total_amount::text
            )
            ORDER BY sort_ord
        ) AS new_cash_accounts
    FROM merged
    GROUP BY user_id
)
UPDATE "users" u
SET "cashAccounts" = na.new_cash_accounts
FROM new_arrays na
WHERE u.id = na.user_id;
