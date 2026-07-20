import { db } from "@/lib/db";

export async function writeAuditLog(params: {
  userId?: string | null;
  action: string;
  resource?: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      resource: params.resource,
      ip: params.ip ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
