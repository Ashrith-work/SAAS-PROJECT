"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveMetaToken, type SaveTokenState } from "./actions";

const initialState: SaveTokenState = { error: null, ok: false };

const inputCls =
  "w-full rounded-lg border border-line-strong bg-page px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-disabled outline-none focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function MetaTokenForm({
  hotelId,
  submitLabel = "Connect Meta",
}: {
  // Meta tokens are hotel-scoped: the token is saved for THIS hotel.
  hotelId: string;
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
      <input type="hidden" name="hotelId" value={hotelId} />
      <textarea
        name="accessToken"
        rows={3}
        spellCheck={false}
        autoComplete="off"
        placeholder="Paste your Meta access token (begins with EAA…)"
        className={inputCls}
      />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Validating…" : submitLabel}
        </button>
        <p className="text-xs text-ink-tertiary">
          Encrypted (AES-256-GCM) before storage. Never shown again or sent to
          your browser.
        </p>
      </div>
    </form>
  );
}
