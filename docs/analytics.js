/* Evulto web analytics — consent-gated, ID-gated, privacy-first.
 *
 * NOTHING loads or sends until BOTH are true:
 *   1) the visitor accepted analytics cookies (cookie banner → "Accept All"), AND
 *   2) the matching ID below is filled in.
 * Until you paste your IDs, this file is completely inert: no network calls,
 * no tracking. Personal data (e.g. the email typed into the waitlist form) is
 * NEVER sent — only anonymous event names + simple params.
 *
 * ── HOW TO ACTIVATE ──
 *   Paste your IDs in the block below, commit, push. Done.
 *   IMPORTANT: if a Content-Security-Policy is also set at the Cloudflare layer
 *   (response header), add the same analytics domains there too, or the browser
 *   will block these scripts. The domains are listed at the bottom of this file.
 */
(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  // 1) PASTE YOUR IDs HERE (leave '' to keep that provider disabled)
  // ──────────────────────────────────────────────────────────────
  var GA4_ID        = '';   // Google Analytics 4, e.g. 'G-XXXXXXXXXX'
  var META_PIXEL_ID = '';   // Meta / Facebook Pixel, e.g. '123456789012345'
  var CLARITY_ID    = '';   // Microsoft Clarity, e.g. 'abcdefghij'
  // ──────────────────────────────────────────────────────────────

  var CONSENT_KEY = 'evulto_cookie_consent';
  var started = false;

  function hasConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'all'; } catch (e) { return false; }
  }

  function inject(src) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    document.head.appendChild(s);
    return s;
  }

  function loadGA4() {
    if (!GA4_ID) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID, { anonymize_ip: true });
    inject('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID));
  }

  function loadMetaPixel() {
    if (!META_PIXEL_ID) return;
    var n = window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    inject('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function loadClarity() {
    if (!CLARITY_ID) return;
    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    inject('https://www.clarity.ms/tag/' + encodeURIComponent(CLARITY_ID));
  }

  function activate() {
    if (started || !hasConsent()) return;
    if (!GA4_ID && !META_PIXEL_ID && !CLARITY_ID) return; // nothing configured yet
    started = true;
    loadGA4();
    loadMetaPixel();
    loadClarity();
  }

  // Public helper: send a custom event to whichever providers are live.
  // No-ops silently until consent + IDs are in place.
  window.atleatoTrack = function (name, params) {
    params = params || {};
    if (window.gtag) window.gtag('event', name, params);
    if (window.fbq)  window.fbq('trackCustom', name, params);
    if (window.clarity) { try { window.clarity('event', name); } catch (e) {} }
  };

  // ── Wire conversion events (always wired; only SEND once providers are live) ──
  function wireEvents() {
    // Waitlist signups — never send the email itself, just the event + location.
    document.querySelectorAll('form.waitlist-form, #hero-waitlist-form').forEach(function (f) {
      f.addEventListener('submit', function () {
        var plat = '';
        try { plat = (new FormData(f).get('platform') || '').toString(); } catch (e) {}
        window.atleatoTrack('waitlist_signup', { location: f.id || 'waitlist', platform: plat || 'unknown' });
        if (window.fbq) window.fbq('track', 'Lead');
      });
    });
    // Coach interest (coach chips + cards carry data-coach)
    document.querySelectorAll('[data-coach]').forEach(function (el) {
      el.addEventListener('click', function () {
        window.atleatoTrack('coach_interest', { coach: el.getAttribute('data-coach') });
      });
    });
    // Vanguard CTA interest (matched by text — there's no dedicated id)
    document.querySelectorAll('a, button').forEach(function (el) {
      if ((el.textContent || '').toLowerCase().indexOf('vanguard') !== -1) {
        el.addEventListener('click', function () { window.atleatoTrack('vanguard_interest', {}); });
      }
    });
    // 3D demo interaction
    var bad = document.getElementById('bad-form-btn');
    if (bad) bad.addEventListener('click', function () {
      window.atleatoTrack('demo_interaction', { action: 'simulate_bad_form' });
    });
    wireScrollDepth();
  }

  function wireScrollDepth() {
    var marks = [25, 50, 75, 90], fired = {};
    function onScroll() {
      var h = document.documentElement;
      var max = (h.scrollHeight - h.clientHeight) || 1;
      var pct = (h.scrollTop || document.body.scrollTop) / max * 100;
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (pct >= m && !fired[m]) { fired[m] = true; window.atleatoTrack('scroll_depth', { percent: m }); }
      }
      if (fired[90]) window.removeEventListener('scroll', onScroll);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function boot() { activate(); wireEvents(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Activate the instant the visitor clicks "Accept All" (no reload needed).
  window.addEventListener('atleato:consent', function (e) {
    if (e && e.detail === 'all') activate();
  });

  /* ── CSP DOMAINS (add to the Cloudflare CSP header too, if one is set) ──
   *   script-src : https://www.googletagmanager.com https://connect.facebook.net
   *                https://www.clarity.ms https://*.clarity.ms
   *   connect-src: https://www.google-analytics.com https://*.google-analytics.com
   *                https://*.analytics.google.com https://www.clarity.ms
   *                https://*.clarity.ms https://connect.facebook.net https://www.facebook.com
   *   img-src    : (already allows https:)
   */
})();
