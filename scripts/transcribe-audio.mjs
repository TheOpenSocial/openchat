#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import OpenAI from "openai";

const OPENAI_AUDIO_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const TARGET_CHUNK_BYTES = 24 * 1024 * 1024;
const OPENAI_AUDIO_MAX_DURATION_SECONDS = 1400;
const TARGET_CHUNK_DURATION_SECONDS = 1320;

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || key in process.env) {
      continue;
    }

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function loadLocalEnv(cwd = process.cwd()) {
  parseEnvFile(path.join(cwd, ".env"));
  parseEnvFile(path.join(cwd, ".env.local"));
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const flags = new Map();
  const positionals = [];

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    inputPath: normalizeString(flags.get("input") ?? positionals[0], ""),
    outputPath: normalizeString(flags.get("output") ?? env.TRANSCRIPT_OUTPUT, ""),
    model: normalizeString(
      flags.get("model") ?? env.OPENAI_TRANSCRIPTION_MODEL,
      "gpt-4o-transcribe",
    ),
    language: normalizeString(
      flags.get("language") ?? env.OPENAI_TRANSCRIPTION_LANGUAGE,
      "",
    ),
    prompt: normalizeString(
      flags.get("prompt") ?? env.OPENAI_TRANSCRIPTION_PROMPT,
      "",
    ),
    polish:
      flags.has("polish") ||
      normalizeString(env.OPENAI_TRANSCRIPT_POLISH_ENABLED, "").toLowerCase() ===
        "true",
    polishModel: normalizeString(
      flags.get("polish-model") ?? env.OPENAI_TRANSCRIPT_POLISH_MODEL,
      "gpt-4.1-mini",
    ),
    forceConvert: flags.has("convert"),
    noConvert: flags.has("no-convert"),
    help:
      flags.has("help") ||
      flags.has("h") ||
      normalizeString(positionals[0], "") === "help",
  };
}

function renderHelp() {
  return `
Transcribe an audio file with OpenAI and save a structured Markdown transcript.

Usage:
  node scripts/transcribe-audio.mjs /absolute/or/relative/path/audio.mp3
  pnpm audio:transcribe -- ./recording.m4a

Options:
  --input=/path/to/file        Explicit input path
  --output=/path/to/file.md    Output Markdown path
  --model=gpt-4o-transcribe    Transcription model
  --language=es                Optional language hint
  --prompt="..."               Optional transcription prompt
  --polish                     Run a second pass to improve unclear wording
  --polish-model=gpt-4.1-mini  Model used for transcript cleanup
  --convert                    Convert audio to MP3 before uploading
  --no-convert                 Disable automatic ffmpeg fallback conversion
  --help                       Show this help

Environment:
  OPENAI_API_KEY               Required API key
  OPENAI_TRANSCRIPTION_MODEL   Default model override
  OPENAI_TRANSCRIPTION_LANGUAGE Default language hint
  OPENAI_TRANSCRIPTION_PROMPT  Default transcription prompt
  OPENAI_TRANSCRIPT_POLISH_ENABLED Enable cleanup by default when true
  OPENAI_TRANSCRIPT_POLISH_MODEL Default cleanup model
`.trim();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes || 0} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function ensureMarkdownPath(inputPath, outputPath) {
  if (outputPath) {
    return path.resolve(outputPath);
  }

  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.transcript.md`);
}

function formatSeconds(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "unknown";
  }

  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, "0")))
    .join(":");
}

function isLikelyUnsupportedAudioError(error) {
  const message = normalizeString(error instanceof Error ? error.message : String(error), "")
    .toLowerCase();

  return (
    message.includes("audio file might be corrupted") ||
    message.includes("unsupported") ||
    message.includes("invalid file format") ||
    message.includes("unrecognized file format")
  );
}

function commandExists(command) {
  const pathEntries = normalizeString(process.env.PATH, "").split(path.delimiter);
  for (const entry of pathEntries) {
    if (!entry) {
      continue;
    }

    const candidate = path.join(entry, command);
    if (fs.existsSync(candidate)) {
      return true;
    }
  }

  return false;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          normalizeString(stderr, normalizeString(stdout, `${command} exited with code ${code}`)),
        ),
      );
    });
  });
}

async function probeAudio(inputPath) {
  if (!commandExists("ffprobe")) {
    return null;
  }

  try {
    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ]);

    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function convertAudioToMp3(inputPath, reporter) {
  if (!commandExists("ffmpeg")) {
    throw new Error(
      "OpenAI rejected the source audio and ffmpeg is not available for automatic conversion.",
    );
  }

  const outputPath = path.join(
    os.tmpdir(),
    `${path.parse(inputPath).name}-${Date.now()}.transcribe-fallback.mp3`,
  );

  reporter.update("Converting audio to MP3 fallback");

  try {
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ar",
      "44100",
      "-ac",
      "1",
      "-b:a",
      "128k",
      outputPath,
    ]);
  } catch (error) {
    throw new Error(
      `Automatic ffmpeg conversion failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return outputPath;
}

