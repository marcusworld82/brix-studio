import { z } from "zod"
export const accountEmail = z.email("Enter a valid email address.").max(254)
export const accountPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use no more than 128 characters.")
export const signupSchema = z
  .object({
    email: accountEmail,
    password: accountPassword,
    confirmPassword: z.string(),
    consent: z.literal(true, {
      error: "Accept the Terms and Privacy Policy to continue.",
    }),
    callbackUrl: z.string().max(500).optional(),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  })
export const passwordLoginSchema = z
  .object({
    email: accountEmail,
    password: z.string().min(1, "Enter your password.").max(128),
    callbackUrl: z.string().max(500).optional(),
  })
  .strict()
export const recoveryTokenSchema = z
  .string()
  .min(16, "This reset link is invalid.")
  .max(1024, "This reset link is invalid.")
export const resetPasswordSchema = z
  .object({
    tokenHash: recoveryTokenSchema,
    password: accountPassword,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  })
