import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class ClientMutationService {
  private readonly logger = new Logger(ClientMutationService.name);
  private static readonly IN_FLIGHT_WAIT_TIMEOUT_MS = 600;
  private static readonly IN_FLIGHT_WAIT_INTERVAL_MS = 75;
  private static readonly AGENT_RESPOND_IN_FLIGHT_WAIT_TIMEOUT_MS = 5000;

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(input: {
    userId: string;
    scope: string;
    idempotencyKey?: string;
    handler: () => Promise<T>;
  }): Promise<T> {
    if (!input.idempotencyKey) {
      return input.handler();
    }
    const idempotencyKey = input.idempotencyKey;

    let existing: {
      status: string;
      responseBody: Prisma.JsonValue | null;
    } | null = null;
    try {
      existing = await this.prisma.clientMutation.findUnique({
        where: {
          userId_scope_idempotencyKey: {
            userId: input.userId,
            scope: input.scope,
            idempotencyKey,
          },
        },
      });
    } catch (error) {
      if (this.isIdempotencyStoreUnavailable(error)) {
        this.logStoreUnavailable("findUnique", error, input.scope);
        return input.handler();
      }
      throw error;
    }
    const cached = this.readCompletedResponse<T>(existing);
    if (cached.found) {
      return cached.value;
    }

    let claim: Awaited<ReturnType<typeof this.claimMutation<T>>>;
    try {
      claim = await this.claimMutation<T>({
        userId: input.userId,
        scope: input.scope,
        idempotencyKey,
      });
    } catch (error) {
      if (this.isIdempotencyStoreUnavailable(error)) {
        this.logStoreUnavailable("claim", error, input.scope);
        return input.handler();
      }
      throw error;
    }
    if (claim.execute === false) {
      return claim.cachedValue;
    }

    try {
      const result = await input.handler();
      try {
        await this.prisma.clientMutation.update({
          where: {
            userId_scope_idempotencyKey: {
              userId: input.userId,
              scope: input.scope,
              idempotencyKey,
            },
          },
          data: {
            status: "completed",
            responseBody: this.serializeResult(result),
            errorCode: null,
            errorMessage: null,
          },
        });
      } catch (error) {
        if (!this.isIdempotencyStoreUnavailable(error)) {
          throw error;
        }
        this.logStoreUnavailable("update_completed", error, input.scope);
      }
      return result;
    } catch (error) {
      try {
        await this.prisma.clientMutation.update({
          where: {
            userId_scope_idempotencyKey: {
              userId: input.userId,
              scope: input.scope,
              idempotencyKey,
            },
          },
          data: {
            status: "failed",
            errorCode: this.readErrorCode(error),
            errorMessage: this.readErrorMessage(error),
            responseBody: Prisma.JsonNull,
          },
        });
      } catch (updateError) {
        if (!this.isIdempotencyStoreUnavailable(updateError)) {
          throw updateError;
        }
        this.logStoreUnavailable("update_failed", updateError, input.scope);
      }
      throw error;
    }
  }

  private async claimMutation<T>(input: {
    userId: string;
    scope: string;
    idempotencyKey: string;
  }): Promise<
    | { execute: true }
    | {
        execute: false;
        cachedValue: T;
      }
  > {
    try {
      await this.prisma.clientMutation.create({
        data: {
          userId: input.userId,
          scope: input.scope,
          idempotencyKey: input.idempotencyKey,
          status: "processing",
        },
      });
      return { execute: true };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.clientMutation.findUnique({
          where: {
            userId_scope_idempotencyKey: {
              userId: input.userId,
              scope: input.scope,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        const cached = this.readCompletedResponse<T>(existing);
        if (cached.found) {
          return {
            execute: false,
            cachedValue: cached.value,
          };
        }
        if (existing?.status === "failed") {
          await this.prisma.clientMutation.update({
            where: {
              userId_scope_idempotencyKey: {
                userId: input.userId,
                scope: input.scope,
                idempotencyKey: input.idempotencyKey,
              },
            },
            data: {
              status: "processing",
              errorCode: null,
              errorMessage: null,
            },
          });
          return { execute: true };
        }
        if (existing?.status === "processing") {
          const joined = await this.waitForInFlightCompletion<T>({
            userId: input.userId,
            scope: input.scope,
            idempotencyKey: input.idempotencyKey,
          });
          if (joined.found) {
            return {
              execute: false,
              cachedValue: joined.value,
            };
          }
        }
        throw new ConflictException("request is already processing");
      }
      throw error;
    }
  }

  private async waitForInFlightCompletion<T>(input: {
    userId: string;
    scope: string;
    idempotencyKey: string;
  }): Promise<{ found: true; value: T } | { found: false }> {
    const timeoutMs =
      input.scope === "agent.respond"
        ? ClientMutationService.AGENT_RESPOND_IN_FLIGHT_WAIT_TIMEOUT_MS
        : ClientMutationService.IN_FLIGHT_WAIT_TIMEOUT_MS;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await this.delay(ClientMutationService.IN_FLIGHT_WAIT_INTERVAL_MS);
      const row = await this.prisma.clientMutation.findUnique({
        where: {
          userId_scope_idempotencyKey: {
            userId: input.userId,
            scope: input.scope,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      const cached = this.readCompletedResponse<T>(row);
      if (cached.found) {
        return cached;
      }
      if (row?.status === "failed") {
        return { found: false };
      }
    }
    return { found: false };
  }

  private async delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private readCompletedResponse<T>(
    row:
      | {
          status: string;
          responseBody: Prisma.JsonValue | null;
        }
      | null
      | undefined,
  ): { found: true; value: T } | { found: false } {
    if (row?.status !== "completed") {
      return { found: false };
    }
    if (row.responseBody === null) {
      throw new InternalServerErrorException(
        "completed idempotent mutation is missing cached response",
      );
    }
    return {
      found: true,
      value: row.responseBody as T,
    };
  }

  private serializeResult<T>(result: T): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
  }

  private readErrorCode(error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
    ) {
      return (error as { code: string }).code.slice(0, 120);
    }
    return null;
  }

  private readErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message.slice(0, 500);
    }
    return String(error).slice(0, 500);
  }

  private isUniqueConstraintError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === "P2002";
    }
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }

  private isIdempotencyStoreUnavailable(error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
    ) {
      const code = (error as { code: string }).code;
      return code === "P2021" || code === "P2022";
    }
    return false;
  }

  private logStoreUnavailable(
    phase: "findUnique" | "claim" | "update_completed" | "update_failed",
    error: unknown,
    scope: string,
  ) {
    this.logger.warn(
      JSON.stringify({
        event: "client_mutation.store_unavailable",
        phase,
        scope,
        code: this.readErrorCode(error),
      }),
    );
  }
}
