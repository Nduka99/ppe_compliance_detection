export default function DetectionResult({ annotatedImage, loading }) {
  const imageUrl =
    annotatedImage?.url ||
    (typeof annotatedImage === "string" ? annotatedImage : null);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="px-4 py-2 border-b text-sm font-medium"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
      >
        Detection Result
      </div>

      <div className="min-h-48 flex items-center justify-center p-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3" style={{ color: "var(--text-secondary)" }}>
            <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Running detection...</span>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Detection result with bounding boxes"
            className="w-full max-h-96 object-contain"
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Upload an image and click Detect PPE to see results.
          </p>
        )}
      </div>
    </div>
  );
}
