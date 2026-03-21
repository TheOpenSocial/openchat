import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";

interface DatabaseLatencyPool {
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

@Injectable()
export class DatabaseLatencyService implements OnModuleDestroy {
  private readonly pool: DatabaseLatencyPool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      this.pool = null;
      return;
    }

    this.pool = new Pool({
      connectionString,
      max: 1,
      min: 0,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
      allowExitOnIdle: true,
    });
  }

  async measureLatencyMs() {
    if (!this.pool) {
      return null;
    }

    const startedAt = Date.now();
    try {
      await this.pool.query("SELECT 1");
      return Date.now() - startedAt;
    } catch {
      return null;
    }
  }

  async onModuleDestroy() {
    if (!this.pool) {
      return;
    }
    await this.pool.end();
  }
}
