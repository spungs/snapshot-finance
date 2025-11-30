-- CreateTable
CREATE TABLE "api_tokens" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kis_stock_masters" (
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "engName" TEXT,
    "market" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kis_stock_masters_pkey" PRIMARY KEY ("stockCode")
);

-- CreateTable
CREATE TABLE "stock_histories" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closePrice" DECIMAL(15,4) NOT NULL,
    "openPrice" DECIMAL(15,4),
    "highPrice" DECIMAL(15,4),
    "lowPrice" DECIMAL(15,4),
    "volume" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_provider_key" ON "api_tokens"("provider");

-- CreateIndex
CREATE INDEX "kis_stock_masters_stockName_idx" ON "kis_stock_masters"("stockName");

-- CreateIndex
CREATE UNIQUE INDEX "stock_histories_stockId_date_key" ON "stock_histories"("stockId", "date");

-- CreateIndex
CREATE INDEX "stock_histories_date_idx" ON "stock_histories"("date");

-- AddForeignKey
ALTER TABLE "stock_histories" ADD CONSTRAINT "stock_histories_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "stock_holdings" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KRW';
ALTER TABLE "stock_holdings" ADD COLUMN "purchaseRate" DECIMAL(10,2) NOT NULL DEFAULT 1;
