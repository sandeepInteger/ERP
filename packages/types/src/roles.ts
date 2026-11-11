// System roles. Mirrors the Role enum in apps/api/prisma/schema.prisma — keep both in step.
// Derived from the stakeholder roles in the client SOPs (Roles & Responsibilities).
export enum Role {
  ADMIN = "ADMIN",
  SALES_LEADER = "SALES_LEADER",
  OPS_LEADER = "OPS_LEADER",
  PROJECT_MANAGER = "PROJECT_MANAGER",
  ASSOCIATE_PM = "ASSOCIATE_PM",
  DELIVERY_LEAD = "DELIVERY_LEAD",
  COORDINATOR = "COORDINATOR",
  FINANCE = "FINANCE",
  VIEWER = "VIEWER",
  /**
   * Field engineer (FE): works on site. Signs in with an emailed one-time code and sees only the
   * field screens of their sites (assigned work, expenses). Internal key kept as FIELD_CREW.
   */
  FIELD_CREW = "FIELD_CREW",
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: "Admin",
  [Role.SALES_LEADER]: "Sales leader",
  [Role.OPS_LEADER]: "Operations leader",
  [Role.PROJECT_MANAGER]: "Project manager",
  [Role.ASSOCIATE_PM]: "Associate PM",
  [Role.DELIVERY_LEAD]: "Delivery lead",
  [Role.COORDINATOR]: "Project coordinator",
  [Role.FINANCE]: "Finance",
  [Role.VIEWER]: "Viewer",
  [Role.FIELD_CREW]: "Field engineer (FE)",
};

/** Roles that sign in with an emailed one-time code instead of Microsoft. */
export const EMAIL_CODE_ROLES = new Set<string>([Role.FIELD_CREW]);

export const ALL_ROLES = Object.values(Role);

// Canonical role groupings. Import these instead of re-declaring a local Set.

/** Can see every project and every site, and act as an escalation level. */
export const LEADERSHIP_ROLES = new Set<string>([Role.ADMIN, Role.SALES_LEADER, Role.OPS_LEADER]);

/** Runs project delivery day to day. */
export const DELIVERY_ROLES = new Set<string>([
  Role.PROJECT_MANAGER,
  Role.ASSOCIATE_PM,
  Role.DELIVERY_LEAD,
  Role.COORDINATOR,
]);

/** Can manage users and system settings. */
export const ADMIN_ROLES = new Set<string>([Role.ADMIN]);
