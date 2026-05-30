// Runs once when a Next.js server instance starts (before it serves requests).
// We use it to install the global secret-redaction safety net (Layer 3): every
// console.error/warn/log argument is scrubbed of recognizable tokens before it
// is written, so an honest mistake can't leak a secret into the logs. This also
// covers Next.js's own server-error logging, which goes through console.error.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installConsoleRedaction } = await import("./lib/redact");
    installConsoleRedaction();

    // Fail fast (refuse to start) if the encryption key is missing or too short
    // — guards against running with a key like "test"/"dev" or a typo (Layer 5).
    const { assertEncryptionKeysValid } = await import("./lib/encryption");
    assertEncryptionKeysValid();
  }
}

// Global server-error hook. The error reaches the logs via console.error (now
// redacted by register() above); this is also the place to forward to an
// external reporter (Sentry, etc.) — always pass it through redactErrorMessage.
export const onRequestError = async (err: unknown) => {
  const { redactErrorMessage } = await import("./lib/redact");
  // Example: Sentry.captureMessage(redactErrorMessage(err))
  void redactErrorMessage(err);
};
