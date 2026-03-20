import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAdapterMock, redisConstructorMock } = vi.hoisted(() => ({
  createAdapterMock: vi.fn(),
  redisConstructorMock: vi.fn(),
}));

vi.mock("@socket.io/redis-adapter", () => ({
  createAdapter: createAdapterMock,
}));

vi.mock("ioredis", () => ({
  Redis: redisConstructorMock,
}));

import { RealtimeIoAdapter } from "../src/realtime/realtime-io.adapter.js";

describe("RealtimeIoAdapter", () => {
  const previousRedisAdapterEnabled =
    process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED;
  const previousRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    createAdapterMock.mockReset();
    redisConstructorMock.mockReset();
    process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED = "false";
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED = previousRedisAdapterEnabled;
    process.env.REDIS_URL = previousRedisUrl;
  });

  it("does not initialize Redis adapter when feature flag is disabled", async () => {
    const adapter = new RealtimeIoAdapter({} as any);

    await expect(adapter.configureRedisAdapter()).resolves.toBe(false);
    expect(redisConstructorMock).not.toHaveBeenCalled();
    expect(createAdapterMock).not.toHaveBeenCalled();
  });

  it("initializes Redis adapter when enabled and Redis connects", async () => {
    process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED = "true";
    process.env.REDIS_URL = "redis://localhost:6379";

    const subClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    const pubClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn().mockReturnValue(subClient),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    redisConstructorMock.mockImplementation(function RedisConstructor() {
      return pubClient;
    });
    createAdapterMock.mockReturnValue(vi.fn());

    const adapter = new RealtimeIoAdapter({} as any);
    await expect(adapter.configureRedisAdapter()).resolves.toBe(true);

    expect(redisConstructorMock).toHaveBeenCalledWith(
      "redis://localhost:6379",
      {
        lazyConnect: true,
        maxRetriesPerRequest: null,
      },
    );
    expect(pubClient.duplicate).toHaveBeenCalledWith({
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    expect(createAdapterMock).toHaveBeenCalledWith(pubClient, subClient);
  });

  it("falls back safely when Redis adapter setup fails", async () => {
    process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED = "true";

    const subClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    const pubClient = {
      connect: vi.fn().mockRejectedValue(new Error("redis unavailable")),
      duplicate: vi.fn().mockReturnValue(subClient),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    redisConstructorMock.mockImplementation(function RedisConstructor() {
      return pubClient;
    });

    const adapter = new RealtimeIoAdapter({} as any);
    await expect(adapter.configureRedisAdapter()).resolves.toBe(false);

    expect(createAdapterMock).not.toHaveBeenCalled();
    expect(pubClient.quit).toHaveBeenCalledTimes(1);
    expect(subClient.quit).toHaveBeenCalledTimes(1);
  });
});
