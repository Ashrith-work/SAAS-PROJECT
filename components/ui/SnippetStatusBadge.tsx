const STYLES: Record<string, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-success/15 text-success" },
  not_installed: { label: "Not installed", cls: "bg-elevated text-ink-tertiary" },
  error: { label: "Error", cls: "bg-danger/15 text-danger" },
};

export function SnippetStatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? {
    label: status,
    cls: "bg-elevated text-ink-tertiary",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