function getAudioDurationSeconds(audioProbe) {
  const value = Number.parseFloat(audioProbe?.format?.duration ?? "");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function splitAudioIntoChunks(inputPath, audioProbe, reporter) {
  if (!commandExists("ffmpeg")) {
    throw new Error(
      "The audio file is too large for OpenAI and ffmpeg is not available for automatic chunking.",
    );
  }

  const durationSeconds = getAudioDurationSeconds(audioProbe);
  if (!durationSeconds) {
    throw new Error(
      "Could not determine the audio duration, so automatic chunking could not be calculated.",
    );
  }

  const inputSize = fs.statSync(inputPath).size;
  const estimatedSizeChunkCount = Math.max(
    1,
    Math.ceil(inputSize / TARGET_CHUNK_BYTES),
  );
  const estimatedDurationChunkCount = Math.max(
    1,
    Math.ceil(durationSeconds / TARGET_CHUNK_DURATION_SECONDS),
  );
  const estimatedChunkCount = Math.max(
    2,
    estimatedSizeChunkCount,
    estimatedDurationChunkCount,
  );
  const chunkDurationSeconds = Math.max(
    60,
    Math.min(
      TARGET_CHUNK_DURATION_SECONDS,
      Math.ceil((durationSeconds / estimatedChunkCount) * 0.9),
    ),
  );
  const outputDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `${path.parse(inputPath).name}-transcribe-chunks-`),
  );
  const outputPattern = path.join(outputDir, "chunk-%03d.mp3");

  reporter.update(
    `Splitting oversized audio into ~${formatSeconds(chunkDurationSeconds)} chunks`,
  );

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-acodec",
    "libmp3lame",
    "-ar",
    "44100",
    "-ac",
    "1",
    "-b:a",
    "96k",
    "-f",
    "segment",
    "-segment_time",
    String(chunkDurationSeconds),
    "-reset_timestamps",
    "1",
    outputPattern,
  ]);

  const chunkPaths = fs
    .readdirSync(outputDir)
    .filter((fileName) => fileName.endsWith(".mp3"))
    .sort()
    .map((fileName) => path.join(outputDir, fileName));

  if (chunkPaths.length === 0) {
    throw new Error("Automatic chunking did not produce any output files.");
  }

  const oversizedChunk = chunkPaths.find(
    (chunkPath) => fs.statSync(chunkPath).size > TARGET_CHUNK_BYTES,
  );
  if (oversizedChunk) {
    throw new Error(
      `Automatic chunking produced an oversized chunk: ${path.basename(oversizedChunk)} (${formatBytes(
        fs.statSync(oversizedChunk).size,
      )}).`,
    );
  }

  const chunkDurationExceeded = chunkDurationSeconds > OPENAI_AUDIO_MAX_DURATION_SECONDS;
  if (chunkDurationExceeded) {
    throw new Error(
      `Automatic chunking calculated a chunk duration of ${formatSeconds(
        chunkDurationSeconds,
      )}, which exceeds the model maximum of ${formatSeconds(
        OPENAI_AUDIO_MAX_DURATION_SECONDS,
      )}.`,
    );
  }

  return {
    outputDir,
    chunkPaths,
    chunkDurationSeconds,
  };
}

