import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { adminSecurityMiddleware } from "./admin/admin-security.middleware.js";
import { AppModule } from "./app.module.js";
import {
  startOpenTelemetry,
  stopOpenTelemetry,
} from "./common/otel-bootstrap.js";
import { requestLoggingMiddleware } from "./common/request-logging.middleware.js";
import { requestSecurityMiddleware } from "./common/request-security.middleware.js";
import { assertSecurityPosture } from "./common/security-posture.js";
import { transportSecurityMiddleware } from "./common/transport-security.middleware.js";
import { RealtimeIoAdapter } from "./realtime/realtime-io.adapter.js";

const allowedCorsOrigins = new Set([
  "http://localhost:3002",
  "http://127.0.0.1:3002",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://opensocial.so",
  "https://www.opensocial.so",
  "https://app.opensocial.so",
  "https://admin.opensocial.so",
  "https://docs.opensocial.so",
]);

function isAllowedCorsOrigin(origin?: string) {
  if (!origin) {
    return true;
  }

  return allowedCorsOrigins.has(origin);
}

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  await startOpenTelemetry(logger);
  const securityPosture = assertSecurityPosture();
  if (securityPosture.violations.length > 0) {
    logger.warn(
      `security posture warnings: ${securityPosture.violations.join("; ")}`,
    );
  }

  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.getHttpAdapter();
  const httpServer = httpAdapter.getInstance();
  if (httpServer && typeof httpServer.set === "function") {
    httpServer.set("trust proxy", 1);
  }
  const websocketAdapter = new RealtimeIoAdapter(app);
  await websocketAdapter.configureRedisAdapter();
  app.useWebSocketAdapter(websocketAdapter);
  app.use(transportSecurityMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(requestSecurityMiddleware);
  app.use(adminSecurityMiddleware);
  app.enableCors({
    origin(origin, callback) {
      if (!isAllowedCorsOrigin(origin)) {
        callback(null, false);
        return;
      }

      callback(null, origin ?? true);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "idempotency-key"],
  });

  app.use((request: Request, _response: Response, next: NextFunction) => {
    if (request.url === "/api" || request.url.startsWith("/api/")) {
      request.url = request.url.slice(4) || "/";
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.enableShutdownHooks();
  const closeRealtimeAdapter = async () => {
    await websocketAdapter.close();
    await stopOpenTelemetry(logger);
  };
  app.getHttpServer().on("close", () => {
    void closeRealtimeAdapter();
  });

  await app.listen(process.env.PORT ?? 3000);
  logger.log(`api listening on port ${process.env.PORT ?? 3000}`);
}

bootstrap();
