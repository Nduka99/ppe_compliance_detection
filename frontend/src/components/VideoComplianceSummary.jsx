import { prettyLabel } from "../labels";

function CountRow({ item, tone, totalFrames }) {
  const share = totalFrames ? Math.round((item.frames / totalFrames) * 100) : 0;
  return (
    <li className="flex items-center gap-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${tone === "danger" ? "bg-danger" : "bg-success"}`}
        aria-hidden="true"
      />
      <span>{prettyLabel(item.label)}</span>
      <span className="ml-auto whitespace-nowrap font-mono text-xs text-ink-muted">
        {item.frames} frames ({share}%)
      </span>
    </li>
  );
}

export default function VideoComplianceSummary({ report, loading }) {
  if (loading || !report) return null;

  const {
    framesAnalyzed,
    framesWithViolations,
    violations,
    compliant,
    peakWorkers,
    durationSeconds,
    hasViolations,
    rawSummary,
  } = report;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-card ${
        hasViolations ? "border-danger" : "border-success"
      }`}
    >
      <div
        className={`border-b border-line px-4 py-2 text-sm font-medium ${
          hasViolations ? "text-danger" : "text-success"
        }`}
      >
        {hasViolations ? "Violations found" : "All clear"}
      </div>

      <div className="flex flex-col gap-4 p-4 text-sm">
        <p>
          {hasViolations
            ? `PPE violations appear in ${framesWithViolations} of ${framesAnalyzed} analyzed frames.`
            : `No PPE violations across ${framesAnalyzed} analyzed frames.`}
        </p>

        {violations.length > 0 && (
          <div>
            <p className="mb-2 font-medium">Violations</p>
            <ul className="flex flex-col gap-1.5">
              {violations.map((v) => (
                <CountRow key={v.label} item={v} tone="danger" totalFrames={framesAnalyzed} />
              ))}
            </ul>
          </div>
        )}

        {compliant.length > 0 && (
          <div>
            <p className="mb-2 font-medium">Compliant equipment</p>
            <ul className="flex flex-col gap-1.5">
              {compliant.map((c) => (
                <CountRow key={c.label} item={c} tone="success" totalFrames={framesAnalyzed} />
              ))}
            </ul>
          </div>
        )}

        {rawSummary && (
          <pre className="whitespace-pre-wrap font-sans leading-relaxed">{rawSummary}</pre>
        )}

        <p className="border-t border-line pt-3 text-ink-muted">
          Peak of {peakWorkers} {peakWorkers === 1 ? "worker" : "workers"} in frame
          {durationSeconds ? ` · ${durationSeconds.toFixed(1)}s clip` : ""}
        </p>
      </div>
    </div>
  );
}
