import { Logger, type INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { ServerOptions } from "socket.io";

const SOCKET_RECOVERY_WINDOW_MS = 2 * 60 * 1000;

export class RealtimeIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RealtimeIoAdapter.name);
  private redisPubClient: Redis | null = null;
  private redisSubClient: Redis | null = null;
  private redisAdapterConstructor: ReturnType<typeof createAdapter> | null =
    null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async configureRedisAdapter() {
    const enabled =
      (process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED ?? "false") === "true";
    if (!enabled) {
      return false;
    }

    const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    const pubClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    const subClient = pubClient.duplicate({
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });

    try {
      await pubClient.connect();
      await subClient.connect();
      this.redisPubClient = pubClient;
      this.redisSubClient = subClient;
      this.redisAdapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log("socket.io redis adapter enabled");
      return true;
    } catch (error) {
      this.logger.warn(
        `socket.io redis adapter failed to initialize, falling back to memory adapter: ${String(error)}`,
      );
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
      this.redisPubClient = null;
      this.redisSubClient = null;
      this.redisAdapterConstructor = null;
      return false;
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const stickySessionsEnabled =
      (process.env.SOCKET_IO_STICKY_SESSIONS_ENABLED ?? "true") === "true";
    const server = super.createIOServer(port, {
      ...options,
      connectionStateRecovery: {
        maxDisconnectionDuration: SOCKET_RECOVERY_WINDOW_MS,
        skipMiddlewares: true,
        ...(options?.connectionStateRecovery ?? {}),
      },
      cookie: stickySessionsEnabled
        ? {
            name: process.env.SOCKET_IO_STICKY_COOKIE_NAME ?? "opensocial_io",
            path: "/",
            httpOnly: true,
            sameSite: "lax",
          }
        : (options?.cookie ?? false),
    });

    if (this.redisAdapterConstructor) {
      server.adapter(this.redisAdapterConstructor);
    }
    return server;
  }

  override async close() {
    await Promise.allSettled([
      this.redisPubClient?.quit(),
      this.redisSubClient?.quit(),
    ]);
    this.redisPubClient = null;
    this.redisSubClient = null;
    this.redisAdapterConstructor = null;
  }
}
