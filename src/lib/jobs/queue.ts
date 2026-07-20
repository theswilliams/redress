import { db } from "@/lib/db";
import type { JobType } from "@/lib/types";

export async function enqueueJob(params: { caseId: string; type: JobType; payload?: Record<string, unknown> }) {
  return db.job.create({
    data: {
      caseId: params.caseId,
      type: params.type,
      payload: params.payload ? JSON.stringify(params.payload) : null,
    },
  });
}
