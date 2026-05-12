-- KIS Master 동기화 이력 — 갱신 성공/실패 기록 + 동시 실행 차단 + 사후 회고용.

-- CreateTable
CREATE TABLE "kis_master_sync_logs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL,
    "rowCounts" JSONB,
    "errorMessage" TEXT,
    "triggeredBy" TEXT NOT NULL,

    CONSTRAINT "kis_master_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kis_master_sync_logs_startedAt_idx" ON "kis_master_sync_logs"("startedAt");

-- CreateIndex
CREATE INDEX "kis_master_sync_logs_status_idx" ON "kis_master_sync_logs"("status");
