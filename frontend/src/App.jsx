import { useState, useEffect, useCallback } from "react";
import "./index.css";
import ImageUpload from "./components/ImageUpload";
import { MAX_VIDEO_SECONDS } from "./config";
import DetectionResult from "./components/DetectionResult";
import ComplianceSummary from "./components/ComplianceSummary";
import VideoResult from "./components/VideoResult";
import VideoComplianceSummary from "./components/VideoComplianceSummary";
import ThemeToggle from "./components/ThemeToggle";
import StatusBadge from "./components/StatusBadge";
import { ensureBackendReady, detectPPE, detectPPEVideo, describeError } from "./api";

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
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [confidence, setConfidence] = useState(0.25);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const handleFileSelect = (selected, previewUrl, video) => {
    if (preview?.url?.startsWith("blob:")) URL.revokeObjectURL(preview.url);
    setFile(selected);
    setPreview({ url: previewUrl, isVideo: video });
    setIsVideo(video);
    setResult(null);
    setError(null);
  };

  const handleClear = () => {
    if (preview?.url?.startsWith("blob:")) URL.revokeObjectURL(preview.url);
    setFile(null);
    setPreview(null);
    setIsVideo(false);
    setResult(null);
    setError(null);
  };

  const loadExample = async () => {
    try {
      const res = await fetch("/example.jpg");
      const blob = await res.blob();
      const example = new File([blob], "example.jpg", { type: "image/jpeg" });
      handleFileSelect(example, URL.createObjectURL(example), false);
    } catch {
      setError("Could not load the example image.");
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(isVideo ? await detectPPEVideo(file, confidence)
                        : await detectPPE(file, confidence));
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [file, isVideo, confidence]);

  return (
    <div className="min-h-screen bg-surface text-ink transition-colors duration-300">
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
          Upload a construction-site photo or a clip of up to {MAX_VIDEO_SECONDS} seconds.
          Workers are checked for hard hats and high-visibility vests, and any missing
          equipment is flagged directly on the image or video.{" "}
          <button
            onClick={loadExample}
            className="font-medium text-accent underline hover:text-accent-hover"
          >
            Try an example image
          </button>
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: upload + controls */}
          <div className="flex flex-col gap-4">
            <ImageUpload
              preview={preview}
              onImageSelect={(f, url) => handleFileSelect(f, url, false)}
              onVideoSelect={(f, url) => handleFileSelect(f, url, true)}
              onClear={handleClear}
            />

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

            {isVideo && !loading && !result && (
              <p className="text-sm text-ink-muted">
                Your clip comes back with detections marked on every frame.
                A {MAX_VIDEO_SECONDS}-second clip takes about a minute to analyze.
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!file || loading || backendStatus !== "ready"}
              className="w-full rounded-xl bg-accent py-3 font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isVideo ? "Analyzing video…" : "Analyzing…"}
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
                  ? "Waking the service after a period of inactivity — this can take a minute or two."
                  : "Getting things ready…"}
              </p>
            )}
          </div>

          {/* Right: results */}
          <div className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl border border-danger p-4 text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            {isVideo ? (
              <>
                <VideoResult annotatedUrl={result?.annotatedUrl} loading={loading} />
                <VideoComplianceSummary report={result?.report} loading={loading} />
              </>
            ) : (
              <>
                <DetectionResult annotatedUrl={result?.annotatedUrl} loading={loading} />
                <ComplianceSummary report={result?.report} loading={loading} />
              </>
            )}
          </div>
        </div>

        <footer className="mt-12 border-t border-line pt-6 text-center text-sm text-ink-muted">
          <p>
            Automated PPE compliance screening for construction sites ·{" "}
            <a
              href="https://github.com/Nduka99/ppe_compliance_detection"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              How it works
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
