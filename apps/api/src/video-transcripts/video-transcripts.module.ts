import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { VideoTranscriptsController } from "./video-transcripts.controller.js";
import { VideoTranscriptsService } from "./video-transcripts.service.js";

@Module({
  imports: [BullModule.registerQueue({ name: "media-processing" })],
  controllers: [VideoTranscriptsController],
  providers: [VideoTranscriptsService],
  exports: [VideoTranscriptsService],
})
export class VideoTranscriptsModule {}
