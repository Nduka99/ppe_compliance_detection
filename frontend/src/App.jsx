import { useState, useEffect, useCallback } from "react";
import "./index.css";
import ImageUpload from "./components/ImageUpload";
import DetectionResult from "./components/DetectionResult";
import ComplianceSummary from "./components/ComplianceSummary";
import { prettyLabel } from "./labels";
import ThemeToggle from "./components/ThemeToggle";
import StatusBadge from "./components/StatusBadge";
import { ensureBackendReady, detectPPE, describeError } from "./api";

const FRAME_EXTRACTION_FPS = 2;
const FRAME_TIMEOUT_MS = 15000;

/**
 * Extract frames from a video file at a given FPS using a canvas.
 * Resolves to an array of JPEG Blobs. Guards against files that never fire
 * seek events (a watchdog timer) and videos with unusable duration metadata.
 */
function extractFrames(videoFile, fps = FRAME_EXTRACTION_FPS) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const url = URL.createObjectURL(videoFile);

    let watchdog = null;
    const fail = (message) => {
      clearTimeout(watchdog);
      URL.revokeObjectURL(url);
      reject(new Error(message));
    };
    const resetWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => fail("Timed out while reading video frames."), FRAME_TIMEOUT_MS);
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        return fail("Could not determine the video's length.");
      }

      // Start slightly past 0 — seeking to the exact current position does
      // not fire `seeked` in some browsers.
      const timestamps = [];
      for (let t = 0.01; t < duration; t += 1 / fps) {
        timestamps.push(Math.min(t, duration - 0.01));
      }
      if (timestamps.length === 0) {
        return fail("The video is too short to extract frames.");
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const frames = [];
      let i = 0;

      video.onseeked = () => {
        resetWatchdog();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) return fail("Could not capture a video frame.");
            frames.push(blob);
            i++;
            if (i < timestamps.length) {
              video.currentTime = timestamps[i];
            } else {
              clearTimeout(watchdog);
              URL.revokeObjectURL(url);
              resolve(frames);
            }
          },
          "image/jpeg",
          0.85
        );
      };

      resetWatchdog();
      video.currentTime = timestamps[0];
    };

    video.onerror = () => fail("Failed to load the video for frame extraction.");
    resetWatchdog();
    video.src = url;
  });
}

function aggregateVideoReports(frameResults) {
  const totalFrames = frameResults.length;
  const flaggedFrames = frameResults.filter((f) => f.report.hasViolations).length;
  const violationCounts = {};
  for (const f of frameResults) {
    for (const v of f.report.violations) {
      violationCounts[v.label] = (violationCounts[v.label] ?? 0) + 1;
    }
  }
  return { totalFrames, flaggedFrames, violationCounts };
}

