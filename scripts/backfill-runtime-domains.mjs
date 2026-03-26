#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Number(limitArg?.split("=")[1] ?? 500);

function inferDomain(parsedIntent) {
  if (!parsedIntent || typeof parsedIntent !== "object") {
    return "social";
  }
  const record = parsedIntent;
  const mode = typeof record.mode === "string" ? record.mode : null;
  if (mode === "dating") {
    return "dating";
  }
  const intentType =
    typeof record.intentType === "string"
      ? record.intentType.toLowerCase()
      : "chat";
  if (intentType === "group") {
    return "group";
  }
  if (
    Array.isArray(record.tags) &&
    record.tags.some((tag) => String(tag).toLowerCase().includes("commerce"))
  ) {
    return "commerce";
  }
  return "social";
}

async function main() {
  const startedAt = Date.now();
  const intents = await prisma.intent.findMany({
    where: {
      status: {
        in: ["parsed", "matching", "fanout", "partial", "connected"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 5_000)) : 500,
  });

  let seeded = 0;
  let skipped = 0;
  for (const intent of intents) {
    const domain = inferDomain(intent.parsedIntent);
    const workflowRunId = `${domain}:intent:${intent.id}`;
    const traceId = `backfill-${intent.id}`;

    if (dryRun) {
      seeded += 1;
      continue;
    }

    try {
      await prisma.workflowDomainIntent.upsert({
        where: {
          id: intent.id,
        },
        create: {
          id: intent.id,
          userId: intent.userId,
          domain,
          rawText: intent.rawText,
          status: intent.status,
          workflowRunId,
          traceId,
          metadata: {
            source: "backfill",
            originIntentId: intent.id,
            createdAt: intent.createdAt.toISOString(),
          },
        },
        update: {
          domain,
          status: intent.status,
          workflowRunId,
          traceId,
          metadata: {
            source: "backfill",
            originIntentId: intent.id,
            updatedAt: new Date().toISOString(),
          },
        },
      });
      seeded += 1;
    } catch (error) {
      skipped += 1;
      console.warn(
        `[backfill-runtime] skip intent=${intent.id} reason=${String(error)}`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        event: "backfill_runtime_domains.completed",
        dryRun,
        scanned: intents.length,
        seeded,
        skipped,
        durationMs: Date.now() - startedAt,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          event: "backfill_runtime_domains.failed",
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
