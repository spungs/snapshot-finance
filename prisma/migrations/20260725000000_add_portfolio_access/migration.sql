-- 포트폴리오 위임 접근 — owner 포트폴리오를 grantee 가 대리 CRUD 할 수 있게 하는 grant.
-- 연결/철회는 이 테이블의 행 삽입/삭제로 표현한다(스키마 변경·재배포 불필요).

-- CreateTable
CREATE TABLE "portfolio_access" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_access_granteeId_idx" ON "portfolio_access"("granteeId");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_access_ownerId_granteeId_key" ON "portfolio_access"("ownerId", "granteeId");

-- AddForeignKey
ALTER TABLE "portfolio_access" ADD CONSTRAINT "portfolio_access_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_access" ADD CONSTRAINT "portfolio_access_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
