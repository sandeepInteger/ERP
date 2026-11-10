import { z } from "zod";

import { EricssonAction, EricssonScope, EricssonStep, VssOutcome } from "@erp/types";
import { queryBool } from "../../lib/http.js";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optText = (max: number) => z.string().trim().max(max).optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const userId = z.string().min(1).nullable().optional();

export const CreateSiteSchema = z.object({
  siteCode: z.string().trim().min(1).max(40),
  ericssonRef: optText(80),
  venueName: z.string().trim().min(1).max(160),
  address: optText(300),
  scope: z.nativeEnum(EricssonScope),
  venueSqft: z.number().int().positive().max(100_000_000).optional(),
  clientPmName: optText(120),
  clientPmEmail: z.string().trim().email().optional(),
  targetDate: DATE.optional(),
  notes: optText(4000),
  pmId: userId,
  apmId: userId,
  deliveryLeadId: userId,
  coordinatorId: userId,
});

export const UpdateSiteSchema = z.object({
  ericssonRef: nullableText(80),
  venueName: z.string().trim().min(1).max(160).optional(),
  address: nullableText(300),
  scope: z.nativeEnum(EricssonScope).optional(),
  venueSqft: z.number().int().positive().max(100_000_000).nullable().optional(),
  clientPmName: nullableText(120),
  clientPmEmail: z.string().trim().email().nullable().optional(),
  targetDate: DATE.nullable().optional(),
  notes: nullableText(4000),
  pmId: userId,
  apmId: userId,
  deliveryLeadId: userId,
  coordinatorId: userId,
});

export const ListSitesQuerySchema = z.object({
  step: z.nativeEnum(EricssonStep).optional(),
  scope: z.nativeEnum(EricssonScope).optional(),
  search: z.string().trim().max(100).optional(),
  mine: queryBool.optional(),
  includeClosed: queryBool.optional(),
});

const money = z.number().positive().max(9_999_999_999).transform((n) => Math.round(n * 100) / 100);

// One body shape per workflow action (SOP steps 1–9).
export const SiteActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal(EricssonAction.SUBMIT_FOR_VERIFICATION) }),
  z.object({ action: z.literal(EricssonAction.ACCEPT_SOV), sovValue: money, sovVersion: z.number().int().min(1).max(99) }),
  z.object({ action: z.literal(EricssonAction.REQUEST_RFX) }),
  z.object({ action: z.literal(EricssonAction.RECORD_RFX), rfxNumber: z.string().trim().min(1).max(60), receivedOn: DATE }),
  z.object({ action: z.literal(EricssonAction.START_EXECUTION) }),
  z.object({ action: z.literal(EricssonAction.COMPLETE_SOW) }),
  z.object({ action: z.literal(EricssonAction.RECORD_VSS), vssDate: DATE, outcome: z.nativeEnum(VssOutcome) }),
  z.object({ action: z.literal(EricssonAction.SUBMIT_AE202) }),
  z.object({ action: z.literal(EricssonAction.STAMP_AE202) }),
  z.object({ action: z.literal(EricssonAction.UPLOAD_INVOICE), srmInvoiceNumber: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal(EricssonAction.APPROVE_INVOICE) }),
  z.object({ action: z.literal(EricssonAction.CLOSE_SITE) }),
]);

export type CreateSiteBody = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteBody = z.infer<typeof UpdateSiteSchema>;
export type ListSitesQuery = z.infer<typeof ListSitesQuerySchema>;
export type SiteActionBody = z.infer<typeof SiteActionSchema>;
