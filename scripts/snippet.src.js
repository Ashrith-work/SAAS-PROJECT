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

    // Send an event (sendBeacon -> simple request, no preflight; fetch fallback).
    function send(type, value) {
      var payload = {
        siteId: siteId, type: type,
        utmSource: attr.utm_source || null, utmMedium: attr.utm_medium || null,
        utmCampaign: attr.utm_campaign || null, utmContent: attr.utm_content || null,
        utmTerm: attr.utm_term || null,
        pageUrl: location.href, sessionId: sid, deviceType: device(),
        value: value == null ? null : value
      };
      var url = base + "/api/track/event", data = JSON.stringify(payload);
      try {
        if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([data], { type: "text/plain;charset=UTF-8" }));
        else fetch(url, { method: "POST", body: data, headers: { "Content-Type": "text/plain;charset=UTF-8" }, mode: "cors", keepalive: true });
      } catch (e) {}
      log(type, payload);
    }

    // 5. Every page load fires a "visit".
    send("visit");

    // 8. Read a booking value from page data only (configured selector, or a
    // [data-ht-value] element as a convention). No personal data is read.
    function readValue() {
      try {
        var sel = cfg && cfg.valueSelector;
        var el = sel ? document.querySelector(sel) : document.querySelector("[data-ht-value]");
        if (!el) return null;
        var raw = el.getAttribute && el.getAttribute("data-ht-value");
        if (raw == null) raw = el.textContent || "";
        var n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
        return isFinite(n) ? n : null;
      } catch (e) { return null; }
    }

    // 7. Fire a conversion at most once per session.
    function convert() {
      if (converted) return;
      converted = true;
      setCookie("_ht_conv", sid, null);
      if (observer) { try { observer.disconnect(); } catch (e) {} }
      send("conversion", readValue());
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