function App() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ppe-theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });
  const [backendStatus, setBackendStatus] = useState("connecting");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confidence, setConfidence] = useState(0.25);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Video-specific state
  const [isVideo, setIsVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(null); // { current, total }
  const [videoFrameResults, setVideoFrameResults] = useState([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ppe-theme", dark ? "dark" : "light");
  }, [dark]);

  const initBackend = useCallback(() => {
    ensureBackendReady(setBackendStatus);
  }, []);

  useEffect(() => {
    initBackend();
  }, [initBackend]);

  const resetResults = () => {
    setResult(null);
    setError(null);
    setVideoFrameResults([]);
    setCurrentFrameIndex(0);
  };

  const handleFileSelect = (file, previewUrl, video) => {
    setImage(file);
    setPreview({ url: previewUrl, isVideo: video });
    setIsVideo(video);
    resetResults();
  };

  const handleClear = () => {
    if (preview?.url?.startsWith("blob:")) URL.revokeObjectURL(preview.url);
    setImage(null);
    setPreview(null);
    setIsVideo(false);
    setVideoProgress(null);
    resetResults();
  };

  const loadExample = async () => {
    try {
      const res = await fetch("/example.jpg");
      const blob = await res.blob();
      const file = new File([blob], "example.jpg", { type: "image/jpeg" });
      handleFileSelect(file, URL.createObjectURL(file), false);
    } catch {
      setError("Could not load the example image.");
    }
  };

  const handleImageSubmit = useCallback(async () => {
    if (!image) return;
    setLoading(true);
    resetResults();
    try {
      setResult(await detectPPE(image, confidence));
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [image, confidence]);

  const handleVideoSubmit = useCallback(async () => {
    if (!image) return;
    setLoading(true);
    resetResults();
    try {
      const frames = await extractFrames(image);
      setVideoProgress({ current: 0, total: frames.length });

      const results = [];
      for (let i = 0; i < frames.length; i++) {
        setVideoProgress({ current: i + 1, total: frames.length });
        results.push(await detectPPE(frames[i], confidence));
        setVideoFrameResults([...results]);
      }
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setLoading(false);
      setVideoProgress(null);
    }
  }, [image, confidence]);

  const handleSubmit = isVideo ? handleVideoSubmit : handleImageSubmit;

  const videoSummary =
    videoFrameResults.length > 0 ? aggregateVideoReports(videoFrameResults) : null;
  const currentFrameResult = videoFrameResults[currentFrameIndex] ?? null;

  return (
    <div className="min-h-screen bg-surface text-ink transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">🦺</span>
            <h1 className="text-lg font-semibold md:text-xl">PPE Compliance Detector</h1>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge status={backendStatus} onRetry={initBackend} />
            <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="mb-8 max-w-2xl text-ink-muted">
          Upload a construction-site photo or a short video clip. Workers are
          checked for hard hats and high-visibility vests, and any missing
          equipment is flagged on the image.{" "}
          <button
            onClick={loadExample}
            className="font-medium text-accent underline hover:text-accent-hover"
          >
            Try an example image
          </button>
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left column: upload + controls */}
          <div className="flex flex-col gap-4">
            <ImageUpload
              preview={preview}
              onImageSelect={(file, url) => handleFileSelect(file, url, false)}
              onVideoSelect={(file, url) => handleFileSelect(file, url, true)}
              onClear={handleClear}
            />

            {/* Sensitivity slider */}
            <div className="rounded-xl border border-line bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="confidence" className="text-sm font-medium">
                  Detection sensitivity
                </label>
                <span className="rounded bg-surface-alt px-2 py-0.5 font-mono text-sm">
                  {confidence.toFixed(2)}
                </span>
              </div>
              <input
                id="confidence"
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-ink-muted">
                <span>More detections</span>
                <span>Higher confidence</span>
              </div>
            </div>

            {isVideo && !loading && videoFrameResults.length === 0 && (
              <p className="text-sm text-ink-muted">
                Video frames are analyzed one by one on a shared server — a
                10-second clip takes about a minute.
              </p>
            )}

            {/* Video progress */}
            {videoProgress && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-sm text-ink-muted">
                  <span>Processing frames…</span>
                  <span>
                    {videoProgress.current}/{videoProgress.total}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${(videoProgress.current / videoProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!image || loading || backendStatus !== "ready"}
              className="w-full rounded-xl bg-accent py-3 font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {videoProgress
                    ? `Analyzing frame ${videoProgress.current} of ${videoProgress.total}…`
                    : "Analyzing…"}
                </span>
              ) : isVideo ? (
                "Detect PPE in video"
              ) : (
                "Detect PPE"
              )}
            </button>

            {(backendStatus === "connecting" || backendStatus === "waking") && (
              <p className="text-center text-sm text-warning">
                {backendStatus === "waking"
                  ? "The backend is waking up — this can take a minute or two."
                  : "Connecting to the detection service…"}
              </p>
            )}
          </div>

          {/* Right column: results */}
          <div className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl border border-danger p-4 text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            {!isVideo && (
              <>
                <DetectionResult annotatedUrl={result?.annotatedUrl} loading={loading} />
                <ComplianceSummary report={result?.report} loading={loading} />
              </>
            )}

            {isVideo && videoFrameResults.length > 0 && (
              <>
                <div className="overflow-hidden rounded-xl border border-line bg-card">
                  <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm font-medium text-ink-muted">
                    <span>
                      Frame {currentFrameIndex + 1} of {videoFrameResults.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentFrameIndex(Math.max(0, currentFrameIndex - 1))}
                        disabled={currentFrameIndex === 0}
                        className="rounded bg-line px-2 py-0.5 text-xs font-medium disabled:opacity-30"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() =>
                          setCurrentFrameIndex(
                            Math.min(videoFrameResults.length - 1, currentFrameIndex + 1)
                          )
                        }
                        disabled={currentFrameIndex === videoFrameResults.length - 1}
                        className="rounded bg-line px-2 py-0.5 text-xs font-medium disabled:opacity-30"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  <div className="flex min-h-48 items-center justify-center p-4">
                    {currentFrameResult?.annotatedUrl && (
                      <img
                        src={currentFrameResult.annotatedUrl}
                        alt={`Detection result for frame ${currentFrameIndex + 1}`}
                        className="max-h-96 w-full object-contain"
                      />
                    )}
                  </div>
                </div>

                {videoSummary && (
                  <div
                    className={`overflow-hidden rounded-xl border bg-card ${
                      videoSummary.flaggedFrames > 0 ? "border-danger" : "border-success"
                    }`}
                  >
                    <div
                      className={`border-b border-line px-4 py-2 text-sm font-medium ${
                        videoSummary.flaggedFrames > 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {videoSummary.flaggedFrames > 0 ? "Violations found" : "All clear"}
                    </div>
                    <div className="flex flex-col gap-2 p-4 text-sm">
                      <p>
                        {videoSummary.flaggedFrames > 0
                          ? `${videoSummary.flaggedFrames} of ${videoSummary.totalFrames} analyzed frames show PPE violations.`
                          : `No PPE violations in any of the ${videoSummary.totalFrames} analyzed frames.`}
                      </p>
                      {Object.keys(videoSummary.violationCounts).length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {Object.entries(videoSummary.violationCounts).map(([label, count]) => (
                            <li key={label} className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
                              {prettyLabel(label)}
                              <span className="text-ink-muted">× {count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {videoSummary.flaggedFrames > 0 && (
                        <p className="text-ink-muted">
                          Use the frame navigator above to review individual detections.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {isVideo && videoFrameResults.length === 0 && (
              <DetectionResult annotatedUrl={null} loading={loading} />
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-line pt-6 text-center text-sm text-ink-muted">
          <p>
            Open-source computer-vision demo ·{" "}
            <a
              href="https://huggingface.co/nduka1999/nd_ppe_yolo11s"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              Model card
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/Nduka99/ppe_compliance_detection"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              Source code
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
