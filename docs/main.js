/* ═══════════════════════════════════════════════
   EVULTO™ — 3D SCENE + ANIMATIONS
   Three.js particle system + GSAP scroll animations
   ═══════════════════════════════════════════════ */

// ── Three.js 3D Scene ──────────────────────────
(function initThreeScene() {
  if (typeof THREE === 'undefined') {
    console.warn('EVULTO: Three.js not loaded — skipping 3D background.');
    return;
  }
  const canvas = document.getElementById('three-canvas');
  if (!canvas) return;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 30;

  // ── Particles ──
  const PARTICLE_COUNT = 800;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 80;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
    velocities[i * 3] = (Math.random() - 0.5) * 0.01;
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
    sizes[i] = Math.random() * 2.5 + 0.5;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const particleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color('#ff6b35') },
      uColor2: { value: new THREE.Color('#e84d20') },
      uOpacity: { value: 0.5 },
    },
    vertexShader: `
      attribute float size;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 pos = position;
        pos.x += sin(uTime * 0.3 + position.y * 0.1) * 0.5;
        pos.y += cos(uTime * 0.2 + position.x * 0.1) * 0.5;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (20.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = smoothstep(0.0, 1.0, size / 3.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform float uOpacity;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity;
        vec3 color = mix(uColor1, uColor2, sin(uTime * 0.5 + vAlpha * 6.28) * 0.5 + 0.5);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // Expose color switcher callback for morphing background particles and shapes
  window.updateThreeBgColors = function(c1, c2) {
    const col1 = new THREE.Color(c1);
    const col2 = new THREE.Color(c2);
    if (typeof gsap !== 'undefined') {
      gsap.to(particleMat.uniforms.uColor1.value, { r: col1.r, g: col1.g, b: col1.b, duration: 0.8 });
      gsap.to(particleMat.uniforms.uColor2.value, { r: col2.r, g: col2.g, b: col2.b, duration: 0.8 });
      shapes.forEach(mesh => {
        gsap.to(mesh.material.color, { r: col1.r, g: col1.g, b: col1.b, duration: 0.8 });
      });
    } else {
      particleMat.uniforms.uColor1.value.copy(col1);
      particleMat.uniforms.uColor2.value.copy(col2);
      shapes.forEach(mesh => mesh.material.color.copy(col1));
    }
  };

  // ── Floating 3D Shapes ──
  const shapes = [];
  const shapeConfigs = [
    { geo: new THREE.IcosahedronGeometry(2, 0), pos: [15, 8, -10], speed: 0.003 },
    { geo: new THREE.OctahedronGeometry(1.5, 0), pos: [-18, -5, -8], speed: 0.004 },
    { geo: new THREE.TorusGeometry(2, 0.5, 8, 16), pos: [20, -12, -15], speed: 0.002 },
    { geo: new THREE.TetrahedronGeometry(1.8, 0), pos: [-14, 12, -12], speed: 0.005 },
    { geo: new THREE.DodecahedronGeometry(1.2, 0), pos: [8, -18, -6], speed: 0.003 },
    { geo: new THREE.IcosahedronGeometry(3, 1), pos: [-22, 0, -20], speed: 0.001 },
    { geo: new THREE.TorusKnotGeometry(1, 0.3, 32, 8), pos: [25, 5, -18], speed: 0.002 },
  ];

  shapeConfigs.forEach((cfg) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff6b35'),
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    const mesh = new THREE.Mesh(cfg.geo, mat);
    mesh.position.set(...cfg.pos);
    mesh.userData.speed = cfg.speed;
    mesh.userData.baseY = cfg.pos[1];
    scene.add(mesh);
    shapes.push(mesh);
  });

  // ── Connection Lines ──
  const lineGeo = new THREE.BufferGeometry();
  const linePositions = new Float32Array(300 * 6);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color('#ff6b35'),
    transparent: true,
    opacity: 0.04,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);

  // ── Mouse Interaction ──
  let mouseX = 0, mouseY = 0;
  let targetMouseX = 0, targetMouseY = 0;

  document.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    targetMouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  // ── Scroll progress ──
  let scrollProgress = 0;
  window.addEventListener('scroll', () => {
    scrollProgress = window.scrollY / (document.body.scrollHeight - window.innerHeight);
  });

  // ── Animate ──
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

    // Update uniforms
    particleMat.uniforms.uTime.value = elapsed;
    particleMat.uniforms.uOpacity.value = 0.3 + Math.sin(elapsed * 0.5) * 0.15;

    // Smooth mouse
    mouseX += (targetMouseX - mouseX) * 0.03;
    mouseY += (targetMouseY - mouseY) * 0.03;

    // Rotate particles
    particles.rotation.y = elapsed * 0.03 + mouseX * 0.3;
    particles.rotation.x = mouseY * 0.15;

    // Animate shapes
    shapes.forEach((mesh, i) => {
      mesh.rotation.x += mesh.userData.speed;
      mesh.rotation.y += mesh.userData.speed * 1.3;
      mesh.position.y = mesh.userData.baseY + Math.sin(elapsed * 0.5 + i) * 2;
      mesh.material.opacity = 0.05 + Math.sin(elapsed * 0.3 + i * 1.5) * 0.04;
    });

    // Update connection lines between close particles
    const posArr = particleGeo.attributes.position.array;
    let lineIdx = 0;
    const maxLines = 300;
    const threshold = 8;

    for (let i = 0; i < PARTICLE_COUNT && lineIdx < maxLines; i += 4) {
      for (let j = i + 4; j < PARTICLE_COUNT && lineIdx < maxLines; j += 4) {
        const dx = posArr[i * 3] - posArr[j * 3];
        const dy = posArr[i * 3 + 1] - posArr[j * 3 + 1];
        const dz = posArr[i * 3 + 2] - posArr[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < threshold) {
          linePositions[lineIdx * 6] = posArr[i * 3];
          linePositions[lineIdx * 6 + 1] = posArr[i * 3 + 1];
          linePositions[lineIdx * 6 + 2] = posArr[i * 3 + 2];
          linePositions[lineIdx * 6 + 3] = posArr[j * 3];
          linePositions[lineIdx * 6 + 4] = posArr[j * 3 + 1];
          linePositions[lineIdx * 6 + 5] = posArr[j * 3 + 2];
          lineIdx++;
        }
      }
    }

    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.setDrawRange(0, lineIdx * 2);

    // Camera drift
    camera.position.x += (mouseX * 3 - camera.position.x) * 0.02;
    camera.position.y += (mouseY * 2 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);

    // Dim particles as user scrolls down
    const scrollFade = Math.max(0.1, 1 - scrollProgress * 2);
    particleMat.uniforms.uOpacity.value *= scrollFade;

    renderer.render(scene, camera);
  }

  animate();

  // ── Resize ──
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();


// ── GSAP removed — using CSS animations instead ──
// gsap.from() was hiding all content (opacity:0) and ScrollTrigger
// wasn't firing on Opera, leaving the entire site invisible.
// Three.js particles + coach persona switcher + audio still use GSAP
// for color morphing where it works fine (gsap.to, not gsap.from).


// ── Nav Scroll Effect ──────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  if (window.scrollY > 60) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
});


// ── Smooth Scroll for Anchor Links ─────────────
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  });
});


// ── Waitlist Form Handler (Supabase Synced) ──────────────────────
(function initWaitlistForms() {
  const SUPABASE_URL = 'https://kbldncrurztfwlqzajen.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibGRuY3J1cnp0ZndscXphamVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njg3NDcsImV4cCI6MjA5NDE0NDc0N30.rIT9u4d5dht_UWJ9er7ic1-TBa4C5ISRMdDwOolgIUA';

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  // Instant UX mirror of the server-side disposable block (migration 019).
  // The DB trigger is the real enforcement; this just gives a clear message
  // before the request instead of a generic save error.
  var DISPOSABLE_DOMAINS = [
    'mailinator.com','10minutemail.com','10minemail.com','guerrillamail.com',
    'guerrillamail.info','grr.la','sharklasers.com','yopmail.com','temp-mail.org',
    'tempmail.com','throwawaymail.com','getnada.com','trashmail.com','maildrop.cc',
    'dispostable.com','fakeinbox.com','mailnesia.com','mohmal.com','synsky.com',
    'tmpeml.com','emailondeck.com','spamgourmet.com','mintemail.com','tempmailo.com'
  ];
  function isDisposable(s) {
    var domain = (s.split('@')[1] || '').toLowerCase().trim();
    return DISPOSABLE_DOMAINS.indexOf(domain) !== -1;
  }

  // ── Client-side rate limit: max 3 attempts per minute per browser ──
  var RATE_LIMIT_KEY = 'waitlist_attempts:v1';
  var RATE_LIMIT_MAX = 3;
  var RATE_LIMIT_WINDOW = 60000; // 1 min

  function checkRateLimit() {
    try {
      var stored = localStorage.getItem(RATE_LIMIT_KEY);
      var attempts = [];
      if (stored) {
        try { attempts = JSON.parse(stored) || []; } catch (e) { attempts = []; }
      }
      var now = Date.now();
      attempts = attempts.filter(function (t) { return now - t < RATE_LIMIT_WINDOW; });
      if (attempts.length >= RATE_LIMIT_MAX) return false;
      attempts.push(now);
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(attempts));
      return true;
    } catch (e) {
      // localStorage unavailable (e.g. private mode) — fail open, do not block users
      return true;
    }
  }

  function bindWaitlistForm(formId, msgId) {
    var form = document.getElementById(formId);
    if (!form) return;
    var msgEl = document.getElementById(msgId);
    var btn = form.querySelector('button[type="submit"]');

    function setMsg(text, ok) {
      if (msgEl) {
        msgEl.textContent = text;
        msgEl.className = 'waitlist-msg ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
      }
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = new FormData(form).get('email');

      if (!isValidEmail(email)) {
        setMsg('Please enter a valid email.', false);
        return;
      }

      if (isDisposable(email)) {
        setMsg('Please use a real email address — temporary inboxes aren’t allowed.', false);
        return;
      }

      if (!checkRateLimit()) {
        setMsg('Too many attempts. Wait a minute and try again.', false);
        return;
      }

      btn.disabled = true;
      var originalText = btn.innerHTML;
      btn.textContent = 'JOINING…';
      setMsg('');

      // ── Build `source`: UTM campaign attribution + referral code ──
      // Priority for the channel portion:
      //   1. utm_source present → 'utm-<source>[-<medium>][-<campaign>]'
      //      (so the admin source-breakdown groups campaigns automatically)
      //   2. else → form position ('hero' / 'landing-page')
      // A '?ref=CODE' is always appended as '_ref_<CODE>' so referral_count
      // (migration 015) still attributes the signup regardless of UTM.
      var urlParams = new URLSearchParams(window.location.search);
      var refValue = urlParams.get('ref');
      function utmSanitize(s) {
        return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      }
      var utmSource = utmSanitize(urlParams.get('utm_source'));
      var utmMedium = utmSanitize(urlParams.get('utm_medium'));
      var utmCampaign = utmSanitize(urlParams.get('utm_campaign'));
      var baseSource;
      if (utmSource) {
        baseSource = 'utm-' + [utmSource, utmMedium, utmCampaign].filter(Boolean).join('-');
      } else {
        baseSource = formId === 'hero-waitlist-form' ? 'hero' : 'landing-page';
      }
      var sourceValue = refValue
        ? baseSource + '_ref_' + decodeURIComponent(refValue)
        : baseSource;
      // Capture chosen platform (android/ios) without a DB schema change — append to source.
      var platform = (new FormData(form).get('platform') || '').toString().toLowerCase();
      if (platform === 'ios' || platform === 'android') sourceValue += '_plat_' + platform;

      try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/waitlist', {
          method: 'POST',
          headers: {
            'apikey':        SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify({
            email:      email,
            source:     sourceValue,
            referrer:   document.referrer || null,
            user_agent: navigator.userAgent.slice(0, 240),
          }),
        });

        if (res.status === 409 || res.status === 23505) {
          // Duplicate — still redirect to upsell so existing users can claim
          window.location.href = '/upsell.html?email=' + encodeURIComponent(email);
          return;
        } else if (res.status >= 400) {
          var text = await res.text();
          if (text && text.indexOf('duplicate') >= 0) {
            window.location.href = '/upsell.html?email=' + encodeURIComponent(email);
            return;
          } else {
            console.error('[waitlist] Supabase error', res.status, text);
            // Show specific error to help debug — table missing is most common
            var errMsg = text.indexOf('relation') >= 0 || text.indexOf('does not exist') >= 0
              ? 'Database not set up. Admin: apply migration 010.'
              : 'Could not save. Try again in a moment.';
            setMsg(errMsg, false);
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
          }
        } else {
          // Success — redirect to upsell page
          window.location.href = '/upsell.html?email=' + encodeURIComponent(email);
          return;
        }
      } catch (err) {
        console.error('[waitlist] Network error', err);
        setMsg('Network error: ' + (err.message || 'Check connection'), false);
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });
  }

  // Bind both hero and bottom waitlist forms
  bindWaitlistForm('hero-waitlist-form', 'hero-waitlist-msg');
  bindWaitlistForm('waitlist-form', 'waitlist-msg');
})();

// ── Live Vanguard scarcity counter ───────────────────────────────
// Replaces the static "ONLY 500 VIP VANGUARD PASSES AVAILABLE" banner
// with the real remaining count via the vanguard_claimed_count RPC
// (migration 012 — returns just the paid-order integer, no PII).
// Falls back silently to the static text on any error.
(function initVanguardCounter() {
  var el = document.getElementById('vanguard-counter');
  if (!el) return;
  var SUPABASE_URL = 'https://kbldncrurztfwlqzajen.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibGRuY3J1cnp0ZndscXphamVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njg3NDcsImV4cCI6MjA5NDE0NDc0N30.rIT9u4d5dht_UWJ9er7ic1-TBa4C5ISRMdDwOolgIUA';
  var TOTAL = 500;
  fetch(SUPABASE_URL + '/rest/v1/rpc/vanguard_claimed_count', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (claimed) {
      if (typeof claimed !== 'number') return;
      var left = Math.max(0, TOTAL - claimed);
      if (left <= 0) {
        el.textContent = 'ALL 500 VANGUARD PASSES CLAIMED — JOIN THE WAITLIST';
      } else if (claimed > 0) {
        el.textContent = claimed + ' OF 500 CLAIMED · ONLY ' + left + ' VANGUARD PASSES LEFT';
      }
      // claimed === 0 → keep the static "ONLY 500 …" copy (already in the DOM)
    })
    .catch(function () { /* network error — keep static fallback */ });
})();


// ── Coach Chip Hover Audio Feedback ────────────
document.querySelectorAll('.coach-chip').forEach((chip) => {
  chip.addEventListener('mouseenter', () => {
    if (typeof gsap !== 'undefined') gsap.to(chip, {
      scale: 1.03,
      duration: 0.3,
      ease: 'power2.out',
    });
  });
  chip.addEventListener('mouseleave', () => {
    if (typeof gsap !== 'undefined') gsap.to(chip, {
      scale: 1,
      duration: 0.3,
      ease: 'power2.out',
    });
  });
});


// ── Mobile Menu Toggle ─────────────────────────
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
if (mobileMenuBtn) {
  let menuOpen = false;
  mobileMenuBtn.addEventListener('click', () => {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    menuOpen = !menuOpen;
    if (menuOpen) {
      navLinks.style.display = 'flex';
      navLinks.style.flexDirection = 'column';
      navLinks.style.position = 'absolute';
      navLinks.style.top = '100%';
      navLinks.style.left = '0';
      navLinks.style.right = '0';
      navLinks.style.background = 'rgba(10, 11, 13, 0.97)';
      navLinks.style.padding = '20px 28px';
      navLinks.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
      navLinks.style.backdropFilter = 'blur(20px)';
      navLinks.style.gap = '20px';
      navLinks.style.zIndex = '200';
    } else {
      navLinks.style.display = '';
      navLinks.style.flexDirection = '';
      navLinks.style.position = '';
      navLinks.style.top = '';
      navLinks.style.left = '';
      navLinks.style.right = '';
      navLinks.style.background = '';
      navLinks.style.padding = '';
      navLinks.style.borderBottom = '';
      navLinks.style.backdropFilter = '';
      navLinks.style.gap = '';
      navLinks.style.zIndex = '';
    }
  });
  // Close menu when a nav link is clicked
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      if (menuOpen) {
        mobileMenuBtn.click();
      }
    });
  });
}


// ── Parallax on Feature Cards ──────────────────
document.querySelectorAll('.feature-card').forEach((card) => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 20;
    const rotateY = (centerX - x) / 20;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});


// ── Procedural Sound Synthesizer (Web Audio API) ────────────────
class TechAudioSynth {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBlip(freq = 800, duration = 0.05, type = 'sine') {
    if (this.muted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch(e) {}
  }
  
  playSweep(startFreq = 200, endFreq = 600, duration = 0.3) {
    if (this.muted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch(e) {}
  }
  
  playSonar(freq = 1200, decay = 1.0) {
    if (this.muted) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + decay);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + decay);
    } catch(e) {}
  }
}

const audioSynth = new TechAudioSynth();
window.audioSynth = audioSynth;

// Sound toggle button in navigation
const soundToggleBtn = document.getElementById('sound-toggle');
if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    audioSynth.muted = !audioSynth.muted;
    soundToggleBtn.classList.toggle('muted', audioSynth.muted);
    if (!audioSynth.muted) {
      audioSynth.init();
      audioSynth.playBlip(1000, 0.1);
    }
  });
}

// Hover effects for card elements
document.querySelectorAll('.feature-card, .price-card, .step-card, .coach-chip, .coach-card').forEach(card => {
  card.addEventListener('mouseenter', () => {
    audioSynth.playBlip(600, 0.04);
  });
});

// Scroll sweep sound effects when passing key sections
const scrollSections = ['#features', '#form-demo', '#coaches', '#pricing', '#waitlist'];
let lastScrollTop = 0;
let passedSections = new Set();

window.addEventListener('scroll', () => {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollingDown = scrollTop > lastScrollTop;
  lastScrollTop = scrollTop;

  scrollSections.forEach(selector => {
    const el = document.querySelector(selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      const triggerY = window.innerHeight * 0.4;
      if (rect.top <= triggerY && rect.bottom >= triggerY) {
        if (!passedSections.has(selector)) {
          passedSections.add(selector);
          if (scrollingDown) {
            audioSynth.playSweep(150, 450, 0.4);
          } else {
            audioSynth.playSweep(450, 150, 0.4);
          }
        }
      } else {
        passedSections.delete(selector);
      }
    }
  });
});


// ── Interactive Coach Persona Switcher ──────────────────────────
const coachConfigs = {
  sculptor: {  // THE SCULPTOR
    lime: '#c8ff3d', limeRgb: '200, 255, 61', limeDim: '#b4e632', color2: '#d4af37',
    headline: 'TRAIN UNDER<br/><span class="lime-text">THE SCULPTOR.</span>',
    quote: 'Symmetry, proportion, lines that look carved. <span class="lime-text">Quality over ego — build the statue.</span>',
    speech: "Good morning, champion. Time to build those classic lines — control every rep. Let's get it today.",
    pitch: 0.85, rate: 0.95
  },
  monument: {  // THE MONUMENT
    lime: '#f5b942', limeRgb: '245, 185, 66', limeDim: '#dd9b25', color2: '#ff6b35',
    headline: 'PUMP UNDER<br/><span class="lime-text">THE MONUMENT.</span>',
    quote: 'Golden-era volume and the mind-muscle connection. <span class="lime-text">Chase the pump till you can\'t lift your arms.</span>',
    speech: "Come on, get up! The iron is waiting and there is no time to sleep. Let's move!",
    pitch: 0.75, rate: 0.9
  },
  analyst: {  // THE ANALYST
    lime: '#5dd3fa', limeRgb: '93, 211, 250', limeDim: '#3cbbe5', color2: '#ff6b35',
    headline: 'OPTIMIZE UNDER<br/><span class="lime-text">THE ANALYST.</span>',
    quote: 'Every rep based on the latest peer-reviewed research. <span class="lime-text">Science-based hypertrophy.</span>',
    speech: "Good morning. Skipping this session means zero muscle protein synthesis today. Let's start.",
    pitch: 1.02, rate: 1.05
  },
  commander: {  // THE COMMANDER
    lime: '#ef4444', limeRgb: '239, 68, 68', limeDim: '#d32f2f', color2: '#ff6b35',
    headline: 'CONQUER UNDER<br/><span class="lime-text">THE COMMANDER.</span>',
    quote: 'Comfort is the enemy. <span class="lime-text">The last rep is where it\'s won — push past where your body wants to quit.</span>',
    speech: "Wake up! No excuses today. Get to that gym and earn it!",
    pitch: 0.7, rate: 1.15
  },
  architect: {  // THE ARCHITECT
    lime: '#7be38c', limeRgb: '123, 227, 140', limeDim: '#5fc670', color2: '#a855f7',
    headline: 'GROW UNDER<br/><span class="lime-text">THE ARCHITECT.</span>',
    quote: 'Periodized volume, dialed to your exact recoverable dose. <span class="lime-text">Build serious tissue, methodically.</span>',
    speech: "Time to get some hypertrophy going. Stay in bed and your gains stall — let's work.",
    pitch: 1.15, rate: 1.1
  }
};

function playSpeechSynthesis(text, pitch, rate) {
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = pitch;
    utterance.rate = rate;
    const voices = window.speechSynthesis.getVoices();
    const englishMale = voices.find(v => (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('google')) && v.lang.startsWith('en'));
    if (englishMale) utterance.voice = englishMale;
    window.speechSynthesis.speak(utterance);
  } catch(e) {}
}

document.querySelectorAll('.coach-chip, .coach-card').forEach(item => {
  item.addEventListener('click', () => {
    const coachName = item.getAttribute('data-coach') || item.querySelector('.coach-name')?.textContent.toLowerCase().replace(/[\s.]/g, '');
    if (!coachName || !coachConfigs[coachName]) return;
    
    const cfg = coachConfigs[coachName];

    // Play procedural sonar sound
    audioSynth.playSonar(900, 1.4);

    // Play voice preview simulation
    playSpeechSynthesis(cfg.speech, cfg.pitch, cfg.rate);

    // Apply color morph CSS variables
    document.documentElement.style.setProperty('--lime', cfg.lime);
    document.documentElement.style.setProperty('--lime-rgb', cfg.limeRgb);
    document.documentElement.style.setProperty('--lime-dim', cfg.limeDim);

    // Apply background particle morphing
    if (window.updateThreeBgColors) {
      window.updateThreeBgColors(cfg.lime, cfg.color2);
    }
    
    // Update visualizer colors if method is exposed
    if (window.updateMannequinColors) {
      window.updateMannequinColors(cfg.lime, cfg.color2);
    }

    // Morph Headline and Quote text with slide-out-in animation
    const headline = document.querySelector('.hero-headline');
    if (headline) {
      if (typeof gsap !== 'undefined') {
        gsap.to(headline, {
          opacity: 0, y: -20, duration: 0.3, onComplete: () => {
            headline.innerHTML = cfg.headline;
            gsap.to(headline, { opacity: 1, y: 0, duration: 0.5 });
          }
        });
      } else {
        headline.innerHTML = cfg.headline;
      }
    }

    const quoteBlockText = document.querySelector('.quote-text');
    if (quoteBlockText) {
      if (typeof gsap !== 'undefined') {
        gsap.to(quoteBlockText, {
          opacity: 0, y: 15, duration: 0.3, onComplete: () => {
            quoteBlockText.innerHTML = cfg.quote;
            gsap.to(quoteBlockText, { opacity: 1, y: 0, duration: 0.5 });
          }
        });
      } else {
        quoteBlockText.innerHTML = cfg.quote;
      }
    }

    // Toggle active state visual border on chips/cards
    document.querySelectorAll('.coach-chip').forEach(c => {
      c.style.borderColor = c.getAttribute('data-coach') === coachName ? 'var(--lime)' : '';
    });
  });
});


console.log('%c🏋️ EVULTO™ — Train. Fuel. Rise.', 'color: #ff6b35; font-size: 16px; font-weight: bold; background: #0a0b0d; padding: 8px 16px; border-radius: 4px;');
