"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/cn";
import { api, type PublicVideoTranscriptJobStatus } from "@/src/lib/api";
import styles from "./video-transcript-page.module.css";

const STALE_PROCESSING_SECONDS = 120;

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

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  if (minutes < 1) {
    return `${remainder}s`;
  }

  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function getStatusCopy(
  job: PublicVideoTranscriptJobStatus | null,
  elapsedSeconds: number,
  isStale: boolean,
) {
  switch (job?.status) {
    case "uploaded":
      return {
        title: "Upload complete",
        description:
          "Your file is in storage and the transcript request has been accepted.",
        badge: "Uploaded",
      };
    case "queued":
      return {
        title: "Waiting for a worker",
        description: `The job is queued and will start as soon as the worker is free.${elapsedSeconds > 0 ? ` Elapsed: ${formatElapsed(elapsedSeconds)}.` : ""}`,
        badge: "Queued",
      };
    case "processing":
      return {
        title: isStale ? "Still processing" : "Transcribing",
        description: isStale
          ? `This job has been running for ${formatElapsed(elapsedSeconds)}. You can refresh the status or clear this session if it looks stuck.`
          : `Audio extraction and transcription are in progress.${elapsedSeconds > 0 ? ` Elapsed: ${formatElapsed(elapsedSeconds)}.` : ""}`,
        badge: "Processing",
      };
    case "completed":
      return {
        title: "Transcript ready",
        description:
          "The Markdown transcript is ready to open from a temporary signed link.",
        badge: "Ready",
      };
    case "failed":
      return {
        title: "Processing failed",
        description:
          "The worker stopped before the transcript could be completed. Clear the session and try again.",
        badge: "Failed",
      };
    default:
      return {
        title: "Video to transcript",
        description: "Upload a recording and get a Markdown transcript.",
        badge: "Ready",
      };
  }
}

