import { db } from "@/lib/db";
import { runAnalysisPipeline } from "@/lib/ai/pipeline";

/**
 * Processes queued jobs. Each job is a durable DB row (see prisma/schema.prisma
 * `Job` model), which gives a record of every run and its outcome. It is called
 * inline from the request that enqueued the job, and there is NO automatic
 * retry: a failed job stays `failed` (and a job left `running` by a crash is
 * not picked up again); the user can trigger a fresh analysis by adding more
 * information. Callers only use `enqueueJob` + this function, so it is the seam
 * to swap in a real queue (BullMQ/SQS/etc) with retries and backoff.
 */
export async function processQueuedJobs(limit = 5) {
  const jobs = await db.job.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const job of jobs) {
    // Atomic claim: only one caller can move a given job from queued to running.
    const claimed = await db.job.updateMany({
      where: { id: job.id, status: "queued" },
      data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    try {
      if (job.type === "analyze_document") {
        const payload = job.payload ? (JSON.parse(job.payload) as { documentId: string }) : null;
        if (!payload?.documentId || !job.caseId) {
          throw new Error("Missing documentId/caseId on job payload");
        }
        await runAnalysisPipeline(job.caseId, payload.documentId);
      }

      await db.job.update({ where: { id: job.id }, data: { status: "succeeded", finishedAt: new Date() } });
    } catch (error) {
      await db.job.update({
        where: { id: job.id },
        data: { status: "failed", finishedAt: new Date(), error: error instanceof Error ? error.message : String(error) },
      });

      if (job.caseId) {
        await db.caseEvent.create({
          data: {
            caseId: job.caseId,
            type: "system",
            message: "Analysis failed. You can add more information to try again.",
          },
        });
        await db.case.update({ where: { id: job.caseId }, data: { status: "information_needed" } });
      }
    }
  }
}
