"use client";

import { useState, useTransition } from "react";
import { regenerateAgencyInviteCode, setAgencyInviteStatus } from "./actions";

// Agency-side "Hotel Self-Signup" controls: show the invite code + URL with
// copy buttons, regenerate (disables the old code), and enable/disable toggle.
// The code is never editable by hand (security) — only regenerated.

type Invite = { hotelEmail: string | null; status: string; date: string };

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
      className="shrink-0 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function InviteCodeManager({
  initialCode,
  initialStatus,
  baseUrl,
  recentInvites,
}: {
  initialCode: string;
  initialStatus: string;
  baseUrl: string; // e.g. "https://www.hoteltrack.in/join/"
  recentInvites: Invite[];
}) {
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const url = `${baseUrl}${code}`;
  const disabled = status === "DISABLED";

  function regenerate() {
    if (!confirm("Generate a new code? The current code and link will stop working immediately.")) return;
    setError(null);
    startTransition(async () => {
      const r = await regenerateAgencyInviteCode();
      if (r.ok && r.code) { setCode(r.code); setStatus("ACTIVE"); }
      else setError(r.error ?? "Couldn't regenerate the code.");
    });
  }

  function toggle() {
    const next = disabled ? "ACTIVE" : "DISABLED";
    setError(null);
    startTransition(async () => {
      const r = await setAgencyInviteStatus(next);
      if (r.ok) setStatus(next);
      else setError(r.error ?? "Couldn't update self-signup.");
    });
  }

  const inputCls =
    "w-full rounded-lg border border-line-strong bg-page px-3 py-2 font-mono text-sm text-ink";

  return (
    <div className="space-y-4">
      {disabled && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink-secondary">
          Self-signup is <strong>disabled</strong> — the link below won&apos;t work until you re-enable it.
        </p>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink-secondary">Invite code</label>
        <div className="flex items-stretch gap-2">
          <input readOnly value={code} className={`${inputCls} text-base font-semibold tracking-wide ${disabled ? "opacity-50" : ""}`} />
          <CopyButton value={code} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink-secondary">Invite link</label>
        <div className="flex items-stretch gap-2">
          <input readOnly value={url} className={`${inputCls} ${disabled ? "opacity-50" : ""}`} />
          <CopyButton value={url} label="Copy URL" />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className="rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong disabled:opacity-60"
        >
          {pending ? "Working…" : "Generate New Code"}
        </button>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60 ${
            disabled ? "bg-brand text-white hover:bg-brand-hover" : "border border-line-strong bg-elevated text-ink-secondary hover:bg-line-strong"
          }`}
        >
          {disabled ? "Enable self-signup" : "Disable self-signup"}
        </button>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-secondary">Recent invitations</p>
        {recentInvites.length === 0 ? (
          <p className="rounded-lg border border-line bg-page px-3 py-4 text-sm text-ink-tertiary">
            No hotels have signed up via your link yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="ht-table w-full text-left text-sm">
              <thead className="bg-card text-xs uppercase tracking-wide text-ink-tertiary">
                <tr>
                  <th className="px-3 py-2 font-medium">Hotel email</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentInvites.map((inv, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{inv.hotelEmail ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${inv.status === "COMPLETED" ? "bg-success/15 text-success" : "bg-elevated text-ink-tertiary"}`}>
                        {inv.status === "COMPLETED" ? "Completed" : "Pending"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-tertiary">{inv.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
