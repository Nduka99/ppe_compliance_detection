export default function StatusBadge({ status }) {
  const config = {
    ready: { color: "var(--success)", label: "Backend Ready", dot: "bg-green-500" },
    connecting: { color: "var(--warning)", label: "Connecting...", dot: "bg-yellow-500" },
    error: { color: "var(--danger)", label: "Backend Error", dot: "bg-red-500" },
  };

  const { color, label, dot } = config[status] || config.error;

  return (
    <div className="flex items-center gap-2 text-xs font-medium" style={{ color }}>
      <span className={`w-2 h-2 rounded-full ${dot} ${status === "connecting" ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}
