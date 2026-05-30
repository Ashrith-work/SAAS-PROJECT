// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — secret redaction for logs / error messages.
//
// The SecretToken class (lib/encryption.ts) stops accidental logging of a
// DECRYPTED token. This is the second line of defense: it scrubs raw secret
// material that may have leaked into a string — e.g. a Graph API error that
// echoes the access_token, or a token someone interpolated into an Error — so it
// never reaches the logs, an alert email, or an external error reporter.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_PATTERNS: RegExp[] = [
  /EAA[A-Za-z0-9]{20,}/g, // Meta Graph API access tokens (EAA…)
  /IGAA[A-Za-z0-9]{20,}/g, // Instagram "API with Instagram Login" tokens (IGAA…)
];

const REDACTED = "[REDACTED-TOKEN]";

/** Replace any recognizable token in a string with [REDACTED-TOKEN]. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const re of TOKEN_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

/** Redact secrets from a value of any shape before logging it. */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (value instanceof Error) {
    // Build a shallow clone so we don't mutate the original error's message.
    const clone = new Error(redactSecrets(value.message));
    clone.name = value.name;
    if (value.stack) clone.stack = redactSecrets(value.stack);
    return clone;
  }
  return value;
}

/** A redacted, log-safe message for an unknown error. */
export function redactErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return redactSecrets(msg);
}

// ── Global safety net ────────────────────────────────────────────────────────
// Wrap console.{error,warn,log} so ANY string/Error argument is scrubbed before
// it is written. This is the "honest mistake" backstop: even code that has never
// heard of SecretToken can't leak a recognizable token to the logs. Installed
// once from instrumentation.ts (server runtime only).

let installed = false;

export function installConsoleRedaction(): void {
  if (installed) return;
  installed = true;

  const wrap = (orig: (...args: unknown[]) => void) =>
    function (this: unknown, ...args: unknown[]) {
      try {
        orig.apply(this, args.map(redactValue));
      } catch {
        // Never let redaction break logging — fall back to the raw call.
        orig.apply(this, args);
      }
    };

  console.error = wrap(console.error.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.log = wrap(console.log.bind(console));
}
