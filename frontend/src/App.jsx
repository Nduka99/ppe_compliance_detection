import { useState, useEffect, useCallback } from "react";
import "./index.css";
import ImageUpload from "./components/ImageUpload";
import DetectionResult from "./components/DetectionResult";
import ComplianceSummary from "./components/ComplianceSummary";
import ThemeToggle from "./components/ThemeToggle";
import StatusBadge from "./components/StatusBadge";
import { connectToBackend, detectPPE } from "./api";

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
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ppe-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    connectToBackend()
      .then(() => setBackendStatus("ready"))
      .catch(() => setBackendStatus("error"));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await detectPPE(image);
      setResult({ annotatedImage: data[0], summary: data[1] });
    } catch (err) {
      setError(err.message || "Detection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [image]);

  const handleClear = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

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
          Upload a construction site image to detect hard hats and safety vests.
          The model identifies PPE violations and highlights them with bounding boxes.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Upload + Controls */}
          <div className="flex flex-col gap-4">
            <ImageUpload
              preview={preview}
              onImageSelect={(file, previewUrl) => {
                setImage(file);
                setPreview(previewUrl);
                setResult(null);
                setError(null);
              }}
              onClear={handleClear}
            />

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
                  Detecting...
                </span>
              ) : (
                "Detect PPE"
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

            <DetectionResult
              annotatedImage={result?.annotatedImage}
              loading={loading}
            />

            <ComplianceSummary
              summary={result?.summary}
              loading={loading}
            />
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

export default App;
