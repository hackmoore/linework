import { z } from "zod";
import type { DiagramSummary } from "./diagram.js";

/** Generous per-account cloud quota; local storage is unlimited. */
export const MAX_CLOUD_DIAGRAMS = 500;
/** Upper bound on a single serialized diagram accepted by the API. */
export const MAX_DIAGRAM_BYTES = 2 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;

export const credentialsSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.trim().toLowerCase()),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(256),
});
export type Credentials = z.input<typeof credentialsSchema>;

export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface AccountUsage {
  readonly diagramCount: number;
  readonly diagramLimit: number;
}

export interface MeResponse {
  readonly user: PublicUser;
  readonly usage: AccountUsage;
}

export interface DiagramListResponse {
  readonly diagrams: readonly DiagramSummary[];
  readonly usage: AccountUsage;
}

export interface ApiErrorBody {
  readonly error: string;
  readonly code: ApiErrorCode;
}

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "quota_exceeded"
  | "payload_too_large"
  | "rate_limited"
  | "internal";

/** Header the API requires on state-changing requests as a CSRF guard. */
export const CSRF_HEADER = "x-linework-client";
