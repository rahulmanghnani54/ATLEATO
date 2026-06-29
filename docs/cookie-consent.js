// GDPR/ePrivacy cookie banner (extracted from inline <script> so the page can
// ship a strict CSP without 'unsafe-inline' in script-src).
(function(){
  var KEY = 'atleato_cookie_consent';
  var banner = document.getElementById('cookie-banner');
  if (!banner) return;
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}
  if (!stored) {
    banner.style.display = 'flex';
    setTimeout(function(){ banner.classList.add('show'); }, 600);
  }
  function close(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    // Let analytics (and anything else) react immediately, without a reload.
    try { window.dispatchEvent(new CustomEvent('atleato:consent', { detail: value })); } catch (e) {}
    banner.classList.remove('show');
    setTimeout(function(){ banner.style.display = 'none'; }, 400);
  }
  var accept = document.getElementById('cookie-accept');
  var reject = document.getElementById('cookie-reject');
  if (accept) accept.addEventListener('click', function(){ close('all'); });
  if (reject) reject.addEventListener('click', function(){ close('essential'); });
})();