function formatTranscriptBody(text) {
  const normalized = normalizeString(text, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "_No transcript text was returned._";
  }

  const collapsed = normalized.replace(/\s+/g, " ").trim();
  const sentences = collapsed.split(/(?<=[.!?])\s+/u);
  const paragraphs = [];
  let current = "";

  for (const sentence of sentences) {
    const nextValue = current ? `${current} ${sentence}` : sentence;
    if (nextValue.length > 900 && current) {
      paragraphs.push(current);
      current = sentence;
      continue;
    }

    current = nextValue;
  }

  if (current) {
    paragraphs.push(current);
  }

  return paragraphs.join("\n\n");
}

function buildMarkdown({
  inputPath,
  outputPath,
  model,
  language,
  transcriptText,
  polishedTranscriptText,
  polishModel,
  audioProbe,
  transcriptionSourcePath,
  conversionApplied,
  chunkCount,
  fileSize,
  generatedAt,
}) {
  const sections = [
    "# Audio Transcript",
    "",
    "## Metadata",
    "",
    `- Source file: \`${inputPath}\``,
    `- Output file: \`${outputPath}\``,
    `- Model: \`${model}\``,
    `- File size: ${formatBytes(fileSize)}`,
    `- Generated at: ${generatedAt}`,
  ];

  if (language) {
    sections.push(`- Language hint: \`${language}\``);
  }

  if (transcriptionSourcePath && transcriptionSourcePath !== inputPath) {
    sections.push(`- Transcription source: \`${transcriptionSourcePath}\``);
  }

  sections.push(`- Automatic conversion applied: ${conversionApplied ? "yes" : "no"}`);
  sections.push(`- Chunked upload count: ${chunkCount}`);

  if (audioProbe?.format?.format_name) {
    sections.push(`- Detected container: \`${audioProbe.format.format_name}\``);
  }

  const audioStream = Array.isArray(audioProbe?.streams)
    ? audioProbe.streams.find((stream) => stream.codec_type === "audio")
    : null;
  if (audioStream?.codec_name) {
    sections.push(`- Detected audio codec: \`${audioStream.codec_name}\``);
  }

  sections.push("", "## Transcript", "", formatTranscriptBody(transcriptText), "");

  if (polishedTranscriptText) {
    sections.push(
      "## Cleaned Up Version",
      "",
      `Generated with \`${polishModel}\` to improve readability while preserving meaning.`,
      "",
      formatTranscriptBody(polishedTranscriptText),
      "",
    );
  }

  return sections.join("\n");
}

function createProgressReporter(label) {
  const frames = ["|", "/", "-", "\\"];
  let frameIndex = 0;
  let currentPhase = label;
  let chars = 0;
  let closed = false;

  const interval = setInterval(() => {
    if (closed) {
      return;
    }

    const frame = frames[frameIndex % frames.length];
    frameIndex += 1;
    const suffix = chars > 0 ? ` (${chars.toLocaleString()} chars)` : "";
    process.stdout.write(`\r${frame} ${currentPhase}${suffix}`);
  }, 120);

  return {
    update(phase, nextChars = chars) {
      currentPhase = phase;
      chars = nextChars;
    },
    done(message) {
      if (closed) {
        return;
      }

      closed = true;
      clearInterval(interval);
      process.stdout.write(`\r${message}\n`);
    },
  };
}

