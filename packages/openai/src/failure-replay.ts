import { randomUUID } from "node:crypto";
import { type OpenAIRoutingTask } from "./prompts.js";

export interface OpenAIFailureRecord {
  id: string;
  occurredAt: string;
  task: OpenAIRoutingTask;
  traceId: string;
  model: string;
  promptVersion: string;
  reason: string;
  inputPayload: unknown;
  responseText?: string;
  errorMessage?: string;
  replayCount: number;
  lastReplayedAt?: string;
}

export class OpenAIFailureStore {
  private readonly records: OpenAIFailureRecord[] = [];

  constructor(private readonly maxRecords = 200) {}

  captureFailure(
    failure: Omit<OpenAIFailureRecord, "id" | "occurredAt" | "replayCount">,
  ): OpenAIFailureRecord {
    const record: OpenAIFailureRecord = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      replayCount: 0,
      ...failure,
    };
    this.records.unshift(record);

    if (this.records.length > this.maxRecords) {
      this.records.splice(this.maxRecords);
    }

    return record;
  }

  listFailures(task?: OpenAIRoutingTask): OpenAIFailureRecord[] {
    return this.records.filter((record) => !task || record.task === task);
  }

  getFailure(id: string): OpenAIFailureRecord | undefined {
    return this.records.find((record) => record.id === id);
  }

  markReplayed(id: string): OpenAIFailureRecord | undefined {
    const record = this.getFailure(id);
    if (!record) return undefined;

    record.replayCount += 1;
    record.lastReplayedAt = new Date().toISOString();
    return record;
  }
}
