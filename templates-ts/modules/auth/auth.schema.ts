import { z } from 'zod';

const email = z.email('Must be a valid email address').trim().toLowerCase().max(255);
const password = z.string().min(12, 'Must be at least 12 characters').max(200);

export const loginBody = z.object({
  email,
  // No length rule on login: the constraint belongs on the value being set,
  // and applying it here would leak which stored passwords are non-compliant.
  password: z.string().min(1).max(200),
});

export const refreshBody = z.object({
  refreshToken: z.string().min(1).max(512),
});

export const logoutBody = refreshBody;

export const forgotPasswordBody = z.object({ email });

export const resetPasswordBody = z.object({
  token: z.string().min(1).max(512),
  password,
});

export type LoginBody = z.infer<typeof loginBody>;
export type RefreshBody = z.infer<typeof refreshBody>;
export type LogoutBody = z.infer<typeof logoutBody>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBody>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBody>;
