/**
 * Asynchronous Background Worker.
 * Build Spec §25, §26, §27.
 *
 * Continuously polls outbox_events and temporal_jobs with native PostgreSQL coordination.
 * Features:
 * - Crash resilient
 * - Incremental scoped reconciliation via in-memory dependency index
 * - Clean shutdown handling
 */

import {
  processNextOutboxEvents,
  processDueTemporalJobs,
} from "@warp/reconciler";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 1000);
let isRunning = true;

export async function runWorkerIteration(): Promise<{
  outboxProcessed: number;
  temporalProcessed: number;
}> {
  const outbox = await processNextOutboxEvents(20);
  const temporal = await processDueTemporalJobs(new Date());

  if (outbox.processedCount > 0) {
    console.log(`[Worker] Processed ${outbox.processedCount} outbox events:`);
    for (const r of outbox.results) {
      console.log(`  - ${r.eventType} on ${r.entityId}: ${r.actionTaken}`);
    }
  }

  if (temporal.processedCount > 0) {
    console.log(`[Worker] Processed ${temporal.processedCount} due temporal milestone jobs`);
  }

  return {
    outboxProcessed: outbox.processedCount,
    temporalProcessed: temporal.processedCount,
  };
}

async function startLoop() {
  console.log(`[Worker] Starting background worker polling every ${POLL_INTERVAL_MS}ms...`);

  while (isRunning) {
    try {
      await runWorkerIteration();
    } catch (err) {
      console.error("[Worker] Polling iteration error:", err);
    }

    if (isRunning) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.log("[Worker] Background worker stopped gracefully.");
}

function handleShutdown() {
  console.log("[Worker] Shutting down background worker...");
  isRunning = false;
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

if (process.env.NODE_ENV !== "test") {
  startLoop();
}
