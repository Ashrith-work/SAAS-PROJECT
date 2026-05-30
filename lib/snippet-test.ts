// Pure, dependency-free helpers behind the "Test connection" feature on
// /agency/hotel/[id]/install. Kept out of the server action (which holds the
// Clerk/Prisma glue) so the detection + classification logic is unit-testable
// in isolation. NOTHING here touches the database or the signed-in user.

export type TestLevel = "green" | "yellow" | "red";

// ── SSRF guard ────────────────────────────────────────────────────────────────
// The URL we fetch is agency-supplied, so refuse anything that isn't a public
// http(s) host. Best-effort: doesn't re-resolve DNS or re-check after redirects,
// but covers the common foot-guns for an internal tool.
export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "::1" || host === "[::1]") return false;
  if (
    /^(127\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host)
  ) {
    return false;
  }
  return true;
}

// Fetch the homepage HTML with a hard timeout and a size cap so a huge or slow
// page can't hang or balloon the request.
export async function fetchHomepage(
  url: string,
): Promise<{ html: string | null; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "HotelTrack-ConnectionTest/1.0 (+https://hoteltrack.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return { html: null, error: `The site responded with HTTP ${res.status}.` };
    }
    const reader = res.body?.getReader();
    if (!reader) return { html: await res.text(), error: null };
    const decoder = new TextDecoder();
    let html = "";
    const MAX = 512 * 1024; // snippet lives in <head>, near the top
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.length >= MAX) {
        await reader.cancel();
        break;
      }
    }
    return { html, error: null };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { html: null, error: "The site took too long to respond (timed out)." };
    }
    return { html: null, error: "We couldn't load the website to check the code." };
  } finally {
    clearTimeout(timeout);
  }
}

// The install line is <script src=".../t.js?id=SITEID">. The siteId is an
// unguessable cuid, so requiring both "t.js" and the id is a strong match.
export function detectSnippet(html: string, siteId: string): boolean {
  return html.includes("t.js") && html.includes(siteId);
}

// Combine the two signals (snippet-on-page + events-received) into one traffic
// light. Deterministic and side-effect free.
export function classifyConnection(input: {
  snippetDetected: boolean;
  fetchError: string | null;
  eventsEver: number;
  recentEvents: number;
  checkedUrl: string;
}): { level: TestLevel; title: string; detail: string } {
  const { snippetDetected, fetchError, eventsEver, recentEvents, checkedUrl } = input;

  if (recentEvents > 0) {
    return {
      level: "green",
      title: "Connected and firing",
      detail: `We received ${recentEvents} event${
        recentEvents === 1 ? "" : "s"
      } in the last 30 minutes. Tracking is working.`,
    };
  }
  if (snippetDetected && eventsEver > 0) {
    return {
      level: "green",
      title: "Installed and working",
      detail:
        "The snippet is on your homepage and we've recorded events from it before. " +
        "Open the site to generate a fresh visit if you want to see live data.",
    };
  }
  if (snippetDetected && eventsEver === 0) {
    return {
      level: "yellow",
      title: "Installed, but no events yet",
      detail:
        "We found the snippet on your homepage but haven't recorded any events. " +
        "Visit the site in a browser (or make a test booking) — the first event " +
        "should arrive within a few seconds.",
    };
  }
  if (!snippetDetected && eventsEver > 0 && fetchError) {
    return {
      level: "yellow",
      title: "Receiving events (couldn't re-check the page)",
      detail: `Events are arriving, so tracking works — but we couldn't load ${checkedUrl} to confirm the code is still in place (${fetchError})`,
    };
  }
  if (!snippetDetected && eventsEver > 0) {
    return {
      level: "yellow",
      title: "Receiving events, snippet not seen on homepage",
      detail:
        "Events are arriving, so tracking is working — but we didn't see the " +
        "snippet in the homepage HTML. That's normal if it loads via a tag " +
        "manager, or if it's only on other pages. No action needed.",
    };
  }
  if (fetchError) {
    return {
      level: "red",
      title: "Couldn't reach the site, and no events yet",
      detail: `${fetchError} We also haven't received any events from this hotel. Check the website URL and that the snippet is installed.`,
    };
  }
  return {
    level: "red",
    title: "Not installed",
    detail:
      "The snippet isn't in your homepage HTML and we haven't received any " +
      "events. Paste the snippet just before </head> on every page and redeploy.",
  };
}
