#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  const inputPath = normalizeString(
    flags.get("input") ?? env.EVAL_REPLAY_SANITIZE_INPUT,
    "",
  );
  const outputPath = normalizeString(
    flags.get("output") ?? env.EVAL_REPLAY_SANITIZE_OUTPUT,
    inputPath ? inputPath.replace(/\.(jsonl|json)$/i, ".sanitized.jsonl") : "",
  );

  return {
    inputPath: inputPath ? path.resolve(process.cwd(), inputPath) : "",
    outputPath: outputPath ? path.resolve(process.cwd(), outputPath) : "",
  };
}

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const TOKEN_REGEX = /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9._-]{6,}\b/g;
const PHONE_REGEX = /\+?\d[\d\s().-]{7,}\d/g;

function sanitizeString(value) {
  return value
    .replace(EMAIL_REGEX, "[redacted-email]")
    .replace(UUID_REGEX, "[redacted-uuid]")
    .replace(TOKEN_REGEX, "[redacted-token]")
    .replace(PHONE_REGEX, "[redacted-phone]");
}

function sanitizeValue(value) {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }
  return value;
}

export function loadRuntimeExportRecords(inputPath) {
  const raw = readFileSync(inputPath, "utf8");
  if (inputPath.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.conversations)) return parsed.conversations;
  if (Array.isArray(parsed?.cases)) return parsed.cases;
  return [parsed];
}

export function sanitizeRuntimeExportRecord(record) {
  return sanitizeValue(record);
}

export function sanitizeRuntimeExport(argv = process.argv.slice(2), env = process.env) {
  const config = parseArgs(argv, env);
  if (!config.inputPath) {
    throw new Error("Missing --input for runtime export sanitization.");
  }
  if (!config.outputPath) {
    throw new Error("Missing --output for runtime export sanitization.");
  }

  const records = loadRuntimeExportRecords(config.inputPath);
  const sanitized = records.map((record) => sanitizeRuntimeExportRecord(record));
  const content = `${sanitized.map((record) => JSON.stringify(record)).join("\n")}\n`;
  writeFileSync(config.outputPath, content, "utf8");

  return {
    inputPath: config.inputPath,
    outputPath: config.outputPath,
    recordCount: sanitized.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = sanitizeRuntimeExport();
  console.log(JSON.stringify(result, null, 2));
}
