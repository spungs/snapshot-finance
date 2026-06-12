-- ============================================================================
-- 마이그레이션: stocks 테이블 폐기 → kis_stock_masters를 stocks로 통합
-- ============================================================================
-- 목적:
--   1. 종목 마스터 데이터를 단일 소스(KIS)로 통합
--   2. 컬럼명을 nameKo/nameEn으로 명확화
--   3. holdings/snapshot_holdings의 FK를 stockId(cuid) → stockCode(ticker)로 재배선
--
-- 실행 전 확인:
--   - MSTF 같은 orphan은 어디서도 참조되지 않음 (검증됨)
--   - stocks 60건 중 59건이 kis_stock_masters에 매칭
--   - market 코드는 master 기준(NASD/NYSE/AMEX/KOSPI/KOSDAQ)으로 통일
--
-- 사용:
--   - dry-run: psql ... < unify-stocks.sql  (마지막 줄 COMMIT → ROLLBACK 변경)
--   - 적용: 마지막 줄 COMMIT 유지
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 1: holdings/snapshot_holdings에 stockCode 컬럼 신설 + 백필
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE holdings ADD COLUMN "stockCode" TEXT;
ALTER TABLE snapshot_holdings ADD COLUMN "stockCode" TEXT;

UPDATE holdings h
   SET "stockCode" = s."stockCode"
  FROM stocks s
 WHERE h."stockId" = s.id;

UPDATE snapshot_holdings sh
   SET "stockCode" = s."stockCode"
  FROM stocks s
 WHERE sh."stockId" = s.id;

-- 검증: 백필 누락 없음
DO $$
DECLARE
    h_null INT;
    sh_null INT;
BEGIN
    SELECT COUNT(*) INTO h_null FROM holdings WHERE "stockCode" IS NULL;
    SELECT COUNT(*) INTO sh_null FROM snapshot_holdings WHERE "stockCode" IS NULL;
    IF h_null > 0 OR sh_null > 0 THEN
        RAISE EXCEPTION '백필 실패: holdings null=%, snapshot_holdings null=%', h_null, sh_null;
    END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 2: orphan stock(MSTF 등) 정리 — kis_stock_masters에 없는 row 삭제
-- ───────────────────────────────────────────────────────────────────────────
-- 사전 검증: 삭제 대상이 어디서도 참조되지 않는지 확인
DO $$
DECLARE
    orphan_with_refs INT;
BEGIN
    SELECT COUNT(*) INTO orphan_with_refs
      FROM stocks s
      LEFT JOIN kis_stock_masters m ON s."stockCode" = m."stockCode"
     WHERE m."stockCode" IS NULL
       AND (
         EXISTS (SELECT 1 FROM holdings h WHERE h."stockId" = s.id)
         OR EXISTS (SELECT 1 FROM snapshot_holdings sh WHERE sh."stockId" = s.id)
       );
    IF orphan_with_refs > 0 THEN
        RAISE EXCEPTION 'KIS 마스터에 없는 종목이 holdings/snapshot_holdings에서 참조됨: %건', orphan_with_refs;
    END IF;
END $$;

DELETE FROM stocks
 WHERE "stockCode" NOT IN (SELECT "stockCode" FROM kis_stock_masters);

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 3: 기존 stocks 테이블 백업 → stocks_legacy로 rename
--          (운영 적용 시 안전망. 검증 끝나면 별도 PR에서 drop)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE stocks RENAME TO stocks_legacy;
ALTER INDEX stocks_pkey RENAME TO stocks_legacy_pkey;
ALTER INDEX "stocks_stockCode_key" RENAME TO "stocks_legacy_stockCode_key";
ALTER INDEX "stocks_stockCode_idx" RENAME TO "stocks_legacy_stockCode_idx";

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 4: kis_stock_masters → stocks (rename + 컬럼 리네임)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE kis_stock_masters RENAME TO stocks;
ALTER INDEX kis_stock_masters_pkey RENAME TO stocks_pkey;
ALTER INDEX "kis_stock_masters_stockName_idx" RENAME TO "stocks_nameKo_idx";
ALTER INDEX "kis_stock_masters_engName_idx" RENAME TO "stocks_nameEn_idx";

