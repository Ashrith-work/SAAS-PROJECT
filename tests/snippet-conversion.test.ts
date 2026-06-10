// @vitest-environment happy-dom
//
// Race-condition coverage for the tracking snippet's booking-value capture.
// Boots the REAL snippet source (scripts/snippet.src.js — the source of truth)
// in a DOM, then drives waitForBookingValue() through the three timing cases the
// SPA bug hinges on:
//
//   A. slow render  — URL/conversion fires first, data-ht-value appears later
//   B. fast render  — value already in the DOM (non-SPA / WordPress / Shopify)
//   C. never        — value never renders; must resolve null, not hang
//
// The snippet exposes its internals on window.__htInternals only in debug mode
// (?debug=1 / window.HT_DEBUG), which is how we reach the function under test.

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SRC = path.resolve(process.cwd(), "scripts/snippet.src.js");

type Internals = {
  extractBookingValue: () => number | null;
  waitForBookingValue: (maxWaitMs: number, done: (v: number | null) => void) => void;
  parseAmount: (raw: unknown) => number | null;
};

function internals(): Internals {
  return (window as unknown as { __htInternals: Internals }).__htInternals;
}

// Promise wrapper around the callback-style API so tests can await a result.
function waitValue(maxWaitMs: number): Promise<number | null> {
  return new Promise((resolve) => internals().waitForBookingValue(maxWaitMs, resolve));
}

function addValueEl(value: string): HTMLElement {
  const el = document.createElement("div");
  el.id = "booking-confirmation";
  el.setAttribute("data-ht-value", value);
  el.textContent = "Booking confirmed — thank you!";
  document.body.appendChild(el);
  return el;
}

beforeAll(() => {
  // Keep the snippet's bootstrap off the network: config fetch returns !ok so
  // setup() never runs, isolating waitForBookingValue from live detection paths.
  globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => null })) as never;
  // sendBeacon may be undefined in happy-dom; stub it so the "visit" send is inert.
  Object.defineProperty(window.navigator, "sendBeacon", { value: () => true, configurable: true });

  // Bootstrap: hand the snippet its own <script> via document.currentScript
  // (debug=1 exposes internals). We don't append it — happy-dom would try to
  // network-load an external src — and the snippet only reads .src anyway.
  const s = document.createElement("script");
  s.src = "https://app.example.com/t.js?id=test-site-hoteltrack&debug=1";
  Object.defineProperty(document, "currentScript", { value: s, configurable: true });
  (window as unknown as { HT_DEBUG: boolean }).HT_DEBUG = true;

  // Run the real IIFE. It self-executes and wires up window.__htInternals.
  new Function(readFileSync(SRC, "utf8"))();

  if (!internals()) throw new Error("snippet did not expose __htInternals — bootstrap failed");
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("waitForBookingValue — SPA race condition", () => {
  it("A) slow render: waits for data-ht-value to appear, then captures it", async () => {
    expect(internals().extractBookingValue()).toBeNull(); // nothing yet

    const pending = waitValue(2000);
    // Simulate React committing the /thank-you DOM ~50ms after the URL changed.
    setTimeout(() => addValueEl("249.00"), 50);

    expect(await pending).toBe(249); // the bug: this used to resolve null
  });

  it("B) fast render: resolves immediately when the value is already present", async () => {
    addValueEl("500.00");
    const start = Date.now();
    const v = await waitValue(2000);
    expect(v).toBe(500);
    expect(Date.now() - start).toBeLessThan(50); // no added delay for non-SPA pages
  });

  it("C) never renders: resolves null at the deadline instead of hanging", async () => {
    const start = Date.now();
    const v = await waitValue(150);
    expect(v).toBeNull();
    expect(Date.now() - start).toBeGreaterThanOrEqual(140); // waited the full window
  });

  it("D) multiple data-ht-value elements: takes the largest (grand total)", async () => {
    addValueEl("99.00"); // a line-item subtotal
    addValueEl("249.00"); // the grand total
    addValueEl("12.50"); // tax
    expect(await waitValue(2000)).toBe(249);
  });
});
