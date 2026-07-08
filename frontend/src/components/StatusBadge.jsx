const CONFIG = {
  connecting: { label: "Connecting", dotClass: "bg-warning animate-pulse", textClass: "text-warning" },
  waking: { label: "Waking backend", dotClass: "bg-warning animate-pulse", textClass: "text-warning" },
  ready: { label: "Online", dotClass: "bg-success", textClass: "text-success" },
  offline: { label: "Offline", dotClass: "bg-danger", textClass: "text-danger" },
};

export default function StatusBadge({ status, onRetry }) {
  const { label, dotClass, textClass } = CONFIG[status] ?? CONFIG.offline;

  return (
    <div className={`flex items-center gap-2 text-xs font-medium ${textClass}`}>
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      {label}
      {status === "offline" && onRetry && (
        <button
          onClick={onRetry}
          className="rounded border border-line px-1.5 py-0.5 text-ink-muted transition-colors hover:text-ink"
        >
          Retry
        </button>
      )}
    </div>
  );
}
