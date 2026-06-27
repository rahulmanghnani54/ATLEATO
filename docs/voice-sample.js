/* Hero "hear a wake-up call" sample player.
   Reveals the widget ONLY if assets/commander-sample.mp3 actually exists (HEAD
   check) — so the block stays invisible until the mp3 is added — then toggles
   play/pause and animates the progress bar. Loaded as an external script
   because the site CSP forbids inline scripts. */
(function () {
  var wrap = document.getElementById('voice-sample');
  if (!wrap) return;
  var audio = document.getElementById('voice-sample-audio');
  var btn = document.getElementById('voice-sample-btn');
  var bar = document.getElementById('voice-sample-bar');
  var src = audio && audio.getAttribute('src');
  if (!audio || !btn || !src) return;

  // Only show the player once the audio file is present (same-origin HEAD).
  fetch(src, { method: 'HEAD' })
    .then(function (r) { if (r.ok) wrap.style.display = 'flex'; })
    .catch(function () { /* file missing → stay hidden */ });

  function setPlaying(on) {
    btn.textContent = on ? '❚❚' : '▶';
    btn.setAttribute('aria-label', on ? 'Pause sample' : 'Play a wake-up call sample');
  }
  btn.addEventListener('click', function () {
    if (audio.paused) { audio.play(); setPlaying(true); }
    else { audio.pause(); setPlaying(false); }
  });
  audio.addEventListener('ended', function () {
    setPlaying(false);
    if (bar) bar.style.width = '0%';
  });
  audio.addEventListener('timeupdate', function () {
    if (bar && audio.duration) bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
  });
})();
