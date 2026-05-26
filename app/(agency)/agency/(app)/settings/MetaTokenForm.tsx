"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveMetaToken, type SaveTokenState } from "./actions";

const initialState: SaveTokenState = { error: null, ok: false };

const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";

export function MetaTokenForm({
  submitLabel = "Connect Meta",
}: {
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState(saveMetaToken, initialState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  // On success, clear the pasted token from the field and re-render the page so
  // it loads the now-connected state (ad accounts + mapping).
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <textarea
        name="accessToken"
        rows={3}
        spellCheck={false}
        autoComplete="off"
        placeholder="Paste your Meta access token (begins with EAA…)"
        className={inputCls}
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {pending ? "Validating…" : submitLabel}
        </button>
        <p className="text-xs text-zinc-500">
          Encrypted (AES-256-GCM) before storage. Never shown again or sent to
          your browser.
        </p>
      </div>
    </form>
  );
}
