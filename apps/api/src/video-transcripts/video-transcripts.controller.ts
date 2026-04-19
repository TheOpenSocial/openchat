import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { ok } from "../common/api-response.js";
import { parseRequestPayload } from "../common/validation.js";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { VideoTranscriptsService } from "./video-transcripts.service.js";

const uploadIntentBodySchema = z.object({
  fileName: z.string().min(1).max(256),
  mimeType: z.enum(["video/mp4", "video/quicktime", "video/webm"]),
  byteSize: z.number().int().positive(),
});

const uploadCompleteBodySchema = z.object({
  uploadToken: z.string().min(32).max(4096),
  byteSize: z.number().int().positive(),
});

@PublicRoute()
@Controller("public/video-transcripts")
export class VideoTranscriptsController {
  constructor(
    private readonly videoTranscriptsService: VideoTranscriptsService,
  ) {}

  @Post("upload-intent")
  async createUploadIntent(@Body() body: unknown) {
    const payload = parseRequestPayload(uploadIntentBodySchema, body);
    return ok(await this.videoTranscriptsService.createUploadIntent(payload));
  }

  @Post(":jobId/complete")
  async completeUpload(@Param("jobId") jobId: string, @Body() body: unknown) {
    const payload = parseRequestPayload(uploadCompleteBodySchema, body);
    return ok(
      await this.videoTranscriptsService.completeUpload(jobId, payload),
    );
  }

  @Get(":jobId")
  async getJobStatus(@Param("jobId") jobId: string) {
    return ok(await this.videoTranscriptsService.getJobStatus(jobId));
  }
}
