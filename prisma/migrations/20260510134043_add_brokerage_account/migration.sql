-- CreateTable: brokerage_accounts (사용자 라벨링용 가벼운 모델)
CREATE TABLE "brokerage_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brokerage_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brokerage_accounts_userId_idx" ON "brokerage_accounts"("userId");

ALTER TABLE "brokerage_accounts" ADD CONSTRAINT "brokerage_accounts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Data Migration 1: 사용자별 "기본 계좌" 자동 생성 (멱등) =====
INSERT INTO "brokerage_accounts" ("id", "userId", "name", "displayOrder", "updatedAt")
SELECT
    gen_random_uuid()::text,
    u."id",
    '기본 계좌',
    0,
    NOW()
FROM "users" u
WHERE NOT EXISTS (
    SELECT 1 FROM "brokerage_accounts" ba WHERE ba."userId" = u."id"
);

-- AlterTable: holdings.accountId 추가 (일단 NULL 허용)
ALTER TABLE "holdings" ADD COLUMN "accountId" TEXT;

-- ===== Data Migration 2: 기존 holdings 의 accountId 채우기 (멱등) =====
UPDATE "holdings" h
SET "accountId" = (
    SELECT ba."id"
    FROM "brokerage_accounts" ba
    WHERE ba."userId" = h."userId"
    ORDER BY ba."displayOrder", ba."createdAt"
    LIMIT 1
)
WHERE h."accountId" IS NULL;

-- AlterTable: NOT NULL 변경 (데이터 이관 후)
ALTER TABLE "holdings" ALTER COLUMN "accountId" SET NOT NULL;

-- DropIndex/CreateIndex: unique 제약 교체
DROP INDEX "holdings_userId_stockId_key";
CREATE INDEX "holdings_accountId_idx" ON "holdings"("accountId");
CREATE UNIQUE INDEX "holdings_accountId_stockId_key" ON "holdings"("accountId", "stockId");

-- AddForeignKey: holdings → brokerage_accounts
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "brokerage_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
