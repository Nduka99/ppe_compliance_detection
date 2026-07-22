export default function VideoResult({ annotatedUrl, loading }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="border-b border-line px-4 py-2 text-sm font-medium text-ink-muted">
        Annotated video
      </div>

      <div className="flex min-h-48 items-center justify-center p-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-ink-muted" role="status">
            <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Analyzing video…</span>
            <span className="text-xs">Every frame is checked — this usually takes about a minute.</span>
          </div>
        ) : annotatedUrl ? (
          <video
            src={annotatedUrl}
            className="max-h-96 w-full rounded-lg object-contain"
            controls
            playsInline
            loop
          />
        ) : (
          <p className="text-sm text-ink-muted">
            Upload a clip and run detection to see the annotated video here.
          </p>
        )}
      </div>

      {annotatedUrl && !loading && (
        <div className="border-t border-line px-4 py-2">
          <a
            href={annotatedUrl}
            download="ppe-annotated.mp4"
            className="text-sm text-accent hover:text-accent-hover"
          >
            Download annotated video
          </a>
        </div>
      )}
    </div>
  );
}
