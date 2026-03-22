import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class ClientMutationService {
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

    const existing = await this.prisma.clientMutation.findUnique({
      where: {
        userId_scope_idempotencyKey: {
          userId: input.userId,
          scope: input.scope,
          idempotencyKey,
        },
      },
    });
    const cached = this.readCompletedResponse<T>(existing);
    if (cached.found) {
      return cached.value;
    }

    const claim = await this.claimMutation<T>({
      userId: input.userId,
      scope: input.scope,
      idempotencyKey,
    });
    if (claim.execute === false) {
      return claim.cachedValue;
    }

    try {
      const result = await input.handler();
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
      return result;
    } catch (error) {
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
        throw new ConflictException("request is already processing");
      }
      throw error;
    }
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
}
