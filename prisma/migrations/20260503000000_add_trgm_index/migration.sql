-- Enable pg_trgm extension for fast LIKE '%query%' search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing B-tree indexes (useless for contains search)
DROP INDEX IF EXISTS "kis_stock_masters_stockName_idx";
DROP INDEX IF EXISTS "kis_stock_masters_engName_idx";

-- Create GIN trigram indexes
CREATE INDEX IF NOT EXISTS "kis_stock_masters_stockName_trgm_idx"
  ON "kis_stock_masters" USING GIN ("stockName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "kis_stock_masters_engName_trgm_idx"
  ON "kis_stock_masters" USING GIN ("engName" gin_trgm_ops);
