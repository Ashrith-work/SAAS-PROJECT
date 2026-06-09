/* HotelTrack tracking snippet — vanilla JS, loads async.
   <script src="https://yourdomain.com/t.js?id=HOTEL_SITE_ID" async></script>
   Collects ONLY UTM + page data. Never names, emails, or form contents.

   SOURCE OF TRUTH: edit THIS file, then run `npm run build:snippet` to
   regenerate the minified public/t.js that hotels actually load. */
(function () {
  "use strict";
  try {
    // 1. Find our own <script> tag and read the Hotel Site ID from its src.
    var me = document.currentScript;
    if (!me || !me.src || me.src.indexOf("id=") < 0) {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        var ss = all[i].src || "";
        if (ss.indexOf("/t.js") >= 0 && ss.indexOf("id=") >= 0) { me = all[i]; break; }
      }
    }
    if (!me || !me.src) return;
    var src = new URL(me.src);
    var siteId = src.searchParams.get("id");
    if (!siteId) return;
    var base = src.origin;
    var DEBUG = src.searchParams.get("debug") === "1";

    var converted = false, observer = null, cfg = null, pending = false;
    var UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

    function log(t, p) {
      if (!DEBUG) return;
      try {
        console.log("[HotelTrack]", t, p);
        window.dispatchEvent(new CustomEvent("hoteltrack:event", { detail: { type: t, payload: p } }));
      } catch (e) {}
    }
    function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
    function getCookie(n) {
      var m = document.cookie.match("(?:^|; )" + n + "=([^;]*)");
      return m ? decodeURIComponent(m[1]) : null;
    }
    function setCookie(n, v, days) {
      var exp = "";
      if (days) { var d = new Date(); d.setTime(d.getTime() + days * 86400000); exp = "; expires=" + d.toUTCString(); }
      document.cookie = n + "=" + encodeURIComponent(v) + exp + "; path=/; SameSite=Lax";
    }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
    function device() {
      var ua = navigator.userAgent || "";
      if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
      if (/Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua)) return "mobile";
      return "desktop";
    }

    // 3 + 4. First-touch attribution: store the FIRST UTM set seen for 30 days.
    function urlUtms() {
      var q = new URLSearchParams(location.search), o = {}, has = false;
      UTM.forEach(function (k) { var v = q.get(k); if (v) { o[k] = v; has = true; } });
      return has ? o : null;
    }
    var attr = parse(getCookie("_ht_attr") || "");
    if (!attr) {
      var cur = urlUtms();
      if (cur) { attr = cur; setCookie("_ht_attr", JSON.stringify(cur), 30); } // don't overwrite if cookie exists
    }
    attr = attr || {};

    // Session id (per browsing session) + "already converted" flag.
    var sid = getCookie("_ht_sid");
    if (!sid) { sid = uid(); setCookie("_ht_sid", sid, null); }
    converted = getCookie("_ht_conv") === sid;

    // Persistent visitor id — survives across sessions for multi-touch grouping.
    // 30-day SLIDING window: re-stamped on every load so an active visitor never
    // expires mid-journey.
    var vid = getCookie("_ht_vid") || uid();
    setCookie("_ht_vid", vid, 30);

    // Multi-touch journey: append one touchpoint per page load that carries new
    // info (a UTM, or an external referrer, or the very first touch), de-duping
    // consecutive identical touches. Capped at 20 (oldest drop off). Cookie uses
    // the same 30-day sliding window. Still UTM + page/referrer only — no PII.
    var JKEY = "_ht_journey", JMAX = 20;
    function clip(s, n) { return s == null ? null : String(s).slice(0, n); }
    function hostOf(u) { try { return new URL(u).host; } catch (e) { return ""; } }
    function buildTouch() {
      var u = urlUtms() || {};
      return {
        ts: Date.now(),
        utm_source: u.utm_source || null, utm_medium: u.utm_medium || null,
        utm_campaign: u.utm_campaign || null, utm_content: u.utm_content || null,
        referrer: clip(document.referrer || null, 200),
        landing_page: clip(location.href, 200)
      };
    }
    function sameTouch(a, b) {
      return !!a && !!b && a.utm_source === b.utm_source && a.utm_medium === b.utm_medium &&
        a.utm_campaign === b.utm_campaign && a.utm_content === b.utm_content && a.referrer === b.referrer;
    }
    var journey = parse(getCookie(JKEY) || "");
    if (!(journey instanceof Array)) journey = [];
    var tp = buildTouch();
    var hasUtm = !!(tp.utm_source || tp.utm_medium || tp.utm_campaign || tp.utm_content);
    var extRef = !!(tp.referrer && hostOf(tp.referrer) && hostOf(tp.referrer) !== location.host);
    var lastTp = journey.length ? journey[journey.length - 1] : null;
    if ((hasUtm || extRef || journey.length === 0) && !sameTouch(tp, lastTp)) {
      journey.push(tp);
      if (journey.length > JMAX) journey = journey.slice(journey.length - JMAX);
    }
    setCookie(JKEY, JSON.stringify(journey), 30); // sliding 30-day expiry

    // Send an event (sendBeacon -> simple request, no preflight; fetch fallback).
    function send(type, value) {
      var payload = {
        siteId: siteId, type: type, visitorId: vid,
        utmSource: attr.utm_source || null, utmMedium: attr.utm_medium || null,
        utmCampaign: attr.utm_campaign || null, utmContent: attr.utm_content || null,
        utmTerm: attr.utm_term || null,
        pageUrl: location.href, sessionId: sid, deviceType: device(),
        value: value == null ? null : value
      };
      // On conversion, attach the whole journey (re-read for the freshest copy
      // in case more touches accumulated across page loads this session).
      if (type === "conversion") {
        var j = parse(getCookie(JKEY) || "");
        payload.journey = (j instanceof Array) ? j : journey;
      }
      var url = base + "/api/track/event", data = JSON.stringify(payload);
      try {
        if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([data], { type: "text/plain;charset=UTF-8" }));
        else fetch(url, { method: "POST", body: data, headers: { "Content-Type": "text/plain;charset=UTF-8" }, mode: "cors", keepalive: true });
      } catch (e) {}
      log(type, payload);
    }

    // 5. Every page load fires a "visit".
    send("visit");

    // 8. Read the booking value from page data only — never names, emails, or
    // form contents. Three strategies, tried in order; the first that yields a
    // positive number wins. Returns null if all fail (the conversion still fires).
    function parseAmount(raw) {
      if (raw == null) return null;
      var cleaned = String(raw).replace(/[^0-9.]/g, "");
      if (!cleaned) return null;
      var n = parseFloat(cleaned);
      return isFinite(n) && n > 0 ? n : null;
    }
    // Strategy B: scan visible page text for a booking total. Prefer a labelled
    // amount ("Total: ₹12,345", "Amount paid ₹…"); otherwise fall back to the
    // largest ₹ figure on the page (a booking total is almost always the biggest).
    function valueFromText() {
      try {
        var text = document.body ? (document.body.innerText || document.body.textContent || "") : "";
        if (!text) return null;
        var labelled = text.match(
          /(?:grand\s*total|total\s*amount|amount\s*paid|you\s*paid|booking\s*total|total|amount)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
        );
        if (labelled) { var la = parseAmount(labelled[1]); if (la != null) return la; }
        var amounts = [], re = /₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g, m;
        while ((m = re.exec(text))) { var v = parseAmount(m[1]); if (v != null) amounts.push(v); }
        if (amounts.length) return Math.max.apply(null, amounts);
      } catch (e) {}
      return null;
    }
    function extractBookingValue() {
      try {
        // Strategy A — data attribute (configured selector, or [data-ht-value]).
        // Cleanest + most reliable; recommended in the install guide.
        var sel = cfg && cfg.valueSelector;
        var el = sel ? document.querySelector(sel) : document.querySelector("[data-ht-value]");
        if (el) {
          var raw = el.getAttribute && el.getAttribute("data-ht-value");
          if (raw == null) raw = el.textContent || "";
          var a = parseAmount(raw);
          if (a != null) return a;
        }
        // Strategy B — regex over page text.
        var b = valueFromText();
        if (b != null) return b;
        // Strategy C — a thank-you URL parameter (amount/total/value/price/booking_value).
        var q = new URLSearchParams(location.search);
        var keys = ["amount", "total", "value", "price", "booking_value"];
        for (var i = 0; i < keys.length; i++) {
          var c = parseAmount(q.get(keys[i]));
          if (c != null) return c;
        }
      } catch (e) {}
      return null;
    }

    // 7. Fire a conversion at most once per session.
    function convert() {
      if (converted) return;
      converted = true;
      setCookie("_ht_conv", sid, null);
      if (observer) { try { observer.disconnect(); } catch (e) {} }
      send("conversion", extractBookingValue());
    }

    // 6. Conversion detection.
    function urlMatch(p) {
      if (!p) return false;
      if (p.indexOf("*") >= 0) {
        var rx = new RegExp(p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
        return rx.test(location.pathname) || rx.test(location.pathname + location.search);
      }
      return location.pathname.indexOf(p) >= 0 || location.href.indexOf(p) >= 0;
    }
    function checkUrl() {
      if (cfg && (cfg.method === "url_change" || cfg.method === "both") && urlMatch(cfg.thankYouUrlPattern)) convert();
    }
    function checkSame() {
      if (!cfg || (cfg.method !== "same_page" && cfg.method !== "both")) return;
      try {
        if (cfg.successSelector && document.querySelector(cfg.successSelector)) return convert();
        var txt = document.body ? (document.body.innerText || document.body.textContent || "") : "";
        if (cfg.successPhrase && txt.indexOf(cfg.successPhrase) >= 0) convert();
      } catch (e) {}
    }
    function scheduleSame() { if (pending) return; pending = true; setTimeout(function () { pending = false; checkSame(); }, 150); }

    function setup(c) {
      cfg = c;
      // url_change (and "both"): check now + watch SPA navigations.
      if (c.method === "url_change" || c.method === "both") {
        checkUrl();
        var hook = function () { setTimeout(checkUrl, 0); };
        ["pushState", "replaceState"].forEach(function (m) {
          var orig = history[m];
          if (orig) history[m] = function () { var r = orig.apply(this, arguments); hook(); return r; };
        });
        addEventListener("popstate", hook);
        addEventListener("hashchange", hook);
      }
      // same_page (and "both", as fallback): check now + observe the DOM.
      if (c.method === "same_page" || c.method === "both") {
        var start = function () {
          checkSame();
          if (window.MutationObserver && document.body) {
            observer = new MutationObserver(scheduleSame);
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });
          }
        };
        if (document.body) start(); else addEventListener("DOMContentLoaded", start);
      }
    }

    // 2. Fetch this hotel's config, then wire up conversion detection.
    fetch(base + "/api/track/config?id=" + encodeURIComponent(siteId), { mode: "cors" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { if (c && !c.error) setup(c); })
      .catch(function () {});
  } catch (e) {}
})();
