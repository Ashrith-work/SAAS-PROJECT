"use client";

import { useActionState, useState } from "react";
import { saveNotificationSettings, type NotificationState } from "./actions";

const initial: NotificationState = { error: null, ok: false };

const inputCls =
  "mt-1 w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-disabled focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function Toggle({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-brand" />
      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
    </label>
  );
}

export function NotificationSettings({
  ownerEmail,
  alertEmailAddress,
  emailAlertsEnabled,
  slackEnabled,
  slackWebhookUrl,
  lastTest,
}: {
  ownerEmail: string;
  alertEmailAddress: string;
  emailAlertsEnabled: boolean;
  slackEnabled: boolean;
  slackWebhookUrl: string;
  /** Server-formatted last Slack test outcome, e.g. "Success — 5 minutes ago". */
  lastTest: { ok: boolean; label: string } | null;
}) {
  const [state, action, pending] = useActionState(saveNotificationSettings, initial);
  const [emailOn, setEmailOn] = useState(emailAlertsEnabled);
  const [slackOn, setSlackOn] = useState(slackEnabled);
  const [webhook, setWebhook] = useState(slackWebhookUrl);

  // Live "Test connection" state (overrides the persisted lastTest once clicked).
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; label: string } | null>(null);

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/agency/slack/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhook }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setTestResult(
        data.ok
          ? { ok: true, label: "Success — check your Slack channel just now" }
          : { ok: false, label: data.error ?? "Test failed." },
      );
    } catch {
      setTestResult({ ok: false, label: "Couldn't reach the server to run the test." });
    } finally {
      setTesting(false);
    }
  }

  const shownTest = testResult ?? lastTest;

  return (
    <form action={action} className="space-y-6">
      {/* Email alerts */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Send email notifications</p>
            <p className="mt-0.5 text-xs text-ink-tertiary">
              Budget alerts are emailed to the address below.
            </p>
          </div>
          <Toggle name="emailAlertsEnabled" checked={emailOn} onChange={setEmailOn} />
        </div>
        <div>
          <label htmlFor="alertEmailAddress" className="block text-sm font-medium text-ink-secondary">
            Alert email address
          </label>
          <input
            id="alertEmailAddress"
            name="alertEmailAddress"
            type="email"
            defaultValue={alertEmailAddress}
            placeholder={ownerEmail}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-ink-tertiary">
            Defaults to the agency owner email ({ownerEmail}) if left blank.
          </p>
        </div>
      </div>

      <div className="border-t border-line" />

      {/* Slack alerts */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Enable Slack notifications</p>
            <p className="mt-0.5 text-xs text-ink-tertiary">
              Budget alerts post to one Slack channel via an Incoming Webhook.
            </p>
          </div>
          <Toggle name="slackEnabled" checked={slackOn} onChange={setSlackOn} />
        </div>

        {slackOn && (
          <div className="space-y-3 rounded-lg border border-line bg-page p-3">
            <div>
              <label htmlFor="slackWebhookUrl" className="block text-sm font-medium text-ink-secondary">
                Slack Incoming Webhook URL
              </label>
              <input
                id="slackWebhookUrl"
                name="slackWebhookUrl"
                type="url"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-ink-tertiary">
                To get this: Open Slack → Apps → Search &ldquo;Incoming Webhooks&rdquo; → Add →
                Pick channel → Copy URL.{" "}
                <a
                  href="https://api.slack.com/messaging/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink"
                >
                  Slack docs
                </a>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runTest}
                disabled={testing}
                className="rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-line-strong disabled:opacity-60"
              >
                {testing ? "Testing…" : "Test connection"}
              </button>
              {shownTest && (
                <span className={`text-xs ${shownTest.ok ? "text-success" : "text-danger"}`}>
                  {shownTest.ok ? "✓ " : "✕ "}
                  {testResult ? shownTest.label : `Last test: ${shownTest.label}`}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-tertiary">
              Testing also saves this webhook. Other settings save with the button below.
            </p>
          </div>
        )}
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save notification settings"}
        </button>
        {state.ok && <span className="text-xs text-success">Saved ✓</span>}
      </div>
    </form>
  );
}
