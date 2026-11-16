import { ERICSSON_FINANCE_VIEW_ROLES } from "@erp/types";

// Who sees money on the Ericsson pages. One rule, the same one the revenue & cost report uses:
// only ERICSSON_FINANCE_VIEW_ROLES see SOV values and money totals. Change-request amounts and the
// cost lines a role may record stay visible (the delivery lead raises CRs and records costs).

export function canSeeMoney(role: string): boolean {
  return ERICSSON_FINANCE_VIEW_ROLES.has(role);
}

/** The "SOV accepted" activity line carries the amount: "SOV v2 accepted ($41,750) → …". */
export function stripSovAmount(message: string): string {
  return message.replace(/ \(\$[\d,]+(?:\.\d+)?\)/, "");
}

/** A site (row or detail) as the given role may see it: no SOV value, and no SOV amount in the activity trail. */
export function hideSiteMoney<T extends { sovValue?: unknown; events?: { type: string; message: string }[] }>(site: T, role: string): T {
  if (canSeeMoney(role)) return site;
  return {
    ...site,
    sovValue: null,
    ...(site.events
      ? { events: site.events.map((e) => (e.type === "ACCEPT_SOV" ? { ...e, message: stripSovAmount(e.message) } : e)) }
      : {}),
  } as T;
}