async function transcribeWithStreaming(openai, request, reporter) {
  const stream = await openai.audio.transcriptions.create({
    ...request,
    response_format: "text",
    stream: true,
  });

  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("Streaming transcription was not available.");
  }

  let transcriptText = "";

  for await (const event of stream) {
    if (event?.type === "transcript.text.delta" && typeof event.delta === "string") {
      transcriptText += event.delta;
      reporter.update("Receiving transcript", transcriptText.length);
      continue;
    }

    if (event?.type === "transcript.text.done" && typeof event.text === "string") {
      transcriptText = event.text;
      reporter.update("Finalizing transcript", transcriptText.length);
      continue;
    }

    if (event?.type === "error") {
      throw new Error(
        normalizeString(event.error?.message, "OpenAI streaming transcription failed."),
      );
    }
  }

  return normalizeString(transcriptText, "");
}

async function transcribeWithFallback(openai, request, reporter) {
  reporter.update("Waiting for transcription result");

  const response = await openai.audio.transcriptions.create(request);
  if (typeof response === "string") {
    return response;
  }

  if (response && typeof response.text === "string") {
    return response.text;
  }

  throw new Error("OpenAI returned an unexpected transcription response.");
}

async function transcribeAudioFile({
  openai,
  inputPath,
  audioProbe,
  reporter,
  baseRequest,
  allowConvert,
  forceConvert,
}) {
  let transcriptionSourcePath = inputPath;
  let convertedFilePath = "";
  let conversionApplied = false;
  let chunkCount = 1;
  let chunkDirectoryPath = "";

  if (forceConvert) {
    convertedFilePath = await convertAudioToMp3(inputPath, reporter);
    transcriptionSourcePath = convertedFilePath;
    conversionApplied = true;
  }

  const maybeConvertAndRetry = async (error) => {
    if (
      !allowConvert ||
      conversionApplied ||
      !isLikelyUnsupportedAudioError(error)
    ) {
      throw error;
    }

    convertedFilePath = await convertAudioToMp3(inputPath, reporter);
    transcriptionSourcePath = convertedFilePath;
    conversionApplied = true;

    return transcribeWithFallback(
      openai,
      baseRequest(transcriptionSourcePath),
      reporter,
    );
  };

  const maybeChunkAndTranscribe = async () => {
    const sourceSize = fs.statSync(transcriptionSourcePath).size;
    const sourceDurationSeconds = getAudioDurationSeconds(audioProbe);
    const exceedsSizeLimit = sourceSize > TARGET_CHUNK_BYTES;
    const exceedsDurationLimit =
      sourceDurationSeconds > OPENAI_AUDIO_MAX_DURATION_SECONDS;

    if (!exceedsSizeLimit && !exceedsDurationLimit) {
      return null;
    }

    const { outputDir, chunkPaths } = await splitAudioIntoChunks(
      transcriptionSourcePath,
      audioProbe,
      reporter,
    );
    chunkDirectoryPath = outputDir;
    chunkCount = chunkPaths.length;

    const chunkTranscripts = [];
    for (const [index, chunkPath] of chunkPaths.entries()) {
      reporter.update(
        `Transcribing chunk ${index + 1} of ${chunkPaths.length}`,
      );
      const chunkTranscript = await transcribeWithFallback(
        openai,
        baseRequest(chunkPath),
        reporter,
      );
      chunkTranscripts.push(chunkTranscript.trim());
    }

    transcriptionSourcePath = `${transcriptionSourcePath} (${chunkPaths.length} chunks)`;
    return chunkTranscripts.filter(Boolean).join("\n\n");
  };

  const maybeChunkAndReturn = async () => {
    const transcriptText = await maybeChunkAndTranscribe();
    if (!transcriptText) {
      return null;
    }

    return {
      transcriptText,
      transcriptionSourcePath,
      convertedFilePath,
      conversionApplied,
      chunkCount,
      chunkDirectoryPath,
    };
  };

  const chunkedResult = await maybeChunkAndReturn();
  if (chunkedResult) {
    return chunkedResult;
  }

  try {
    const transcriptText = await transcribeWithStreaming(
      openai,
      baseRequest(transcriptionSourcePath),
      reporter,
    );

    return {
      transcriptText,
      transcriptionSourcePath,
      convertedFilePath,
      conversionApplied,
      chunkCount,
      chunkDirectoryPath,
    };
  } catch (streamError) {
    try {
      reporter.update("Streaming unavailable, retrying without live deltas");
      const transcriptText = await transcribeWithFallback(
        openai,
        baseRequest(transcriptionSourcePath),
        reporter,
      );

      return {
        transcriptText,
        transcriptionSourcePath,
        convertedFilePath,
        conversionApplied,
        chunkCount,
        chunkDirectoryPath,
      };
    } catch (fallbackError) {
      const transcriptText = await maybeConvertAndRetry(fallbackError);
      const postConvertChunkedResult = await maybeChunkAndReturn();
      if (postConvertChunkedResult) {
        return postConvertChunkedResult;
      }
      return {
        transcriptText,
        transcriptionSourcePath,
        convertedFilePath,
        conversionApplied,
        chunkCount,
        chunkDirectoryPath,
      };
    }
  }
}

