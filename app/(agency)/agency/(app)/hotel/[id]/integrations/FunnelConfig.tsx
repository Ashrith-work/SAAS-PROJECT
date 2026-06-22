"use client";

import { useActionState, useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { STAGES, STAGE_LABEL, SENSIBLE_DEFAULTS, type FunnelRule, type FunnelStage } from "@/lib/funnel";
import { saveFunnelRules, type FunnelRulesState } from "./funnel-actions";

const initial: FunnelRulesState = { error: null, ok: false };

const inputCls =
  "w-full rounded-lg border border-line-strong bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-disabled focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const selectCls =
  "rounded-lg border border-line-strong bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

const ATTR_EXAMPLE = `<body data-ht-stage="awareness">`;

// "Funnel Stages" card body: documents the data-ht-stage method + an editable
// URL-pattern → stage table that persists to HotelClient.funnelStageRules.
export function FunnelConfig({
  hotelId,
  initialRules,
}: {
  hotelId: string;
  initialRules: FunnelRule[];
}) {
  const [state, action, pending] = useActionState(saveFunnelRules, initial);
  const [rules, setRules] = useState<FunnelRule[]>(initialRules);

  const addRule = () => setRules((r) => [...r, { urlPattern: "", stage: "awareness" }]);
  const removeRule = (i: number) => setRules((r) => r.filter((_, idx) => idx !== i));
  const setPattern = (i: number, v: string) =>
    setRules((r) => r.map((rule, idx) => (idx === i ? { ...rule, urlPattern: v } : rule)));
  const setStage = (i: number, v: FunnelStage) =>
    setRules((r) => r.map((rule, idx) => (idx === i ? { ...rule, stage: v } : rule)));

  // Only well-formed rows are submitted (the action re-validates server-side).
  const cleaned = rules.filter((r) => r.urlPattern.trim().length > 0);

  return (
    <div className="space-y-5">
      {/* Method A — HTML attribute */}
      <div className="rounded-lg border border-line bg-page p-4">
        <p className="text-sm font-medium text-ink">Method A — HTML attribute (recommended)</p>
        <p className="mt-1 text-xs text-ink-tertiary">
          Add a <code className="text-xs">data-ht-stage</code> attribute to any element
          (usually <code className="text-xs">&lt;body&gt;</code>) on each page. HotelTrack
          detects the stage automatically — no rules needed below.
        </p>
        <div className="mt-2 flex items-start gap-2">
          <code className="block flex-1 overflow-x-auto rounded-lg bg-code px-3 py-2 text-xs text-codeink">
            {ATTR_EXAMPLE}
          </code>
          <CopyButton text={ATTR_EXAMPLE} />
        </div>
        <p className="mt-2 text-xs text-ink-tertiary">
          Valid stages: {STAGES.map((s) => <code key={s} className="mx-0.5 text-xs">{s}</code>)}
        </p>
      </div>

      {/* Method B — URL pattern rules */}
      <form action={action} className="space-y-3">
        <input type="hidden" name="hotelId" value={hotelId} />
        <input type="hidden" name="rules" value={JSON.stringify(cleaned)} />

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">Method B — URL patterns</p>
          <button
            type="button"
            onClick={() => setRules(SENSIBLE_DEFAULTS.map((r) => ({ ...r })))}
            className="text-xs font-medium text-brand hover:underline"
          >
            Sensible defaults
          </button>
        </div>
        <p className="text-xs text-ink-tertiary">
          For sites you can&apos;t edit: map URL patterns to stages. Use{" "}
          <code className="text-xs">*</code> as a wildcard (e.g. <code className="text-xs">/rooms*</code>{" "}
          matches <code className="text-xs">/rooms</code> and <code className="text-xs">/rooms/deluxe</code>).
        </p>

        {rules.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="ht-table w-full text-left text-sm">
              <thead className="bg-card text-xs uppercase tracking-wide text-ink-tertiary">
                <tr>
                  <th className="px-3 py-2 font-medium">URL pattern</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-2">
                      <input
                        value={rule.urlPattern}
                        onChange={(e) => setPattern(i, e.target.value)}
                        placeholder="/rooms*"
                        className={inputCls}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={rule.stage}
                        onChange={(e) => setStage(i, e.target.value as FunnelStage)}
                        className={selectCls}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRule(i)}
                        className="rounded p-1 text-ink-tertiary hover:bg-line-strong"
                        aria-label="Remove rule"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          onClick={addRule}
          className="rounded-lg border border-line-strong bg-elevated px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-line-strong"
        >
          + Add rule
        </button>

        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save funnel rules"}
          </button>
          {state.ok && <span className="text-xs text-success">Saved ✓</span>}
        </div>
      </form>
    </div>
  );
}
