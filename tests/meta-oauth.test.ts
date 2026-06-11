// Unit coverage for the Meta OAuth helpers that don't touch the network:
// the authorize-URL builder, the scope set (must stay minimal for App Review),
// and the manual-token expiry-warning state machine.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildMetaAuthorizeUrl,
  META_OAUTH_SCOPES,
  nextExpiryWarning,
} from "@/lib/meta";

const ENV_KEYS = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_OAUTH_REDIRECT_URI",
  "META_GRAPH_API_VERSION",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.META_APP_ID = "123456789";
  process.env.META_APP_SECRET = "secret";
  process.env.META_OAUTH_REDIRECT_URI = "https://www.hoteltrack.in/api/auth/meta/callback";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("buildMetaAuthorizeUrl", () => {
  it("builds a Facebook authorize URL with the exact registered params", () => {
    const url = new URL(buildMetaAuthorizeUrl("STATE123"));
    expect(url.host).toBe("www.facebook.com");
    expect(url.pathname).toMatch(/\/dialog\/oauth$/);
    expect(url.searchParams.get("client_id")).toBe("123456789");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://www.hoteltrack.in/api/auth/meta/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("STATE123");
    expect(url.searchParams.get("scope")).toBe("ads_read,business_management");
  });

  it("throws a clear error when the Meta app env vars are missing", () => {
    delete process.env.META_APP_ID;
    expect(() => buildMetaAuthorizeUrl("x")).toThrow(/META_APP_ID/);
  });

  it("does not request pages_show_list or any Instagram scope", () => {
    const scope = new URL(buildMetaAuthorizeUrl("x")).searchParams.get("scope") ?? "";
    expect(scope).not.toMatch(/pages_show_list/);
    expect(scope).not.toMatch(/instagram/);
    expect(META_OAUTH_SCOPES).toEqual(["ads_read", "business_management"]);
  });
});

describe("nextExpiryWarning (manual-token reminders, each sent once)", () => {
  it("returns 14d only the first time inside the 14-day window", () => {
    expect(nextExpiryWarning(13, null)).toBe("14d");
    expect(nextExpiryWarning(13, "14d")).toBeNull();
  });

  it("escalates to 7d, then suppresses once 7d was sent", () => {
    expect(nextExpiryWarning(6, "14d")).toBe("7d");
    expect(nextExpiryWarning(6, "7d")).toBeNull();
  });

  it("fires 'expired' at/after expiry, once", () => {
    expect(nextExpiryWarning(0, "7d")).toBe("expired");
    expect(nextExpiryWarning(-3, "7d")).toBe("expired");
    expect(nextExpiryWarning(-3, "expired")).toBeNull();
  });

  it("stays silent well before expiry", () => {
    expect(nextExpiryWarning(45, null)).toBeNull();
    expect(nextExpiryWarning(15, null)).toBeNull();
  });

  it("never regresses to an earlier stage", () => {
    // Already warned at 7d; a later run still inside 14 days must not re-send 14d.
    expect(nextExpiryWarning(10, "7d")).toBeNull();
    // Already expired; a transient clock wobble back to >0 days must not re-warn.
    expect(nextExpiryWarning(5, "expired")).toBeNull();
  });
});
