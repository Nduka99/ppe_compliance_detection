export default function ComplianceSummary({ summary, loading }) {
  if (loading) return null;
  if (!summary) return null;

  const hasViolations = summary.includes("VIOLATIONS");

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: hasViolations ? "var(--danger)" : "var(--success)",
      }}
    >
      <div
        className="px-4 py-2 border-b text-sm font-medium"
        style={{
          borderColor: "var(--border)",
          color: hasViolations ? "var(--danger)" : "var(--success)",
        }}
      >
        {hasViolations ? "Violations Found" : "All Clear"}
      </div>

      <div className="p-4">
        <pre
          className="text-sm whitespace-pre-wrap font-sans leading-relaxed"
          style={{ color: "var(--text-primary)" }}
        >
          {summary}
        </pre>
      </div>
    </div>
  );
}
