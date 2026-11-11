-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ericsson_work_items" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT NOT NULL,
    "status" "WorkItemStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" DATE,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ericsson_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_work_updates" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "hours" DECIMAL(4,1) NOT NULL,
    "status" "WorkItemStatus" NOT NULL,
    "note" TEXT,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ericsson_work_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ericsson_work_items_siteId_idx" ON "ericsson_work_items"("siteId");

-- CreateIndex
CREATE INDEX "ericsson_work_items_assigneeId_status_idx" ON "ericsson_work_items"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "ericsson_work_updates_workItemId_createdAt_idx" ON "ericsson_work_updates"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "ericsson_work_updates_userId_workDate_idx" ON "ericsson_work_updates"("userId", "workDate");

-- AddForeignKey
ALTER TABLE "ericsson_work_items" ADD CONSTRAINT "ericsson_work_items_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_work_items" ADD CONSTRAINT "ericsson_work_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_work_items" ADD CONSTRAINT "ericsson_work_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_work_updates" ADD CONSTRAINT "ericsson_work_updates_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "ericsson_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_work_updates" ADD CONSTRAINT "ericsson_work_updates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
