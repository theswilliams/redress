import { z } from "zod";
import { PROBLEM_CATEGORIES } from "@/lib/types";

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export const newCaseSchema = z.object({
  problemCategory: z.enum(PROBLEM_CATEGORIES),
  userStatedProblem: z.string().trim().max(4000).optional(),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "edited"]),
  editedBody: z.string().trim().max(8000).optional(),
  decisionNotes: z.string().trim().max(2000).optional(),
  // Required when decision === "approved" — validated in the route handler
  // rather than here, since it's conditional on another field.
  recipientEmail: z.string().trim().toLowerCase().email().optional(),
});
