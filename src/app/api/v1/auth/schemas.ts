import { z } from "zod";

/**
 * .strict() everywhere (Validation.md): unknown fields are rejected outright
 * rather than silently dropped, so a client posting a server-controlled field
 * like `role: "ADMIN"` gets a 422, not a request that quietly ignored it.
 */
const email = z.email().max(254);
const password = z.string().min(12).max(128);
const dateOfBirth = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const uuid = z.uuid();

export const registerSchema = z.object({ email, password, dateOfBirth }).strict();

export const loginSchema = z.object({ email, password: z.string().min(1) }).strict();

export const verifyEmailSchema = z.object({ token: z.string().min(1) }).strict();

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z
  .object({ token: z.string().min(1), newPassword: password })
  .strict();

export const mfaVerifySchema = z.object({ code: z.string().min(1).max(64) }).strict();

export const mfaDisableSchema = z.object({ password: z.string().min(1) }).strict();

export const sessionIdParamSchema = z.object({ id: uuid });
