import { Logger } from "@nestjs/common";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | null = null;

function isEnabled() {
  return process.env.OTEL_ENABLED !== "false";
}

function readDiagLevel() {
  const raw = (process.env.OTEL_DIAG_LEVEL ?? "").toLowerCase();
  switch (raw) {
    case "error":
      return DiagLogLevel.ERROR;
    case "warn":
      return DiagLogLevel.WARN;
    case "info":
      return DiagLogLevel.INFO;
    case "debug":
      return DiagLogLevel.DEBUG;
    default:
      return null;
  }
}

function resolveTraceEndpoint() {
  const direct = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (direct) {
    return direct;
  }
  const generic = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (generic) {
    return generic.endsWith("/v1/traces") ? generic : `${generic}/v1/traces`;
  }
  return "http://localhost:4318/v1/traces";
}

export async function startOpenTelemetry(logger: Logger) {
  if (!isEnabled()) {
    logger.log("OpenTelemetry disabled by OTEL_ENABLED=false");
    return;
  }

  if (sdk) {
    return;
  }

  const diagLevel = readDiagLevel();
  if (diagLevel !== null) {
    diag.setLogger(new DiagConsoleLogger(), diagLevel);
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? "opensocial-api";
  const serviceVersion = process.env.OTEL_SERVICE_VERSION ?? "0.1.0";
  const endpoint = resolveTraceEndpoint();

  const traceExporter = new OTLPTraceExporter({
    url: endpoint,
  });
  const resource = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
  });

  try {
    await sdk.start();
    logger.log(`OpenTelemetry tracing enabled (OTLP: ${endpoint})`);
  } catch (error) {
    sdk = null;
    logger.warn(`failed to start OpenTelemetry SDK: ${String(error)}`);
  }
}

export async function stopOpenTelemetry(logger: Logger) {
  if (!sdk) {
    return;
  }
  try {
    await sdk.shutdown();
    logger.log("OpenTelemetry tracing shutdown complete");
  } catch (error) {
    logger.warn(`failed to shutdown OpenTelemetry SDK: ${String(error)}`);
  } finally {
    sdk = null;
  }
}
