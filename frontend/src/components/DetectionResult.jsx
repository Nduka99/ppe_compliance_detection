export default function DetectionResult({ annotatedUrl, loading }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="border-b border-line px-4 py-2 text-sm font-medium text-ink-muted">
        Detection result
      </div>

      <div className="flex min-h-48 items-center justify-center p-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-ink-muted" role="status">
            <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Running detection…</span>
          </div>
        ) : annotatedUrl ? (
          <img
            src={annotatedUrl}
            alt="Detection result with bounding boxes"
            className="max-h-96 w-full object-contain"
          />
        ) : (
          <p className="text-sm text-ink-muted">
            Results will appear here once you run a detection.
          </p>
        )}
      </div>
    </div>
  );
}
