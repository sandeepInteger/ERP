-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('LABOR', 'MATERIAL', 'TRAVEL', 'VENDOR', 'OTHER');

-- CreateTable
CREATE TABLE "ericsson_expenses" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "personName" TEXT,
    "assigned" BOOLEAN NOT NULL DEFAULT true,
    "hours" DECIMAL(6,1),
    "amount" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ericsson_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ericsson_expenses_siteId_workDate_idx" ON "ericsson_expenses"("siteId", "workDate");

-- CreateIndex
CREATE INDEX "ericsson_expenses_workDate_idx" ON "ericsson_expenses"("workDate");

-- AddForeignKey
ALTER TABLE "ericsson_expenses" ADD CONSTRAINT "ericsson_expenses_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_expenses" ADD CONSTRAINT "ericsson_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
