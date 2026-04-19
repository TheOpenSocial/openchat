import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Queue } from "bullmq";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const VIDEO_UPLOAD_TOKEN_VERSION = 1;
const VIDEO_UPLOAD_EXPIRY_MS = 15 * 60 * 1000;
const TRANSCRIPT_LINK_EXPIRY_SECONDS = 60 * 60;
const DEFAULT_MAX_VIDEO_BYTES = 250 * 1024 * 1024;

type VideoMimeType = "video/mp4" | "video/quicktime" | "video/webm";

type UploadTokenPayload = {
  version: number;
  jobId: string;
  storageKey: string;
  mimeType: VideoMimeType;
  byteSize: number;
  expiresAt: string;
};

type TranscriptJobResult = {
  status: "completed";
  transcriptStorageKey: string;
  sourceStorageKey: string;
  completedAt: string;
};

@Injectable()
export class VideoTranscriptsService {
  constructor(
    @InjectQueue("media-processing")
    private readonly mediaProcessingQueue: Queue,
  ) {}

  async createUploadIntent(input: {
    fileName: string;
    mimeType: VideoMimeType;
    byteSize: number;
  }) {
    this.validateVideoUploadInput(input);

    const jobId = randomUUID();
    const extension = this.fileExtensionForMimeType(input.mimeType);
    const normalizedFile = this.normalizeFileName(input.fileName).replace(
      /\.[^.]+$/,
      "",
    );
    const storageKey = `public/video-transcripts/uploads/${Date.now()}-${normalizedFile}-${jobId.slice(0, 8)}.${extension}`;
    const expiresAt = new Date(Date.now() + VIDEO_UPLOAD_EXPIRY_MS);

    return {
      jobId,
      storageKey,
      mimeType: input.mimeType,
      maxByteSize: this.readMaxVideoBytes(),
      expiresAt: expiresAt.toISOString(),
      uploadToken: this.createUploadToken({
        jobId,
        storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        expiresAt,
      }),
      uploadUrl: await this.buildSignedUploadUrl(
        storageKey,
        input.mimeType,
        expiresAt,
      ),
      requiredHeaders: {
        "content-type": input.mimeType,
      },
      statusUrl: `/public/video-transcripts/${jobId}`,
    };
  }

  async completeUpload(
    jobId: string,
    input: {
      uploadToken: string;
      byteSize: number;
    },
  ) {
    const payload = this.verifyUploadToken(input.uploadToken, {
      jobId,
      byteSize: input.byteSize,
    });

    await this.verifyUploadedObjectInStorage(
      payload.storageKey,
      payload.mimeType,
      input.byteSize,
    );

    await this.mediaProcessingQueue.add(
      "PublicVideoTranscriptRequested",
      {
        traceId: jobId,
        payload: {
          jobId,
          storageKey: payload.storageKey,
          mimeType: payload.mimeType,
          byteSize: input.byteSize,
        },
      },
      {
        jobId,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 3_000,
        },
      },
    );

