-- Migration: Outbox pattern + sync metadata
-- Agrega SyncEvent y SyncSnapshot al schema existente.

-- =====================================================
-- SyncEvent
-- =====================================================
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyncEvent_status_createdAt_idx" ON "SyncEvent"("status", "createdAt");
CREATE INDEX "SyncEvent_userId_entityType_entityId_idx" ON "SyncEvent"("userId", "entityType", "entityId");
CREATE INDEX "SyncEvent_userId_status_createdAt_idx" ON "SyncEvent"("userId", "status", "createdAt");

-- =====================================================
-- SyncSnapshot
-- =====================================================
CREATE TABLE "SyncSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastVaultSync" TIMESTAMP(3),
    "lastVaultError" TEXT,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "totalSynced" INTEGER NOT NULL DEFAULT 0,
    "vaultPath" TEXT,
    "workerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncSnapshot_userId_key" ON "SyncSnapshot"("userId");

-- =====================================================
-- Foreign keys
-- =====================================================
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncSnapshot" ADD CONSTRAINT "SyncSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;