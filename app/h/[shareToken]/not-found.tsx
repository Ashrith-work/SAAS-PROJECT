// Friendly 404 boundary for the public share-link dashboard. The page calls
// notFound() when a token is unknown, revoked, soft-deleted, or belongs to a
// suspended agency — returning a real HTTP 404 (never revealing which reason),
// while still showing a calm, non-technical message.
export default function ShareLinkNotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-disabled">HotelTrack</p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
        This link is no longer active
      </h1>
      <p className="mt-2 text-sm text-ink-tertiary">
        Contact your marketing agency for a new link.
      </p>
    </main>
  );
}
