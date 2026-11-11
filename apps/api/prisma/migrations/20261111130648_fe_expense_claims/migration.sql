-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CORPORATE_CARD', 'PERSONAL_CARD');

-- AlterTable
ALTER TABLE "ericsson_expenses" ADD COLUMN     "approverId" TEXT,
ADD COLUMN     "claimType" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "receiptKey" TEXT,
ADD COLUMN     "receiptMime" TEXT,
ADD COLUMN     "receiptName" TEXT,
ADD COLUMN     "reimbursedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "managerId" TEXT;

-- CreateIndex
CREATE INDEX "ericsson_expenses_status_approverId_idx" ON "ericsson_expenses"("status", "approverId");

-- CreateIndex
CREATE INDEX "ericsson_expenses_createdById_status_idx" ON "ericsson_expenses"("createdById", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_expenses" ADD CONSTRAINT "ericsson_expenses_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_expenses" ADD CONSTRAINT "ericsson_expenses_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
