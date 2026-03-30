import { useState, useEffect, useCallback } from "react";
import "./index.css";
import ImageUpload from "./components/ImageUpload";
import DetectionResult from "./components/DetectionResult";
import ComplianceSummary from "./components/ComplianceSummary";
import ThemeToggle from "./components/ThemeToggle";
import StatusBadge from "./components/StatusBadge";
import { connectToBackend, detectPPE } from "./api";

/**
 * Extract frames from a video file at a given FPS using canvas.
 * Returns an array of Blobs (JPEG images).
 */
function extractFrames(videoFile, fps = 2) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    video.src = url;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const interval = 1 / fps;
      const timestamps = [];
      for (let t = 0; t < duration; t += interval) {
        timestamps.push(t);
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const frames = [];
      let i = 0;

      video.onseeked = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            frames.push(blob);
            i++;
            if (i < timestamps.length) {
              video.currentTime = timestamps[i];
            } else {
              URL.revokeObjectURL(url);
              resolve(frames);
            }
          },
          "image/jpeg",
          0.85
        );
      };

      // Start seeking to first timestamp
      video.currentTime = timestamps[0];
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video for frame extraction."));
    };
  });
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
  const [videoFrameResults, setVideoFrameResults] = useState([]); // array of { annotatedImage, summary }
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ppe-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    connectToBackend()
      .then(() => setBackendStatus("ready"))
      .catch(() => setBackendStatus("error"));
  }, []);

  // Image detection (existing flow)
  const handleImageSubmit = useCallback(async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await detectPPE(image, confidence);
      setResult({ annotatedImage: data[0], summary: data[1] });
    } catch (err) {
      setError(err.message || "Detection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [image, confidence]);

  // Video detection: extract frames, send one-by-one
  const handleVideoSubmit = useCallback(async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setVideoFrameResults([]);
    setCurrentFrameIndex(0);

    try {
      const frames = await extractFrames(image, 2);
      setVideoProgress({ current: 0, total: frames.length });

      const results = [];
      for (let i = 0; i < frames.length; i++) {
        setVideoProgress({ current: i + 1, total: frames.length });
        const data = await detectPPE(frames[i], confidence);
        const frameResult = { annotatedImage: data[0], summary: data[1] };
        results.push(frameResult);
        setVideoFrameResults([...results]);
      }
    } catch (err) {
      setError(err.message || "Video detection failed. Please try again.");
    } finally {
      setLoading(false);
      setVideoProgress(null);
    }
  }, [image, confidence]);

  const handleSubmit = isVideo ? handleVideoSubmit : handleImageSubmit;

  const handleClear = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setIsVideo(false);
    setVideoProgress(null);
    setVideoFrameResults([]);
    setCurrentFrameIndex(0);
  };

  // Aggregate video summaries
  const aggregatedSummary = videoFrameResults.length > 0
    ? buildAggregatedSummary(videoFrameResults)
    : null;

  // Current frame result for display
  const currentFrameResult = videoFrameResults[currentFrameIndex] || null;

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-10 border-b backdrop-blur-sm"
        style={{
          backgroundColor: "color-mix(in srgb, var(--bg-primary) 85%, transparent)",
          borderColor: "var(--border)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦺</span>
            <h1 className="text-lg font-semibold md:text-xl">PPE Compliance Detector</h1>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge status={backendStatus} />
            <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Description */}
        <p className="mb-8 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Upload a construction site image or short video (max 10s) to detect hard hats and safety vests.
          The model identifies PPE violations and highlights them with bounding boxes.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Upload + Controls */}
          <div className="flex flex-col gap-4">
            <ImageUpload
              preview={preview}
              onImageSelect={(file, previewUrl) => {
                setImage(file);
                setPreview({ url: previewUrl, isVideo: false });
                setIsVideo(false);
                setResult(null);
                setError(null);
                setVideoFrameResults([]);
              }}
              onVideoSelect={(file, previewUrl) => {
                setImage(file);
                setPreview({ url: previewUrl, isVideo: true });
                setIsVideo(true);
                setResult(null);
                setError(null);
                setVideoFrameResults([]);
              }}
              onClear={handleClear}
            />

            {/* Confidence slider */}
            <div
              className="rounded-xl p-4 border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Confidence Threshold</label>
                <span
                  className="text-sm font-mono px-2 py-0.5 rounded"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  {confidence.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
                className="w-full accent-orange-600"
              />
              <div className="flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                <span>0.1 (more detections)</span>
                <span>0.9 (fewer, higher confidence)</span>
              </div>
            </div>

            {/* Video progress bar */}
            {videoProgress && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
                  <span>Processing frames...</span>
                  <span>{videoProgress.current}/{videoProgress.total}</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(videoProgress.current / videoProgress.total) * 100}%`,
                      backgroundColor: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!image || loading || backendStatus !== "ready"}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: !image || loading ? undefined : "var(--accent)",
                ...((!image || loading) ? { backgroundColor: "var(--border)" } : {}),
              }}
              onMouseEnter={(e) => {
                if (image && !loading) e.target.style.backgroundColor = "var(--accent-hover)";
              }}
              onMouseLeave={(e) => {
                if (image && !loading) e.target.style.backgroundColor = "var(--accent)";
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {videoProgress ? `Detecting frame ${videoProgress.current}/${videoProgress.total}...` : "Detecting..."}
                </span>
              ) : (
                isVideo ? "Detect PPE in Video" : "Detect PPE"
              )}
            </button>

            {backendStatus === "connecting" && (
              <p className="text-sm text-center" style={{ color: "var(--warning)" }}>
                Backend is waking up... this may take a minute.
              </p>
            )}
          </div>

          {/* Right column: Results */}
          <div className="flex flex-col gap-4">
            {error && (
              <div
                className="rounded-xl p-4 border text-sm"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
              >
                {error}
              </div>
            )}

            {/* IMAGE result */}
            {!isVideo && (
              <>
                <DetectionResult
                  annotatedImage={result?.annotatedImage}
                  loading={loading}
                />
                <ComplianceSummary
                  summary={result?.summary}
                  loading={loading}
                />
              </>
            )}

            {/* VIDEO results: frame navigator */}
            {isVideo && videoFrameResults.length > 0 && (
              <>
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
                >
                  <div
                    className="px-4 py-2 border-b text-sm font-medium flex items-center justify-between"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    <span>Frame {currentFrameIndex + 1} of {videoFrameResults.length}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentFrameIndex(Math.max(0, currentFrameIndex - 1))}
                        disabled={currentFrameIndex === 0}
                        className="px-2 py-0.5 rounded text-xs font-medium disabled:opacity-30"
                        style={{ backgroundColor: "var(--border)" }}
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setCurrentFrameIndex(Math.min(videoFrameResults.length - 1, currentFrameIndex + 1))}
                        disabled={currentFrameIndex === videoFrameResults.length - 1}
                        className="px-2 py-0.5 rounded text-xs font-medium disabled:opacity-30"
                        style={{ backgroundColor: "var(--border)" }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  <div className="min-h-48 flex items-center justify-center p-4">
                    {currentFrameResult?.annotatedImage && (
                      <img
                        src={currentFrameResult.annotatedImage.url || currentFrameResult.annotatedImage}
                        alt={`Detection result frame ${currentFrameIndex + 1}`}
                        className="w-full max-h-96 object-contain"
                      />
                    )}
                  </div>
                </div>

                <ComplianceSummary
                  summary={aggregatedSummary}
                  loading={loading}
                />
              </>
            )}

            {/* Video placeholder before results */}
            {isVideo && videoFrameResults.length === 0 && !loading && (
              <DetectionResult annotatedImage={null} loading={false} />
            )}
            {isVideo && videoFrameResults.length === 0 && loading && (
              <DetectionResult annotatedImage={null} loading={true} />
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <p>
            YOLO11s (ONNX) &middot; 93.2% test mAP50 &middot; 5 classes &middot;{" "}
            <a
              href="https://huggingface.co/nduka1999/nd_ppe_yolo11s"
              target="_blank"
              rel="noopener"
              style={{ color: "var(--accent)" }}
            >
              Model Card
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

/**
 * Aggregate summaries across all video frames into a single report.
 */
function buildAggregatedSummary(frameResults) {
  const summaries = frameResults.map((r) => r.summary).filter(Boolean);
  if (summaries.length === 0) return null;

  let violationFrames = 0;
  let compliantFrames = 0;

  for (const s of summaries) {
    if (s.includes("VIOLATION")) {
      violationFrames++;
    } else {
      compliantFrames++;
    }
  }

  const total = summaries.length;
  const lines = [
    `VIDEO ANALYSIS — ${total} frames processed`,
    ``,
    `Frames with violations: ${violationFrames}/${total}`,
    `Fully compliant frames: ${compliantFrames}/${total}`,
    ``,
  ];

  if (violationFrames > 0) {
    lines.push("VIOLATIONS DETECTED across video frames.");
    lines.push("Use the frame navigator above to review individual detections.");
  } else {
    lines.push("ALL CLEAR — No violations detected in any frame.");
  }

  return lines.join("\n");
}

export default App;
