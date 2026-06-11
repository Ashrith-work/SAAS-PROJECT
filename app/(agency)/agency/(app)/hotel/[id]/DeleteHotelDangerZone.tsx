"use client";

import { useActionState, useState } from "react";
import { softDeleteHotel, type DeleteHotelState } from "../../settings/actions";

// Admin-only "Danger Zone" for soft-deleting a hotel. The parent page only
// renders this for admins; the server action re-checks the role, so hiding it
// here is UX, not the security boundary. The Delete button stays disabled until
// the typed name matches the hotel name exactly (case-sensitive).

const initial: DeleteHotelState = { error: null, ok: false };

const ERROR_TEXT: Record<string, string> = {
  WRONG_NAME: "The name doesn't match. Type the hotel's name exactly.",
  ALREADY_DELETED: "This hotel has already been deleted.",
  NOT_FOUND: "Hotel not found.",
  UNAUTHORIZED: "You don't have permission to delete this hotel.",
  SESSION: "Your session expired — please sign in again.",
};

export function DeleteHotelDangerZone({
  hotelId,
  hotelName,
}: {
  hotelId: string;
  hotelName: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(softDeleteHotel, initial);

  const matches = typed === hotelName;

  return (
    <section className="rounded-xl border border-danger/40 bg-danger/5 p-6">
      <h2 className="text-lg font-semibold text-danger">Delete this hotel</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
        Soft delete this hotel. All data and integrations will be hidden but
        preserved. You can restore it later by contacting support. This action
        cannot be undone by you.
      </p>
      <button
        type="button"
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        className="mt-4 rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
      >
        Delete Hotel
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Delete ${hotelName}`}
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-ink">Delete {hotelName}?</h3>
            <p className="mt-2 text-sm text-ink-secondary">
              This will hide the hotel and stop all data syncing. Tracking data,
              attribution history, and connected integrations will be preserved
              but inaccessible until restored.
            </p>

            <form action={action} className="mt-4 space-y-3">
              <input type="hidden" name="hotelClientId" value={hotelId} />
              <div>
                <input
                  name="confirmationName"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type the hotel's name to confirm"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink outline-none focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
                />
                <p className="mt-1 text-xs text-ink-tertiary">
                  Type the name exactly:{" "}
                  <span className="font-mono text-ink-secondary">{hotelName}</span>
                </p>
              </div>

              <textarea
                name="reason"
                rows={2}
                placeholder="Reason for deletion (optional, for your records)"
                maxLength={500}
                className="w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />

              {state.error && (
                <p className="text-sm text-danger">
                  {ERROR_TEXT[state.error] ?? "Couldn't delete the hotel. Please try again."}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-elevated"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!matches || pending}
                  className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Deleting…" : "Delete Hotel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
