-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES_LEADER', 'OPS_LEADER', 'PROJECT_MANAGER', 'ASSOCIATE_PM', 'DELIVERY_LEAD', 'COORDINATOR', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "EricssonStep" AS ENUM ('DOCS_RECEIVED', 'CROSS_VERIFICATION', 'SOV_RFX', 'MATERIALS', 'EXECUTION', 'VSS_AE202', 'INVOICING', 'CLOSED');

-- CreateEnum
CREATE TYPE "EricssonScope" AS ENUM ('IBS_ICI', 'BBU_SWAP', 'MODERNIZATION', 'MACRO_INSTALL');

-- CreateEnum
CREATE TYPE "EricssonDocType" AS ENUM ('SOV', 'BOM', 'RFDS', 'RFX', 'MATERIAL_RECEIPT', 'AE202', 'CR_APPROVAL', 'INVOICE', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('CLIENT_SUPPLIED', 'IN_STOCK', 'TO_ORDER', 'ORDERED', 'SHIPPED', 'RECEIVED', 'BACK_ORDERED');

-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('EXTRA_VISIT', 'SCOPE_DEVIATION', 'SUB_VENDOR', 'EXTRA_MATERIAL');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PM_REVIEW', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VssOutcome" AS ENUM ('PASSED', 'PASSED_WITH_PUNCH_LIST', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "designation" TEXT,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "azureOid" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "refreshTokenHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "statusCode" INTEGER,
    "path" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raci_rules" (
    "id" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "responsible" "Role"[],
    "accountable" "Role"[],
    "consulted" "Role"[],
    "informed" "Role"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raci_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_sites" (
    "id" TEXT NOT NULL,
    "siteCode" TEXT NOT NULL,
    "ericssonRef" TEXT,
    "venueName" TEXT NOT NULL,
    "address" TEXT,
    "scope" "EricssonScope" NOT NULL,
    "venueSqft" INTEGER,
    "clientPmName" TEXT,
    "clientPmEmail" TEXT,
    "targetDate" DATE,
    "notes" TEXT,
    "step" "EricssonStep" NOT NULL DEFAULT 'DOCS_RECEIVED',
    "stepChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pmId" TEXT,
    "apmId" TEXT,
    "deliveryLeadId" TEXT,
    "coordinatorId" TEXT,
    "verificationLoops" INTEGER NOT NULL DEFAULT 0,
    "sovValue" DECIMAL(12,2),
    "sovVersion" INTEGER,
    "sovAcceptedAt" TIMESTAMP(3),
    "rfxNumber" TEXT,
    "rfxRequestedAt" TIMESTAMP(3),
    "rfxReceivedAt" TIMESTAMP(3),
    "rfxAcceptedAt" TIMESTAMP(3),
    "executionStartedAt" TIMESTAMP(3),
    "sowCompletedAt" TIMESTAMP(3),
    "vssDate" DATE,
    "vssOutcome" "VssOutcome",
    "ae202SubmittedAt" TIMESTAMP(3),
    "ae202StampedAt" TIMESTAMP(3),
    "srmInvoiceNumber" TEXT,
    "invoiceUploadedAt" TIMESTAMP(3),
    "invoiceApprovedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ericsson_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_documents" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" "EricssonDocType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ericsson_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_discrepancies" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "sovValue" TEXT,
    "bomValue" TEXT,
    "rfdsValue" TEXT,
    "note" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "raisedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ericsson_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_client_queries" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ericsson_client_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_material_lines" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "bomQty" INTEGER NOT NULL,
    "clientSuppliedQty" INTEGER NOT NULL DEFAULT 0,
    "orderQty" INTEGER NOT NULL DEFAULT 0,
    "orderRef" TEXT,
    "shipTo" TEXT,
    "eta" DATE,
    "unitCost" DECIMAL(12,2),
    "status" "MaterialStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ericsson_material_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_change_requests" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "extraDays" DECIMAL(4,1),
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vendorQuote" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "passThroughPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PM_REVIEW',
    "raisedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ericsson_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_daily_logs" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "crewCount" INTEGER NOT NULL,
    "hoursEach" DECIMAL(4,1) NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockerNote" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ericsson_daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_site_events" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ericsson_site_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_azureOid_key" ON "users"("azureOid");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_sessionId_key" ON "user_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "raci_rules_client_taskKey_key" ON "raci_rules"("client", "taskKey");

-- CreateIndex
CREATE UNIQUE INDEX "ericsson_sites_siteCode_key" ON "ericsson_sites"("siteCode");

-- CreateIndex
CREATE INDEX "ericsson_sites_step_idx" ON "ericsson_sites"("step");

-- CreateIndex
CREATE INDEX "ericsson_documents_siteId_idx" ON "ericsson_documents"("siteId");

-- CreateIndex
CREATE INDEX "ericsson_discrepancies_siteId_idx" ON "ericsson_discrepancies"("siteId");

-- CreateIndex
CREATE INDEX "ericsson_client_queries_siteId_idx" ON "ericsson_client_queries"("siteId");

-- CreateIndex
CREATE INDEX "ericsson_material_lines_siteId_idx" ON "ericsson_material_lines"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "ericsson_change_requests_number_key" ON "ericsson_change_requests"("number");

-- CreateIndex
CREATE INDEX "ericsson_change_requests_siteId_idx" ON "ericsson_change_requests"("siteId");

-- CreateIndex
CREATE INDEX "ericsson_change_requests_status_idx" ON "ericsson_change_requests"("status");

-- CreateIndex
CREATE INDEX "ericsson_daily_logs_siteId_workDate_idx" ON "ericsson_daily_logs"("siteId", "workDate");

-- CreateIndex
CREATE INDEX "ericsson_site_events_siteId_createdAt_idx" ON "ericsson_site_events"("siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_sites" ADD CONSTRAINT "ericsson_sites_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_sites" ADD CONSTRAINT "ericsson_sites_apmId_fkey" FOREIGN KEY ("apmId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_sites" ADD CONSTRAINT "ericsson_sites_deliveryLeadId_fkey" FOREIGN KEY ("deliveryLeadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_sites" ADD CONSTRAINT "ericsson_sites_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_sites" ADD CONSTRAINT "ericsson_sites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_documents" ADD CONSTRAINT "ericsson_documents_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_documents" ADD CONSTRAINT "ericsson_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_discrepancies" ADD CONSTRAINT "ericsson_discrepancies_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_discrepancies" ADD CONSTRAINT "ericsson_discrepancies_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_discrepancies" ADD CONSTRAINT "ericsson_discrepancies_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_client_queries" ADD CONSTRAINT "ericsson_client_queries_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_client_queries" ADD CONSTRAINT "ericsson_client_queries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_material_lines" ADD CONSTRAINT "ericsson_material_lines_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_change_requests" ADD CONSTRAINT "ericsson_change_requests_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_change_requests" ADD CONSTRAINT "ericsson_change_requests_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_change_requests" ADD CONSTRAINT "ericsson_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_daily_logs" ADD CONSTRAINT "ericsson_daily_logs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_daily_logs" ADD CONSTRAINT "ericsson_daily_logs_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_site_events" ADD CONSTRAINT "ericsson_site_events_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_site_events" ADD CONSTRAINT "ericsson_site_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

