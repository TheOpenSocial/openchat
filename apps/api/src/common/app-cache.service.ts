import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

type MemoryCacheEntry = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class AppCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, MemoryCacheEntry>();
  private readonly prefix: string;

  constructor() {
    this.prefix = (process.env.APP_CACHE_PREFIX ?? "opensocial").trim();
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      this.redis = null;
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on("error", (error) => {
        this.logger.warn(`cache redis error: ${String(error)}`);
      });
    } catch (error) {
      this.logger.warn(`cache redis init failed: ${String(error)}`);
      this.redis = null;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const namespacedKey = this.namespacedKey(key);
    const value = await this.readValue(namespacedKey);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      await this.delete(key);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    const namespacedKey = this.namespacedKey(key);
    const serialized = JSON.stringify(value);
    await this.writeValue(namespacedKey, serialized, ttlSeconds);
  }

  async delete(key: string) {
    const namespacedKey = this.namespacedKey(key);
    this.memory.delete(namespacedKey);
    if (!this.redis) {
      return;
    }

    try {
      await this.ensureRedisConnected();
    } catch {
      return;
    }

    try {
      await this.redis.del(namespacedKey);
    } catch {
      // noop: memory fallback already cleared
    }
  }

  async onModuleDestroy() {
    if (!this.redis) {
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private namespacedKey(key: string) {
    return `${this.prefix}:${key}`;
  }

  private async readValue(key: string) {
    this.pruneMemory();

    if (this.redis) {
      try {
        await this.ensureRedisConnected();
      } catch {
        // fall back to in-memory cache
      }
      try {
        const value = await this.redis.get(key);
        if (typeof value === "string") {
          return value;
        }
      } catch {
        // fall back to in-memory cache
      }
    }

    const cached = this.memory.get(key);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return cached.value;
  }

  private async writeValue(key: string, value: string, ttlSeconds: number) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.memory.set(key, {
      value,
      expiresAt,
    });

    if (!this.redis) {
      return;
    }

    try {
      await this.ensureRedisConnected();
      await this.redis.set(key, value, "EX", ttlSeconds);
    } catch {
      // keep memory fallback
    }
  }

  private pruneMemory() {
    const now = Date.now();
    for (const [key, entry] of this.memory.entries()) {
      if (entry.expiresAt <= now) {
        this.memory.delete(key);
      }
    }
  }

  private async ensureRedisConnected() {
    if (!this.redis) {
      return;
    }
    if (
      this.redis.status === "ready" ||
      this.redis.status === "connect" ||
      this.redis.status === "connecting"
    ) {
      return;
    }
    await this.redis.connect();
  }
}
