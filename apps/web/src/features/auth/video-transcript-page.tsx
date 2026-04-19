"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { api, type PublicVideoTranscriptJobStatus } from "@/src/lib/api";
import { webEnv } from "@/src/lib/env";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes || 0} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function VideoTranscriptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<PublicVideoTranscriptJobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(file) && !busy;
  const headline = useMemo(
    () =>
      job?.status === "completed"
        ? "Transcript ready"
        : job?.status === "failed"
          ? "Processing failed"
          : "Video to transcript",
    [job?.status],
  );

  useEffect(() => {
    if (!job?.jobId) {
      return;
    }
    if (!["queued", "processing", "uploaded"].includes(job.status)) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const nextJob = await api.getPublicVideoTranscriptJob(job.jobId);
        setJob(nextJob);
      } catch (pollError) {
        setError(
          pollError instanceof Error
            ? pollError.message
            : "Could not refresh transcript status.",
        );
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      return;
    }

    setBusy(true);
    setError(null);
    setJob(null);

    try {
      const intent = await api.createPublicVideoTranscriptUploadIntent({
        fileName: file.name,
        mimeType: (file.type || "video/mp4") as
          | "video/mp4"
          | "video/quicktime"
          | "video/webm",
        byteSize: file.size,
      });

      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.requiredHeaders,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      await api.completePublicVideoTranscriptUpload(intent.jobId, {
        uploadToken: intent.uploadToken,
        byteSize: file.size,
      });

      const nextJob = await api.getPublicVideoTranscriptJob(intent.jobId);
      setJob(nextJob);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create transcript job.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] px-6 py-10 text-[hsl(var(--foreground))]">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))]">
              OpenSocial Utility
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.04em] text-[hsl(var(--foreground))]">
              {headline}
            </h1>
            <p className="max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Upload an `.mp4`, wait for the background transcription job, then
              open a temporary `.md` link when it finishes. Processing runs
              against your API at{" "}
              <span className="font-medium">{webEnv.apiBaseUrl}</span>.
            </p>
          </div>

          <form
            className="space-y-4 rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-6 shadow-sm"
            onSubmit={handleSubmit}
          >
            <label className="block space-y-2">
              <span className="text-sm font-medium">Video file</span>
              <input
                accept="video/mp4,video/quicktime,video/webm"
                className="block w-full rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--panel-muted))] px-4 py-5 text-sm text-[hsl(var(--foreground))] file:mr-4 file:rounded-xl file:border-0 file:bg-[hsl(var(--foreground))] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[hsl(var(--background))]"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>

            {file ? (
              <div className="rounded-2xl bg-[hsl(var(--panel-muted))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                <div className="font-medium text-[hsl(var(--foreground))]">
                  {file.name}
                </div>
                <div>{formatBytes(file.size)}</div>
              </div>
            ) : null}

            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {busy ? "Uploading..." : "Create transcript"}
            </Button>

            {error ? (
              <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
            ) : null}
          </form>
        </section>

        <aside className="rounded-[32px] border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
                Status
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                {job?.status ?? "idle"}
              </p>
            </div>

            <div className="space-y-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              <p>1. Browser uploads the video to object storage.</p>
              <p>2. API queues a media-processing job on your EC2 stack.</p>
              <p>
                3. Worker extracts audio, transcribes it, and uploads a `.md`
                result.
              </p>
              <p>
                4. The page reveals a temporary signed link when the transcript
                is ready.
              </p>
            </div>

            {job?.jobId ? (
              <div className="rounded-2xl bg-[hsl(var(--panel-muted))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                <div className="text-xs uppercase tracking-[0.18em]">
                  Job ID
                </div>
                <div className="mt-1 break-all font-mono text-xs text-[hsl(var(--foreground))]">
                  {job.jobId}
                </div>
              </div>
            ) : null}

            {job?.status === "completed" && job.transcriptUrl ? (
              <div className="space-y-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Transcript link ready
                </p>
                <a
                  className="inline-flex items-center rounded-xl bg-[hsl(var(--foreground))] px-4 py-2 text-sm font-medium text-[hsl(var(--background))]"
                  href={job.transcriptUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open transcript
                </a>
                {job.transcriptExpiresAt ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Link expires at{" "}
                    {new Date(job.transcriptExpiresAt).toLocaleString()}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {job?.status === "failed" ? (
              <p className="text-sm text-[hsl(var(--destructive))]">
                {job.error ?? "The transcript job failed."}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