function OpenSocialHeader() {
  return (
    <header className="os-nav os-nav--visible" aria-label="Site navigation">
      <div className="os-nav-inner">
        <Link className="os-nav-logo" href="/" aria-label="OpenSocial home">
          <svg
            viewBox="0 0 1024 1024"
            aria-hidden="true"
            className="os-nav-mark"
          >
            <path
              d="M512 309A228 228 0 0 0 512 755A228 228 0 0 0 512 309Z"
              fill="currentColor"
            />
            <circle
              cx="407"
              cy="532"
              r="228"
              fill="none"
              stroke="currentColor"
              strokeWidth="42"
            />
            <circle
              cx="617"
              cy="532"
              r="228"
              fill="none"
              stroke="currentColor"
              strokeWidth="42"
            />
          </svg>
          <span className="os-nav-name" aria-label="OpenSocial">
            <span className="os-nav-short" aria-hidden="true">
              OS
            </span>
            <span className="os-nav-long" aria-hidden="true">
              OpenSocial
            </span>
          </span>
        </Link>

        <nav className="os-nav-links">
          <Link className={cn("os-nav-link", styles.navLink)} href="/manifesto">
            Manifesto
          </Link>
          <Link className={cn("os-nav-cta", styles.navCta)} href="/">
            Back home
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function VideoTranscriptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<PublicVideoTranscriptJobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<{
    jobId: string;
    startedAt: number;
  } | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const jobIsActive = ["uploaded", "queued", "processing"].includes(
    job?.status ?? "",
  );

  useEffect(() => {
    if (job?.jobId && jobIsActive) {
      setActiveRun((current) =>
        current?.jobId === job.jobId
          ? current
          : { jobId: job.jobId, startedAt: Date.now() },
      );
      return;
    }

    setActiveRun(null);
  }, [job?.jobId, jobIsActive]);

  useEffect(() => {
    if (!activeRun) {
      return;
    }

    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeRun]);

  const elapsedSeconds = activeRun
    ? Math.floor((clock - activeRun.startedAt) / 1000)
    : 0;
  const isStale =
    job?.status === "processing" && elapsedSeconds >= STALE_PROCESSING_SECONDS;
  const formLocked = busy || jobIsActive;
  const canSubmit = Boolean(file) && !formLocked;
  const copy = useMemo(
    () => getStatusCopy(job, elapsedSeconds, isStale),
    [elapsedSeconds, isStale, job],
  );
  const statusText = error
    ? `Error: ${error}`
    : `${copy.title}. ${copy.description}`;

  const refreshStatus = async (jobId = job?.jobId) => {
    if (!jobId) {
      return;
    }

    try {
      const nextJob = await api.getPublicVideoTranscriptJob(jobId);
      setJob(nextJob);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh transcript status.",
      );
    }
  };

  useEffect(() => {
    if (!job?.jobId || !jobIsActive) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      try {
        const nextJob = await api.getPublicVideoTranscriptJob(job.jobId);
        if (!cancelled) {
          setJob(nextJob);
          setError(null);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Could not refresh transcript status.",
          );
        }
      }
    };

    const timer = window.setInterval(tick, 3000);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.jobId, jobIsActive]);

  const resetSession = () => {
    setBusy(false);
    setError(null);
    setJob(null);
    setFile(null);
    setActiveRun(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || formLocked) {
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
    <main className={styles.shell}>
      <OpenSocialHeader />

      <div className={styles.shellInner}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>OpenSocial Video</p>
          <h1 className={styles.title}>Turn video into a transcript.</h1>
          <p className={styles.body}>
            Upload `mp4`, `mov`, or `webm` up to 1 GB.
          </p>
        </section>

        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Upload</p>
                <h2 className={styles.panelTitle}>Queue a transcript job</h2>
              </div>
              <p className={styles.panelBadge}>{copy.badge}</p>
            </div>

            <form
              className={styles.form}
              onSubmit={handleSubmit}
              aria-busy={formLocked}
            >
              <label
                className={cn(
                  styles.fileField,
                  formLocked && styles.fileFieldLocked,
                )}
              >
                <span className={styles.fileFieldTitle}>
                  Choose a video file
                </span>
                <span className={styles.fileFieldText}>
                  One upload at a time. The form stays locked while a job is
                  running.
                </span>
                <input
                  accept="video/mp4,video/quicktime,video/webm"
                  className={styles.fileInput}
                  disabled={formLocked}
                  onChange={(event) => {
                    setError(null);
                    setFile(event.target.files?.[0] ?? null);
                  }}
                  type="file"
                />
              </label>

              <div className={styles.rule} />

              <div className={styles.detailRow} aria-live="polite">
                <div>
                  <p className={styles.detailLabel}>Selected file</p>
                  <p className={styles.detailValue}>
                    {file?.name ?? "No file selected yet"}
                  </p>
                </div>
                {file ? (
                  <p className={styles.detailMeta}>{formatBytes(file.size)}</p>
                ) : null}
              </div>

              <div className={styles.actions}>
                <Button
                  className={styles.primaryAction}
                  type="submit"
                  variant="primary"
                  disabled={!canSubmit}
                >
                  {busy ? "Uploading..." : "Create transcript"}
                </Button>

                {(job || file) && (
                  <Button
                    className={styles.secondaryAction}
                    type="button"
                    variant="outline"
                    onClick={resetSession}
                  >
                    Clear session
                  </Button>
                )}
              </div>

              <div className="sr-only" aria-live="polite" aria-atomic="true">
                {statusText}
              </div>

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          </section>

          <aside className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Status</p>
                <h2 className={styles.panelTitle}>{copy.title}</h2>
              </div>
              {job?.jobId ? (
                <button
                  className={styles.inlineAction}
                  onClick={() => void refreshStatus()}
                  type="button"
                >
                  Refresh now
                </button>
              ) : null}
            </div>

            <p className={styles.statusBody} role="status" aria-live="polite">
              {copy.description}
            </p>

            <div className={styles.rule} />

            <ol className={styles.timeline}>
              <li className={styles.timelineItem}>
                <span className={styles.timelineLabel}>1</span>
                <span>Upload the file.</span>
              </li>
              <li className={styles.timelineItem}>
                <span className={styles.timelineLabel}>2</span>
                <span>Process the audio.</span>
              </li>
              <li className={styles.timelineItem}>
                <span className={styles.timelineLabel}>3</span>
                <span>Open the transcript.</span>
              </li>
            </ol>

            {isStale ? (
              <>
                <div className={styles.rule} />
                <div className={styles.notice}>
                  <p className={styles.noticeTitle}>
                    This is taking longer than usual.
                  </p>
                  <p className={styles.noticeText}>
                    The current job has been active for{" "}
                    {formatElapsed(elapsedSeconds)}. You can check again now or
                    clear this session and upload a new file.
                  </p>
                  <div className={styles.noticeActions}>
                    <Button
                      className={styles.secondaryAction}
                      type="button"
                      variant="outline"
                      onClick={() => void refreshStatus()}
                    >
                      Check status
                    </Button>
                    <Button
                      className={styles.secondaryAction}
                      type="button"
                      variant="outline"
                      onClick={resetSession}
                    >
                      Start over
                    </Button>
                  </div>
                </div>
              </>
            ) : null}

            {job?.status === "completed" && job.transcriptUrl ? (
              <>
                <div className={styles.rule} />
                <div className={styles.result}>
                  <p className={styles.resultTitle}>Transcript link ready</p>
                  <a
                    className={styles.resultLink}
                    href={job.transcriptUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open transcript
                  </a>
                  {job.transcriptExpiresAt ? (
                    <p className={styles.resultMeta}>
                      Link expires at{" "}
                      {new Date(job.transcriptExpiresAt).toLocaleString()}.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            {job?.status === "failed" ? (
              <>
                <div className={styles.rule} />
                <p className={styles.error} role="alert">
                  {job.error ?? "The transcript job failed."}
                </p>
              </>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
