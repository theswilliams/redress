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

/**
 * MVP execution model: jobs run INLINE, inside the HTTP request that created them. This is not
 * asynchronous background processing: the request waits (up to `maxDuration`) for the AI pipeline.
 * The job table gives every run a durable record, and this single function is the only place
 * request handlers start processing, so moving to a real background worker (a queue plus a
 * separate consumer with retries/backoff) means replacing this function's body and deleting
 * the inline call, with no change to the handlers' data model.
 *
 * It processes only the given case's jobs. A failing job does not throw: the failure is recorded on
 * the job and the case (status `information_needed`) by processQueuedJobs.
 */
export async function runCaseJobsInline(caseId: string): Promise<void> {
  const { processQueuedJobs } = await import("@/lib/jobs/worker");
  await processQueuedJobs({ caseId });
}
