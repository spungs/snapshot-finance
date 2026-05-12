-- 예수금 계좌별 분해(JSON) 도입.
-- User.cashBalance 컬럼은 합계 캐시로 유지하여 기존 코드(스냅샷·AI·차트 등)와 호환.
-- 형태: [{ id: text, label: text, amount: text(Decimal as string) }]

-- AlterTable: User.cashAccounts (nullable)
ALTER TABLE "users" ADD COLUMN "cashAccounts" JSONB;

-- AlterTable: PortfolioSnapshot.cashAccounts (nullable — 기존 스냅샷은 null 유지, UI 측 fallback)
ALTER TABLE "portfolio_snapshots" ADD COLUMN "cashAccounts" JSONB;

-- ===== Data Migration: 기존 cashBalance>0 사용자를 1행 "예수금" 계좌로 백필 (멱등) =====
UPDATE "users"
SET "cashAccounts" = jsonb_build_array(
    jsonb_build_object(
        'id', gen_random_uuid()::text,
        'label', '예수금',
        'amount', "cashBalance"::text
    )
)
WHERE "cashBalance" > 0
  AND "cashAccounts" IS NULL;