    return {
      jobId,
      status: "queued" as const,
    };
  }

  async getJobStatus(jobId: string) {
    const job = await this.mediaProcessingQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException("video transcript job not found");
    }

    const state = await job.getState();
    if (state === "completed") {
      const result = (await job.returnvalue) as TranscriptJobResult | undefined;
      if (!result?.transcriptStorageKey) {
        return { jobId, status: "completed" as const };
      }

      const expiresAt = new Date(
        Date.now() + TRANSCRIPT_LINK_EXPIRY_SECONDS * 1000,
      ).toISOString();
      return {
        jobId,
        status: "completed" as const,
        transcriptUrl: await this.buildSignedDownloadUrl(
          result.transcriptStorageKey,
          TRANSCRIPT_LINK_EXPIRY_SECONDS,
        ),
        transcriptExpiresAt: expiresAt,
        transcriptStorageKey: result.transcriptStorageKey,
        sourceStorageKey: result.sourceStorageKey,
        completedAt: result.completedAt,
      };
    }

    if (state === "failed") {
      return {
        jobId,
        status: "failed" as const,
        error: job.failedReason ?? "transcription failed",
      };
    }

    return {
      jobId,
      status:
        state === "active"
          ? ("processing" as const)
          : state === "waiting" || state === "delayed"
            ? ("queued" as const)
            : ("uploaded" as const),
    };
  }

  async processVideoTranscript(input: {
    jobId: string;
    storageKey: string;
    mimeType: VideoMimeType;
    byteSize: number;
  }): Promise<TranscriptJobResult> {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `video-transcript-${input.jobId}-`),
    );
    const inputExtension = this.fileExtensionForMimeType(input.mimeType);
    const videoPath = path.join(tempDir, `source.${inputExtension}`);
    const markdownPath = path.join(tempDir, "transcript.md");
    const transcriptStorageKey = `public/video-transcripts/results/${input.jobId}/transcript.md`;

    try {
      await this.downloadObjectToFile(input.storageKey, videoPath);
      await this.runTranscriptScript(videoPath, markdownPath);
      const transcriptMarkdown = fs.readFileSync(markdownPath, "utf8");

      await this.uploadTextObject(
        transcriptStorageKey,
        transcriptMarkdown,
        "text/markdown; charset=utf-8",
      );

      return {
        status: "completed",
        transcriptStorageKey,
        sourceStorageKey: input.storageKey,
        completedAt: new Date().toISOString(),
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private async runTranscriptScript(inputPath: string, outputPath: string) {
    const scriptUrl = new URL(
      "../../../../scripts/transcribe-audio.mjs",
      import.meta.url,
    );
    const scriptPath = fileURLToPath(scriptUrl);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [scriptPath, inputPath, `--output=${outputPath}`, "--convert"],
        {
          env: process.env,
          stdio: ["ignore", "ignore", "pipe"],
        },
      );

      let stderr = "";

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            stderr.trim() || `transcription script exited with code ${code}`,
          ),
        );
      });
    });
  }

  private validateVideoUploadInput(input: {
    fileName: string;
    mimeType: VideoMimeType;
    byteSize: number;
  }) {
    const maxBytes = this.readMaxVideoBytes();
    if (input.byteSize < 1) {
      throw new BadRequestException("video file is empty");
    }
    if (input.byteSize > maxBytes) {
      throw new BadRequestException(`video exceeds ${maxBytes} bytes`);
    }

    const allowedMimeTypes: VideoMimeType[] = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ];
    if (!allowedMimeTypes.includes(input.mimeType)) {
      throw new BadRequestException("unsupported video mime type");
    }
  }

  private readMaxVideoBytes() {
    const configured = Number(process.env.VIDEO_TRANSCRIPTS_MAX_BYTES);
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return DEFAULT_MAX_VIDEO_BYTES;
  }

  private normalizeFileName(fileName: string) {
    const normalized = fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    return normalized || "upload";
  }

  private fileExtensionForMimeType(mimeType: VideoMimeType) {
    switch (mimeType) {
      case "video/mp4":
        return "mp4";
      case "video/quicktime":
        return "mov";
      case "video/webm":
        return "webm";
    }
  }

  private createUploadToken(input: {
    jobId: string;
    storageKey: string;
    mimeType: VideoMimeType;
    byteSize: number;
    expiresAt: Date;
  }) {
    const payload: UploadTokenPayload = {
      version: VIDEO_UPLOAD_TOKEN_VERSION,
      jobId: input.jobId,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      expiresAt: input.expiresAt.toISOString(),
    };

    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", this.readMediaUploadSigningSecret())
      .update(encodedPayload)
      .digest("base64url");

    return `${encodedPayload}.${signature}`;
  }

  private verifyUploadToken(
    token: string,
    expected: { jobId: string; byteSize: number },
  ) {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      throw new BadRequestException("invalid video upload token");
    }

    const expectedSignature = createHmac(
      "sha256",
      this.readMediaUploadSigningSecret(),
    )
      .update(encodedPayload)
      .digest("base64url");
    if (!this.constantTimeEqual(expectedSignature, signature)) {
      throw new BadRequestException("invalid video upload token");
    }

    let payload: UploadTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as UploadTokenPayload;
    } catch {
      throw new BadRequestException("invalid video upload token");
    }

    if (payload.version !== VIDEO_UPLOAD_TOKEN_VERSION) {
      throw new BadRequestException("unsupported video upload token version");
    }

    const expiresAtMs = new Date(payload.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      throw new BadRequestException("video upload token expired");
    }

    if (
      payload.jobId !== expected.jobId ||
      payload.byteSize !== expected.byteSize
    ) {
      throw new BadRequestException("video upload token mismatch");
    }

    return payload;
  }

  private async buildSignedUploadUrl(
    storageKey: string,
    mimeType: VideoMimeType,
    expiresAt: Date,
  ) {
    if (this.shouldUseAwsPresignedUploads()) {
      const bucket = process.env.S3_BUCKET ?? "opensocial-media";
      const expiresInSeconds = Math.max(
        1,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      );
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ContentType: mimeType,
      });
      return getSignedUrl(this.createS3Client(), command, {
        expiresIn: expiresInSeconds,
      });
    }

    const endpoint = (
      process.env.S3_ENDPOINT ?? "http://localhost:9000"
    ).replace(/\/+$/, "");
    const bucket = process.env.S3_BUCKET ?? "opensocial-media";
    const signingSecret = this.readMediaUploadSigningSecret();
    const signature = createHmac("sha256", signingSecret)
      .update(
        `${storageKey}:${mimeType}:${expiresAt.toISOString()}:${signingSecret}`,
      )
      .digest("hex")
      .slice(0, 32);

    return `${endpoint}/${bucket}/${storageKey}?upload=1&mime=${encodeURIComponent(mimeType)}&expires=${encodeURIComponent(expiresAt.toISOString())}&sig=${signature}`;
  }

  private async buildSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds: number,
  ) {
    if (this.shouldUseAwsPresignedUploads()) {
      const bucket = process.env.S3_BUCKET ?? "opensocial-media";
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ResponseContentType: "text/markdown; charset=utf-8",
        ResponseContentDisposition: `attachment; filename="${path.basename(storageKey)}"`,
      });
      return getSignedUrl(this.createS3Client(), command, {
        expiresIn: expiresInSeconds,
      });
    }

    return this.buildCdnUrl(storageKey);
  }

  private async verifyUploadedObjectInStorage(
    storageKey: string,
    expectedMimeType: VideoMimeType,
    expectedByteSize: number,
  ) {
    if (!this.shouldUseAwsPresignedUploads()) {
      return;
    }

    const bucket = process.env.S3_BUCKET ?? "opensocial-media";
    let objectMetadata:
      | {
          ContentLength?: number;
          ContentType?: string;
        }
      | undefined;

    try {
      objectMetadata = await this.createS3Client().send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: storageKey,
        }),
      );
    } catch (error) {
      const statusCode = (
        error as { $metadata?: { httpStatusCode?: number } } | undefined
      )?.$metadata?.httpStatusCode;
      if (statusCode === 404) {
        throw new BadRequestException("uploaded object not found");
      }
      throw new BadRequestException("could not verify uploaded object");
    }

    if (objectMetadata?.ContentLength !== expectedByteSize) {
      throw new BadRequestException("uploaded object metadata mismatch");
    }

    const normalizeMimeType = (value: string | undefined) =>
      (value ?? "").split(";")[0].trim().toLowerCase();
    if (
      normalizeMimeType(objectMetadata?.ContentType) !==
      normalizeMimeType(expectedMimeType)
    ) {
      throw new BadRequestException("uploaded object metadata mismatch");
    }
  }

  private async downloadObjectToFile(storageKey: string, outputPath: string) {
    const bucket = process.env.S3_BUCKET ?? "opensocial-media";
    const response = await this.createS3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      }),
    );

    if (!response.Body) {
      throw new BadRequestException("uploaded video could not be read");
    }

    const body = response.Body;
    if (body instanceof Readable) {
      const writeStream = fs.createWriteStream(outputPath);
      await new Promise<void>((resolve, reject) => {
        body.pipe(writeStream);
        body.on("error", reject);
        writeStream.on("error", reject);
        writeStream.on("finish", () => resolve());
      });
      return;
    }

    if (
      typeof (body as { transformToByteArray?: () => Promise<Uint8Array> })
        .transformToByteArray === "function"
    ) {
      const bytes = await (
        body as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray();
      fs.writeFileSync(outputPath, Buffer.from(bytes));
      return;
    }

    throw new BadRequestException("uploaded video body could not be consumed");
  }

  private async uploadTextObject(
    storageKey: string,
    content: string,
    contentType: string,
  ) {
    const bucket = process.env.S3_BUCKET ?? "opensocial-media";
    await this.createS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: Buffer.from(content, "utf8"),
        ContentType: contentType,
      }),
    );
  }

  private shouldUseAwsPresignedUploads() {
    const configured =
      process.env.S3_PRESIGNED_UPLOADS_ENABLED?.trim().toLowerCase();
    if (configured === "true" || configured === "1" || configured === "yes") {
      return true;
    }
    if (configured === "false" || configured === "0" || configured === "no") {
      return false;
    }
    return process.env.NODE_ENV === "production";
  }

  private createS3Client() {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    const s3AccessKey = process.env.S3_ACCESS_KEY?.trim();
    const s3SecretKey = process.env.S3_SECRET_KEY?.trim();
    const region =
      process.env.AWS_REGION?.trim() ??
      process.env.AWS_DEFAULT_REGION?.trim() ??
      "us-east-1";
    const useStaticCredentials =
      typeof s3AccessKey === "string" &&
      s3AccessKey.length > 0 &&
      typeof s3SecretKey === "string" &&
      s3SecretKey.length > 0;

    return new S3Client({
      region,
      endpoint: endpoint && endpoint.length > 0 ? endpoint : undefined,
      forcePathStyle: true,
      credentials: useStaticCredentials
        ? {
            accessKeyId: s3AccessKey,
            secretAccessKey: s3SecretKey,
          }
        : undefined,
    });
  }

  private readMediaUploadSigningSecret() {
    const secret =
      process.env.MEDIA_UPLOAD_SIGNING_SECRET ??
      process.env.MEDIA_SIGNING_SECRET;
    if (typeof secret === "string" && secret.trim().length > 0) {
      return secret.trim();
    }

    if (process.env.NODE_ENV === "production") {
      throw new BadRequestException(
        "MEDIA_UPLOAD_SIGNING_SECRET (or MEDIA_SIGNING_SECRET) must be configured",
      );
    }

    return "dev-media-secret";
  }

  private constantTimeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private buildCdnUrl(storageKey: string) {
    const defaultBase = `${(process.env.S3_ENDPOINT ?? "http://localhost:9000").replace(/\/+$/, "")}/${process.env.S3_BUCKET ?? "opensocial-media"}`;
    const base = (process.env.MEDIA_CDN_BASE_URL ?? defaultBase).replace(
      /\/+$/,
      "",
    );
    const normalizedStorageKey = storageKey.replace(/^\/+/, "");

    return `${base}/${normalizedStorageKey}`;
  }
}