async function polishTranscript(openai, transcriptText, reporter, model) {
  reporter.update("Improving unclear sentences", transcriptText.length);

  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You clean up speech transcripts for readability. Fix unclear or awkward sentences, restore paragraph structure, and lightly correct grammar and punctuation. Preserve the original meaning, do not invent facts, and do not summarize or omit material.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Clean up this transcript and return only the improved transcript:\n\n${transcriptText}`,
          },
        ],
      },
    ],
  });

  const polishedText = normalizeString(response.output_text, "");
  if (!polishedText) {
    throw new Error("The cleanup model returned an empty response.");
  }

  return polishedText;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs();

  if (args.help || !args.inputPath) {
    console.log(renderHelp());
    process.exit(args.help ? 0 : 1);
  }

  const apiKey = normalizeString(process.env.OPENAI_API_KEY, "");
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Set it in your shell, .env, or .env.local before running this script.",
    );
  }

  const inputPath = path.resolve(args.inputPath);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Audio file not found: ${inputPath}`);
  }

  const fileStat = fs.statSync(inputPath);
  const outputPath = ensureMarkdownPath(inputPath, args.outputPath);
  const openai = new OpenAI({ apiKey });
  const baseRequest = (filePath) => ({
    file: fs.createReadStream(filePath),
    model: args.model,
    ...(args.language ? { language: args.language } : {}),
    ...(args.prompt ? { prompt: args.prompt } : {}),
  });
  const audioProbe = await probeAudio(inputPath);

  const reporter = createProgressReporter("Uploading audio");
  let transcriptText = "";
  let polishedTranscriptText = "";
  let transcriptionSourcePath = inputPath;
  let conversionApplied = false;
  let convertedFilePath = "";
  let chunkCount = 1;
  let chunkDirectoryPath = "";

  ({
    transcriptText,
    transcriptionSourcePath,
    convertedFilePath,
    conversionApplied,
    chunkCount,
    chunkDirectoryPath,
  } = await transcribeAudioFile({
    openai,
    inputPath,
    audioProbe,
    reporter,
    baseRequest,
    allowConvert: !args.noConvert,
    forceConvert: args.forceConvert,
  }));

  if (args.polish && transcriptText) {
    polishedTranscriptText = await polishTranscript(
      openai,
      transcriptText,
      reporter,
      args.polishModel,
    );
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    buildMarkdown({
      inputPath,
      outputPath,
      model: args.model,
      language: args.language,
      transcriptText,
      polishedTranscriptText,
      polishModel: args.polishModel,
      audioProbe,
      transcriptionSourcePath,
      conversionApplied,
      chunkCount,
      fileSize: fileStat.size,
      generatedAt: new Date().toISOString(),
    }),
    "utf8",
  );

  if (convertedFilePath && fs.existsSync(convertedFilePath)) {
    fs.unlinkSync(convertedFilePath);
  }

  if (chunkDirectoryPath && fs.existsSync(chunkDirectoryPath)) {
    fs.rmSync(chunkDirectoryPath, { recursive: true, force: true });
  }

  reporter.done(`Done. Transcript saved to ${outputPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
