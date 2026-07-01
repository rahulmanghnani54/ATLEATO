/* Evulto homepage — live coach-switcher, ring animation, and the waitlist.
   CSP-safe (external file). No frameworks. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://kbldncrurztfwlqzajen.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibGRuY3J1cnp0ZndscXphamVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njg3NDcsImV4cCI6MjA5NDE0NDc0N30.rIT9u4d5dht_UWJ9er7ic1-TBa4C5ISRMdDwOolgIUA';

  // ── Live coach-switcher: retheme the whole page ──
  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-accent]'));
  function setAccent(color, name) {
    document.documentElement.style.setProperty('--accent', color);
    var lbl = document.getElementById('coach-active');
    if (lbl && name) lbl.textContent = name;
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (x) { x.classList.remove('is-active'); x.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('is-active'); chip.setAttribute('aria-pressed', 'true');
      setAccent(chip.getAttribute('data-accent'), chip.getAttribute('data-coach'));
    });
  });

  // ── Ring count-up (animate the form score once it scrolls in) ──
  function countRing(el) {
    var target = parseInt(el.getAttribute('data-target') || '94', 10);
    var n = 0;
    var timer = setInterval(function () {
      n += Math.max(1, Math.round(target / 40));
      if (n >= target) { n = target; clearInterval(timer); }
      el.textContent = n;
    }, 22);
  }
  var rings = Array.prototype.slice.call(document.querySelectorAll('[data-target]'));
  rings.forEach(function (r) { setTimeout(function () { countRing(r); }, 200); });

  // ── Waitlist ──
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((s || '').trim()); }
  function bind(form) {
    if (!form) return;
    var msg = form.querySelector('.wl-msg');
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (new FormData(form).get('email') || '').toString();
      if (!validEmail(email)) { if (msg) { msg.textContent = 'Please enter a valid email.'; msg.style.color = '#c0392b'; } return; }
      var plat = (new FormData(form).get('platform') || 'android').toString();
      var orig = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
      if (msg) { msg.textContent = ''; }
      fetch(SUPABASE_URL + '/rest/v1/waitlist', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ email: email, source: (form.id || 'home') + '_plat_' + plat, referrer: document.referrer || null, user_agent: navigator.userAgent.slice(0, 240) })
      }).then(function (res) {
        if (res.ok || res.status === 409) { window.location.href = '/upsell.html?email=' + encodeURIComponent(email); return; }
        return res.text().then(function (t) {
          if (t.indexOf('duplicate') >= 0) { window.location.href = '/upsell.html?email=' + encodeURIComponent(email); return; }
          if (msg) { msg.textContent = 'Could not save — try again in a moment.'; msg.style.color = '#c0392b'; }
          if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        });
      }).catch(function () {
        if (msg) { msg.textContent = 'Network error — check your connection.'; msg.style.color = '#c0392b'; }
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
      });
    });
  }
  Array.prototype.slice.call(document.querySelectorAll('form.wl-form')).forEach(bind);

  // ── Smooth-scroll for in-page nav ──
  Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]')).forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length > 1) { var t = document.querySelector(id); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
    });
  });
})();
