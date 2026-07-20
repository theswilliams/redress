import { db } from "@/lib/db";
import { runAnalysisPipeline } from "@/lib/ai/pipeline";

/**
 * Processes queued jobs. Each job is a durable DB row (see prisma/schema.prisma
 * `Job` model), so a crash mid-run leaves a `running` job that a retry pass
 * can pick back up — this is the seam to swap in a real queue (BullMQ/SQS/etc)
 * without changing callers, which only ever call `enqueueJob` + this
 * function.
 */
export async function processQueuedJobs(limit = 5) {
  const jobs = await db.job.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const job of jobs) {
    await db.job.update({ where: { id: job.id }, data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } } });

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
            message: "Analysis failed. Our team will look into it — you can also add more information and we'll retry.",
          },
        });
        await db.case.update({ where: { id: job.caseId }, data: { status: "information_needed" } });
      }
    }
  }
}