ALTER TABLE stocks RENAME COLUMN "stockName" TO "nameKo";
ALTER TABLE stocks RENAME COLUMN "engName" TO "nameEn";

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 5: holdings/snapshot_holdings 의 FK 재배선
-- ───────────────────────────────────────────────────────────────────────────
-- 기존 FK + index 제거
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS "holdings_stockId_fkey";
ALTER TABLE snapshot_holdings DROP CONSTRAINT IF EXISTS "snapshot_holdings_stockId_fkey";
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS "holdings_accountId_stockId_key";
DROP INDEX IF EXISTS "holdings_stockId_idx";
DROP INDEX IF EXISTS "snapshot_holdings_stockId_idx";

-- 기존 stockId 컬럼 제거
ALTER TABLE holdings DROP COLUMN "stockId";
ALTER TABLE snapshot_holdings DROP COLUMN "stockId";

-- 새 컬럼에 NOT NULL + FK
ALTER TABLE holdings ALTER COLUMN "stockCode" SET NOT NULL;
ALTER TABLE snapshot_holdings ALTER COLUMN "stockCode" SET NOT NULL;

ALTER TABLE holdings
    ADD CONSTRAINT "holdings_stockCode_fkey"
    FOREIGN KEY ("stockCode") REFERENCES stocks("stockCode");

ALTER TABLE snapshot_holdings
    ADD CONSTRAINT "snapshot_holdings_stockCode_fkey"
    FOREIGN KEY ("stockCode") REFERENCES stocks("stockCode");

-- Index + unique constraint
CREATE INDEX "holdings_stockCode_idx" ON holdings ("stockCode");
CREATE INDEX "snapshot_holdings_stockCode_idx" ON snapshot_holdings ("stockCode");

ALTER TABLE holdings
    ADD CONSTRAINT "holdings_accountId_stockCode_key"
    UNIQUE ("accountId", "stockCode");

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 6: 최종 검증
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    s_count INT;
    h_count INT;
    sh_count INT;
    h_valid INT;
    sh_valid INT;
BEGIN
    SELECT COUNT(*) INTO s_count FROM stocks;
    SELECT COUNT(*) INTO h_count FROM holdings;
    SELECT COUNT(*) INTO sh_count FROM snapshot_holdings;
    SELECT COUNT(*) INTO h_valid FROM holdings h JOIN stocks s ON h."stockCode" = s."stockCode";
    SELECT COUNT(*) INTO sh_valid FROM snapshot_holdings sh JOIN stocks s ON sh."stockCode" = s."stockCode";

    RAISE NOTICE 'stocks: %, holdings: % (FK 정합: %), snapshot_holdings: % (FK 정합: %)',
        s_count, h_count, h_valid, sh_count, sh_valid;

    IF h_count <> h_valid THEN
        RAISE EXCEPTION 'holdings FK 정합 실패: % vs %', h_count, h_valid;
    END IF;
    IF sh_count <> sh_valid THEN
        RAISE EXCEPTION 'snapshot_holdings FK 정합 실패: % vs %', sh_count, sh_valid;
    END IF;
END $$;

-- dry-run 시: ROLLBACK
-- 적용 시: COMMIT
COMMIT;

-- ============================================================================
-- 백업 테이블 처리 안내
-- ============================================================================
-- 이 마이그레이션은 stocks_legacy 테이블을 7일간 보존한다.
-- 7일 후 별도 PR / cron / 수동으로 다음 SQL 을 실행해 정리:
--
--   DROP TABLE IF EXISTS stocks_legacy CASCADE;
--
-- 로컬 적용 일자 기준 +7일 = 다음 일자에 drop 권장.
-- 운영 적용 일자도 별도로 기록해 둘 것.
-- ============================================================================
