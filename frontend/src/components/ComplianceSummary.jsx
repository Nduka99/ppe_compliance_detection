import { prettyLabel } from "../labels";

function DetectionRow({ item, tone }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full ${tone === "danger" ? "bg-danger" : "bg-success"}`}
        aria-hidden="true"
      />
      {prettyLabel(item.label)}
      <span className="ml-auto font-mono text-xs text-ink-muted">
        {Math.round(item.confidence * 100)}%
      </span>
    </li>
  );
}

export default function ComplianceSummary({ report, loading }) {
  if (loading || !report) return null;

  const { violations, compliant, workers, totalDetections, hasViolations, rawSummary } = report;

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
        {violations.length > 0 && (
          <div>
            <p className="mb-2 font-medium">PPE violations ({violations.length})</p>
            <ul className="flex flex-col gap-1.5">
              {violations.map((item, i) => (
                <DetectionRow key={`v-${i}`} item={item} tone="danger" />
              ))}
            </ul>
          </div>
        )}

        {compliant.length > 0 && (
          <div>
            <p className="mb-2 font-medium">Compliant equipment ({compliant.length})</p>
            <ul className="flex flex-col gap-1.5">
              {compliant.map((item, i) => (
                <DetectionRow key={`c-${i}`} item={item} tone="success" />
              ))}
            </ul>
          </div>
        )}

        {violations.length === 0 && compliant.length === 0 && !rawSummary && (
          <p className="text-ink-muted">No PPE detected in this image.</p>
        )}

        {/* Fallback for a backend that only returns a text summary */}
        {rawSummary && (
          <pre className="whitespace-pre-wrap font-sans leading-relaxed">{rawSummary}</pre>
        )}

        {workers !== null && (
          <p className="border-t border-line pt-3 text-ink-muted">
            {workers} {workers === 1 ? "worker" : "workers"} · {totalDetections}{" "}
            {totalDetections === 1 ? "detection" : "detections"} total
          </p>
        )}
      </div>
    </div>
  );
}
