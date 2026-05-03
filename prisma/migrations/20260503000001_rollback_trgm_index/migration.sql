-- Drop GIN trigram indexes
DROP INDEX IF EXISTS "kis_stock_masters_stockName_trgm_idx";
DROP INDEX IF EXISTS "kis_stock_masters_engName_trgm_idx";

-- Restore original B-tree indexes
CREATE INDEX IF NOT EXISTS "kis_stock_masters_stockName_idx" ON "kis_stock_masters" ("stockName");
CREATE INDEX IF NOT EXISTS "kis_stock_masters_engName_idx" ON "kis_stock_masters" ("engName");
