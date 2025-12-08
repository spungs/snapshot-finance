-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "securities_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "brokerName" TEXT NOT NULL,
    "apiType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "securities_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalValue" DECIMAL(15,2) NOT NULL,
    "totalCost" DECIMAL(15,2) NOT NULL,
    "totalProfit" DECIMAL(15,2) NOT NULL,
    "profitRate" DECIMAL(10,4) NOT NULL,
    "cashBalance" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_holdings" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "averagePrice" DECIMAL(15,2) NOT NULL,
    "currentPrice" DECIMAL(15,2) NOT NULL,
    "totalCost" DECIMAL(15,2) NOT NULL,
    "currentValue" DECIMAL(15,2) NOT NULL,
    "profit" DECIMAL(15,2) NOT NULL,
    "profitRate" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "sector" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "baseCost" DECIMAL(15,2) NOT NULL,
    "currentPrice" DECIMAL(15,2) NOT NULL,
    "hypotheticalValue" DECIMAL(15,2) NOT NULL,
    "actualProfit" DECIMAL(15,2),
    "difference" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "securities_accounts_userId_idx" ON "securities_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "securities_accounts_userId_accountNumber_key" ON "securities_accounts"("userId", "accountNumber");

-- CreateIndex
CREATE INDEX "portfolio_snapshots_accountId_snapshotDate_idx" ON "portfolio_snapshots"("accountId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "portfolio_snapshots_snapshotDate_idx" ON "portfolio_snapshots"("snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "stock_holdings_snapshotId_idx" ON "stock_holdings"("snapshotId");

-- CreateIndex
CREATE INDEX "stock_holdings_stockId_idx" ON "stock_holdings"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_stockCode_key" ON "stocks"("stockCode");

-- CreateIndex
CREATE INDEX "stocks_stockCode_idx" ON "stocks"("stockCode");

-- CreateIndex
CREATE INDEX "simulations_userId_idx" ON "simulations"("userId");

-- CreateIndex
CREATE INDEX "simulations_stockId_idx" ON "simulations"("stockId");

-- AddForeignKey
ALTER TABLE "securities_accounts" ADD CONSTRAINT "securities_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "securities_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "portfolio_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
