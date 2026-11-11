import { z } from "zod";

import { Role } from "@erp/types";

export const CreateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  designation: z.string().trim().max(120).optional(),
  role: z.nativeEnum(Role),
  /** Approves this person's expense claims. */
  managerId: z.string().min(1).optional(),
});

export const UpdateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  designation: z.string().trim().max(120).nullable().optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
  managerId: z.string().min(1).nullable().optional(),
});

export type CreateUserBody = z.infer<typeof CreateUserSchema>;
export type UpdateUserBody = z.infer<typeof UpdateUserSchema>;
