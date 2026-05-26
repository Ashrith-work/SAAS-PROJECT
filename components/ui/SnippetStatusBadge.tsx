const STYLES: Record<string, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  not_installed: { label: "Not installed", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
  error: { label: "Error", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

export function SnippetStatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? {
    label: status,
    cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
