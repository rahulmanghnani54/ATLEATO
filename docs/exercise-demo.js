/* ═══════════════════════════════════════════════
   EVULTO™ — 3D EXERCISE FORM CORRECTION DEMO
   Animated 3D mannequin with multi-exercise simulator
   ═══════════════════════════════════════════════ */

(function initExerciseDemo() {
  const canvas = document.getElementById('person-canvas');
  if (!canvas) return;

  const container = canvas.parentElement;
  const width = container.clientWidth;
  const height = container.clientHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 5, 16);
  camera.lookAt(0, 4.5, 0);

  // ── Lighting ──
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambientLight);
  const pointLight = new THREE.PointLight(0xff6b35, 1.8, 30);
  pointLight.position.set(5, 10, 8);
  scene.add(pointLight);
  const backLight = new THREE.PointLight(0xff6b35, 0.7, 25);
  backLight.position.set(-5, 8, -5);
  scene.add(backLight);

  // ── Ground Grid ──
  const gridHelper = new THREE.GridHelper(12, 24, 0x1d2026, 0x1d2026);
  gridHelper.position.y = 0;
  scene.add(gridHelper);

  const groundGeo = new THREE.PlaneGeometry(14, 14);
  const groundMat = new THREE.MeshBasicMaterial({
    color: 0xff6b35,
    transparent: true,
    opacity: 0.015,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  scene.add(ground);

  // ── Interactive States ──
  let activeEx = 'squat';
  let badFormSimulated = false;
  let paused = false;          // WCAG 2.2.2 — user can stop the auto-animation
  let userOrbit = 0;           // keyboard rotation offset (radians)
  let simTime = 0;             // animation time; frozen while paused (no jump on resume)

  // ── Joint Positions ──
  const STANDING = {
    head:           [0, 9.2, 0],
    neck:           [0, 8.4, 0],
    shoulderL:      [-1.4, 8.3, 0],
    shoulderR:      [1.4, 8.3, 0],
    elbowL:         [-1.8, 6.8, 0.2],
    elbowR:         [1.8, 6.8, 0.2],
    wristL:         [-1.6, 5.5, 0.5],
    wristR:         [1.6, 5.5, 0.5],
    spine:          [0, 7.0, 0],
    hipCenter:      [0, 5.4, 0],
    hipL:           [-0.9, 5.3, 0],
    hipR:           [0.9, 5.3, 0],
    kneeL:          [-0.9, 2.9, 0.1],
    kneeR:          [0.9, 2.9, 0.1],
    ankleL:         [-0.9, 0.4, 0],
    ankleR:         [0.9, 0.4, 0],
    footL:          [-0.9, 0.1, 0.5],
    footR:          [0.9, 0.1, 0.5],
  };

  const SQUAT = {
    head:           [0, 7.0, 0.6],
    neck:           [0, 6.2, 0.5],
    shoulderL:      [-1.4, 6.1, 0.7],
    shoulderR:      [1.4, 6.1, 0.7],
    elbowL:         [-1.2, 5.2, 2.0],
    elbowR:         [1.2, 5.2, 2.0],
    wristL:         [-0.8, 5.0, 3.0],
    wristR:         [0.8, 5.0, 3.0],
    spine:          [0, 5.2, 0.4],
    hipCenter:      [0, 3.6, -0.3],
    hipL:           [-0.9, 3.5, -0.3],
    hipR:           [0.9, 3.5, -0.3],
    kneeL:          [-1.0, 2.0, 1.5],
    kneeR:          [1.0, 2.0, 1.5],
    ankleL:         [-0.9, 0.4, 0],
    ankleR:         [0.9, 0.4, 0],
    footL:          [-0.9, 0.1, 0.5],
    footR:          [0.9, 0.1, 0.5],
  };

  const DEADLIFT_BENT = {
    head:           [0, 5.2, 1.8],
    neck:           [0, 4.6, 1.4],
    shoulderL:      [-1.4, 4.5, 1.5],
    shoulderR:      [1.4, 4.5, 1.5],
    elbowL:         [-1.4, 2.9, 1.6],
    elbowR:         [1.4, 2.9, 1.6],
    wristL:         [-1.4, 1.4, 1.6],
    wristR:         [1.4, 1.4, 1.6],
    spine:          [0, 4.3, 0.4],
    hipCenter:      [0, 3.8, -0.9],
    hipL:           [-0.9, 3.7, -0.9],
    hipR:           [0.9, 3.7, -0.9],
    kneeL:          [-0.9, 2.3, 0.4],
    kneeR:          [0.9, 2.3, 0.4],
    ankleL:         [-0.9, 0.4, 0],
    ankleR:         [0.9, 0.4, 0],
    footL:          [-0.9, 0.1, 0.5],
    footR:          [0.9, 0.1, 0.5],
  };

  const CURL_DOWN = {
    head:           [0, 9.2, 0],
    neck:           [0, 8.4, 0],
    shoulderL:      [-1.4, 8.3, 0],
    shoulderR:      [1.4, 8.3, 0],
    elbowL:         [-1.5, 6.4, 0.0],
    elbowR:         [1.5, 6.4, 0.0],
    wristL:         [-1.5, 4.6, 0.2],
    wristR:         [1.5, 4.6, 0.2],
    spine:          [0, 7.0, 0],
    hipCenter:      [0, 5.4, 0],
    hipL:           [-0.9, 5.3, 0],
    hipR:           [0.9, 5.3, 0],
    kneeL:          [-0.9, 2.9, 0.1],
    kneeR:          [0.9, 2.9, 0.1],
    ankleL:         [-0.9, 0.4, 0],
    ankleR:         [0.9, 0.4, 0],
    footL:          [-0.9, 0.1, 0.5],
    footR:          [0.9, 0.1, 0.5],
  };

  const CURL_UP = {
    head:           [0, 9.2, 0],
    neck:           [0, 8.4, 0],
    shoulderL:      [-1.4, 8.3, 0],
    shoulderR:      [1.4, 8.3, 0],
    elbowL:         [-1.3, 6.3, 0.2],
    elbowR:         [1.3, 6.3, 0.2],
    wristL:         [-1.2, 7.8, 1.2],
    wristR:         [1.2, 7.8, 1.2],
    spine:          [0, 7.0, 0],
    hipCenter:      [0, 5.4, 0],
    hipL:           [-0.9, 5.3, 0],
    hipR:           [0.9, 5.3, 0],
    kneeL:          [-0.9, 2.9, 0.1],
    kneeR:          [0.9, 2.9, 0.1],
    ankleL:         [-0.9, 0.4, 0],
    ankleR:         [0.9, 0.4, 0],
    footL:          [-0.9, 0.1, 0.5],
    footR:          [0.9, 0.1, 0.5],
  };

  const BONES = [
    ['head', 'neck'],
    ['neck', 'shoulderL'], ['neck', 'shoulderR'],
    ['shoulderL', 'elbowL'], ['shoulderR', 'elbowR'],
    ['elbowL', 'wristL'], ['elbowR', 'wristR'],
    ['neck', 'spine'],
    ['spine', 'hipCenter'],
    ['hipCenter', 'hipL'], ['hipCenter', 'hipR'],
    ['hipL', 'kneeL'], ['hipR', 'kneeR'],
    ['kneeL', 'ankleL'], ['kneeR', 'ankleR'],
    ['ankleL', 'footL'], ['ankleR', 'footR'],
    ['shoulderL', 'shoulderR'],
    ['hipL', 'hipR'],
  ];

  const JOINT_COLORS = {
    head: 0xff6b35, neck: 0xff6b35,
    shoulderL: 0x00e5ff, shoulderR: 0x00e5ff,
    elbowL: 0x00e5ff, elbowR: 0x00e5ff,
    wristL: 0x00e5ff, wristR: 0x00e5ff,
    spine: 0xff6b35, hipCenter: 0xff6b35,
    hipL: 0xff6b35, hipR: 0xff6b35,
    kneeL: 0xff6b35, kneeR: 0xff6b35,
    ankleL: 0xff6b35, ankleR: 0xff6b35,
  };

  // ── Create Joint Spheres ──
  const joints = {};
  const jointGlow = {};

  Object.keys(STANDING).forEach((name) => {
    const color = JOINT_COLORS[name] || 0xff6b35;

    // Inner dot
    const geo = new THREE.SphereGeometry(0.13, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...STANDING[name]);
    scene.add(mesh);
    joints[name] = mesh;

    // Outer glow ring
    const glowGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.set(...STANDING[name]);
    scene.add(glowMesh);
    jointGlow[name] = glowMesh;
  });

  // Highlight head
  joints.head.geometry.dispose();
  joints.head.geometry = new THREE.SphereGeometry(0.42, 16, 16);
  jointGlow.head.geometry.dispose();
  jointGlow.head.geometry = new THREE.SphereGeometry(0.55, 16, 16);

  // ── Create Futuristic Holographic Cylinder Mannequin ──
  function createHolographicCylinder(radius, color) {
    // Generate open-ended cylinders for technical scanning styling
    const geo = new THREE.CylinderGeometry(radius, radius, 1.0, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      wireframe: true,
      side: THREE.DoubleSide
    });
    return new THREE.Mesh(geo, mat);
  }

  const torso = createHolographicCylinder(0.9, 0xff6b35);
  const upperLegL = createHolographicCylinder(0.35, 0xff6b35);
  const upperLegR = createHolographicCylinder(0.35, 0xff6b35);
  const lowerLegL = createHolographicCylinder(0.28, 0xff6b35);
  const lowerLegR = createHolographicCylinder(0.28, 0xff6b35);
  const upperArmL = createHolographicCylinder(0.25, 0x00e5ff);
  const upperArmR = createHolographicCylinder(0.25, 0x00e5ff);

  scene.add(torso);
  scene.add(upperLegL);
  scene.add(upperLegR);
  scene.add(lowerLegL);
  scene.add(lowerLegR);
  scene.add(upperArmL);
  scene.add(upperArmR);

  // Expose color updater so main coach switcher can change visualizer color themes
  window.updateMannequinColors = function(colorHex, color2Hex) {
    const color = new THREE.Color(colorHex);
    if (typeof gsap !== 'undefined') {
      Object.keys(jointGlow).forEach(name => {
        gsap.to(jointGlow[name].material.color, { r: color.r, g: color.g, b: color.b, duration: 0.5 });
      });
      [torso, upperLegL, upperLegR, lowerLegL, lowerLegR, upperArmL, upperArmR].forEach(mesh => {
        gsap.to(mesh.material.color, { r: color.r, g: color.g, b: color.b, duration: 0.5 });
      });
      gsap.to(scanLine.material.color, { r: color.r, g: color.g, b: color.b, duration: 0.5 });
    } else {
      Object.keys(jointGlow).forEach(name => jointGlow[name].material.color.copy(color));
      [torso, upperLegL, upperLegR, lowerLegL, lowerLegR, upperArmL, upperArmR].forEach(mesh => mesh.material.color.copy(color));
      scanLine.material.color.copy(color);
    }
  };

  // ── Create Bone Lines ──
  const boneMeshes = [];
  BONES.forEach(([j1, j2]) => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    let color = 0xff6b35;
    if (['shoulderL','elbowL','wristL','shoulderR','elbowR','wristR'].includes(j1) ||
        ['shoulderL','elbowL','wristL','shoulderR','elbowR','wristR'].includes(j2)) {
      color = 0x00e5ff;
    }
    if (['hipL','kneeL','ankleL','footL','hipR','kneeR','ankleR','footR'].includes(j1) ||
        ['hipL','kneeL','ankleL','footL','hipR','kneeR','ankleR','footR'].includes(j2)) {
      color = 0xff6b35;
    }

    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
    });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    boneMeshes.push({ line, geo, j1, j2 });
  });

  // ── Angle Arc Visualization ──
  function createAngleArc() {
    const curveGeo = new THREE.BufferGeometry();
    const points = new Float32Array(32 * 3);
    curveGeo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xff6b35,
      transparent: true,
      opacity: 0.7,
    });
    const line = new THREE.Line(curveGeo, mat);
    scene.add(line);
    return { line, geo: curveGeo };
  }

  const primaryAngleArc = createAngleArc();
  const secondaryAngleArc = createAngleArc();

  // ── Scanning Line Effect ──
  const scanLineGeo = new THREE.PlaneGeometry(5.5, 0.02);
  const scanLineMat = new THREE.MeshBasicMaterial({
    color: 0xff6b35,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
  });
  const scanLine = new THREE.Mesh(scanLineGeo, scanLineMat);
  scanLine.position.z = 0.5;
  scene.add(scanLine);

  // ── Helpers ──
  function lerpPos(standing, squat, t) {
    return [
      standing[0] + (squat[0] - standing[0]) * t,
      standing[1] + (squat[1] - standing[1]) * t,
      standing[2] + (squat[2] - standing[2]) * t,
    ];
  }

  function calcAngle(p1, p2, p3) {
    const v1 = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
    const v2 = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
    const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
    const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
    return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI);
  }

  function drawAngleArc(arcObj, vertex, p1, p2, radius, color) {
    const v1 = [p1[0] - vertex[0], p1[1] - vertex[1], p1[2] - vertex[2]];
    const v2 = [p2[0] - vertex[0], p2[1] - vertex[1], p2[2] - vertex[2]];
    const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
    const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
    const nv1 = [v1[0] / mag1, v1[1] / mag1, v1[2] / mag1];
    const nv2 = [v2[0] / mag2, v2[1] / mag2, v2[2] / mag2];

    const posArr = arcObj.geo.attributes.position.array;
    const segments = 31;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const dir = [
        nv1[0] + (nv2[0] - nv1[0]) * t,
        nv1[1] + (nv2[1] - nv1[1]) * t,
        nv1[2] + (nv2[2] - nv1[2]) * t,
      ];
      const mag = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
      posArr[i * 3] = vertex[0] + (dir[0] / mag) * radius;
      posArr[i * 3 + 1] = vertex[1] + (dir[1] / mag) * radius;
      posArr[i * 3 + 2] = vertex[2] + (dir[2] / mag) * radius;
    }
    arcObj.geo.attributes.position.needsUpdate = true;
    arcObj.line.material.color.set(color);
  }

  function positionBodyPart(mesh, p1, p2) {
    const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
    mesh.position.set(mid[0], mid[1], mid[2]);
    const dir = new THREE.Vector3(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const len = dir.length();
    mesh.scale.y = len;
    mesh.lookAt(p2[0], p2[1], p2[2]);
    mesh.rotateX(Math.PI / 2);
  }

  // ── UI Selectors and HUD Bindings ──
  const kneeAngleEl = document.getElementById('knee-angle');
  const backAngleEl = document.getElementById('back-angle');
  const formScoreEl = document.getElementById('form-score');
  const depthEl = document.getElementById('squat-depth');
  const correctionEl = document.getElementById('correction-text');
  const scoreCircleEl = document.getElementById('score-circle-progress');

  const badFormBtn = document.getElementById('bad-form-btn');
  function toggleBadForm() {
    badFormSimulated = !badFormSimulated;
    if (badFormBtn) {
      badFormBtn.classList.toggle('active', badFormSimulated);
      badFormBtn.textContent = badFormSimulated ? 'RESET FORM' : 'SIMULATE BAD FORM';
      badFormBtn.setAttribute('aria-pressed', String(badFormSimulated));
    }
    if (window.audioSynth) {
      window.audioSynth.playBlip(badFormSimulated ? 400 : 800, 0.08);
    }
  }
  if (badFormBtn) badFormBtn.addEventListener('click', toggleBadForm);

  // ── Pause / play control (WCAG 2.2.2: auto-animation must be stoppable) ──
  const pauseBtn = document.getElementById('demo-pause-btn');
  function setPaused(p) {
    paused = p;
    if (pauseBtn) {
      pauseBtn.textContent = paused ? '▶ PLAY' : '❚❚ PAUSE';
      pauseBtn.setAttribute('aria-pressed', String(paused));
      pauseBtn.setAttribute('aria-label', paused ? 'Play form demo animation' : 'Pause form demo animation');
    }
  }
  if (pauseBtn) pauseBtn.addEventListener('click', () => setPaused(!paused));
  // Honor the OS "reduce motion" setting: start paused so nothing auto-animates
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setPaused(true);
  }

  // ── Keyboard controls on the focusable demo: ← → rotate, Space simulate, P pause ──
  container.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft')       { userOrbit -= 0.25; e.preventDefault(); }
    else if (k === 'ArrowRight') { userOrbit += 0.25; e.preventDefault(); }
    else if (k === ' ' || k === 'Spacebar') { toggleBadForm(); e.preventDefault(); }
    else if (k === 'p' || k === 'P') { setPaused(!paused); e.preventDefault(); }
  });

  const tabs = document.querySelectorAll('.exercise-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeEx = tab.getAttribute('data-ex');
      
      // Update label text based on exercise type
      const kneeLabel = document.querySelector('.hud-stat-box:nth-child(1) .hud-label');
      const backLabel = document.querySelector('.hud-stat-box:nth-child(2) .hud-label');
      const depthLabel = document.querySelector('.hud-stat-box:nth-child(3) .hud-label');
      
      if (activeEx === 'squat') {
        if (kneeLabel) kneeLabel.textContent = 'KNEE ANGLE';
        if (backLabel) backLabel.textContent = 'BACK LEAN';
        if (depthLabel) depthLabel.textContent = 'SQUAT DEPTH';
      } else if (activeEx === 'deadlift') {
        if (kneeLabel) kneeLabel.textContent = 'SHIN ANGLE';
        if (backLabel) backLabel.textContent = 'SPINE TILT';
        if (depthLabel) depthLabel.textContent = 'LIFT DEPTH';
      } else if (activeEx === 'curl') {
        if (kneeLabel) kneeLabel.textContent = 'ELBOW ANGLE';
        if (backLabel) backLabel.textContent = 'TORSO SWAY';
        if (depthLabel) depthLabel.textContent = 'CONTRACT STATUS';
      }

      if (window.audioSynth) {
        window.audioSynth.playBlip(700, 0.05);
      }
    });
  });

  // Mouse orbit
  let demoMouseX = 0;
  const canvasWrap = document.getElementById('demo-canvas-wrap');
  if (canvasWrap) {
    canvasWrap.addEventListener('mousemove', (e) => {
      const rect = canvasWrap.getBoundingClientRect();
      demoMouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    });
    canvasWrap.addEventListener('mouseleave', () => {
      demoMouseX = 0;
    });
  }

  // ── Animation Loop ──
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (!paused) simTime += delta;     // freeze time while paused → no jump on resume
    const elapsed = simTime;

    // Loop cycle speed
    const cycleSpeed = 0.45; 
    const rawT = (Math.sin(elapsed * cycleSpeed * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    
    // Ease-in-out
    const t = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

    // Load active coordinate templates
    let startPos = STANDING;
    let endPos = SQUAT;

    if (activeEx === 'deadlift') {
      startPos = STANDING;
      endPos = DEADLIFT_BENT;
    } else if (activeEx === 'curl') {
      startPos = CURL_DOWN;
      endPos = CURL_UP;
    }

    const currentPositions = {};
    Object.keys(startPos).forEach((name) => {
      let pos = lerpPos(startPos[name], endPos[name], t);

      // Inject bad form anomalies
      if (badFormSimulated) {
        if (activeEx === 'squat') {
          // Knee caving (X-axis collapse)
          if (name === 'kneeL') pos[0] += 0.55 * t;
          if (name === 'kneeR') pos[0] -= 0.55 * t;
          // Excessive lean forward
          if (name === 'head' || name === 'neck') pos[2] += 0.9 * t;
          if (name === 'shoulderL' || name === 'shoulderR') pos[2] += 0.8 * t;
          if (name === 'hipCenter' || name === 'hipL' || name === 'hipR') pos[2] -= 0.35 * t;
        } else if (activeEx === 'deadlift') {
          // Rounded spine hinge curvature
          if (name === 'spine') {
            pos[1] += 0.55 * t;
            pos[2] += 0.75 * t;
          }
          if (name === 'neck' || name === 'head') pos[1] -= 0.3 * t;
        } else if (activeEx === 'curl') {
          // Elbow flare (winging out)
          if (name === 'elbowL') pos[0] -= 0.65 * t;
          if (name === 'elbowR') pos[0] += 0.65 * t;
          if (name === 'shoulderL' || name === 'shoulderR') pos[2] += 0.25 * t;
        }
      }

      currentPositions[name] = pos;
      joints[name].position.set(...pos);
      jointGlow[name].position.set(...pos);
      
      // Glow pulse
      const pulse = 1 + Math.sin(elapsed * 4 + Object.keys(startPos).indexOf(name)) * 0.12;
      jointGlow[name].scale.setScalar(pulse);
    });

    // Update cylinder geometries
    positionBodyPart(torso, currentPositions.neck, currentPositions.hipCenter);
    positionBodyPart(upperLegL, currentPositions.hipL, currentPositions.kneeL);
    positionBodyPart(upperLegR, currentPositions.hipR, currentPositions.kneeR);
    positionBodyPart(lowerLegL, currentPositions.kneeL, currentPositions.ankleL);
    positionBodyPart(lowerLegR, currentPositions.kneeR, currentPositions.ankleR);
    positionBodyPart(upperArmL, currentPositions.shoulderL, currentPositions.elbowL);
    positionBodyPart(upperArmR, currentPositions.shoulderR, currentPositions.elbowR);

    // Update skeletal bone segments
    boneMeshes.forEach(({ geo, j1, j2 }) => {
      const p1 = currentPositions[j1];
      const p2 = currentPositions[j2];
      const posArr = geo.attributes.position.array;
      posArr[0] = p1[0]; posArr[1] = p1[1]; posArr[2] = p1[2];
      posArr[3] = p2[0]; posArr[4] = p2[1]; posArr[5] = p2[2];
      geo.attributes.position.needsUpdate = true;
    });

    // ── Telemetry Calculations & Labels Binding ──
    let kneeAngle = 180;
    let backAngle = 0;
    let depthStatus = 'PARALLEL ✓';
    let formScore = 95;
    let correction = '✓ Form looks great! Keep it up.';
    let correctionClass = 'good';

    if (activeEx === 'squat') {
      kneeAngle = calcAngle(currentPositions.hipR, currentPositions.kneeR, currentPositions.ankleR);
      backAngle = calcAngle(currentPositions.neck, currentPositions.hipCenter, [currentPositions.hipCenter[0], currentPositions.hipCenter[1] + 3, currentPositions.hipCenter[2]]);
      
      const hipY = currentPositions.hipCenter[1];
      const kneeY = currentPositions.kneeR[1];
      depthStatus = hipY <= kneeY + 0.4 ? 'PARALLEL ✓' : hipY <= kneeY + 1.2 ? 'ALMOST...' : 'QUARTER';

      if (badFormSimulated) {
        formScore = Math.max(48, Math.round(95 - (t * 42)));
        correction = '⚠ Knees caving & rounded back. Drive knees outward!';
        correctionClass = 'warn';
      } else {
        formScore = Math.round(95 + Math.sin(elapsed * 2) * 1.5);
      }
    } else if (activeEx === 'deadlift') {
      // Hinge back angle and knee flex
      backAngle = calcAngle(currentPositions.neck, currentPositions.hipCenter, [currentPositions.hipCenter[0], currentPositions.hipCenter[1] + 3, currentPositions.hipCenter[2]]);
      kneeAngle = calcAngle(currentPositions.hipR, currentPositions.kneeR, currentPositions.ankleR);
      
      const hipY = currentPositions.hipCenter[1];
      depthStatus = hipY <= 3.9 ? 'LOW' : 'MID-SHIN ✓';

      if (badFormSimulated) {
        formScore = Math.max(38, Math.round(95 - (t * 54)));
        correction = '⚠ Excessive back rounding! Flatten your spine.';
        correctionClass = 'warn';
      } else {
        formScore = Math.round(96 + Math.sin(elapsed) * 1.2);
      }
    } else if (activeEx === 'curl') {
      // Bicep hinge extension
      kneeAngle = calcAngle(currentPositions.shoulderR, currentPositions.elbowR, currentPositions.wristR);
      backAngle = calcAngle(currentPositions.neck, currentPositions.hipCenter, [currentPositions.hipCenter[0], currentPositions.hipCenter[1] + 3, currentPositions.hipCenter[2]]);
      
      depthStatus = t > 0.82 ? 'CONTRACT ✓' : 'ECCENTRIC';

      if (badFormSimulated) {
        formScore = Math.max(52, Math.round(95 - (t * 40)));
        correction = '⚠ Elbow flaring & torso swinging. Keep elbows tucked!';
        correctionClass = 'warn';
      } else {
        formScore = Math.round(98 - (t * 3));
      }
    }

    // ── Update HUD elements ──
    const okColor = 0x22c55e;
    const warnColor = 0xf59e0b;

    if (kneeAngleEl) {
      kneeAngleEl.textContent = Math.round(kneeAngle) + '°';
      kneeAngleEl.className = 'angle-value ' + (badFormSimulated && t > 0.4 ? 'warn' : 'good');
    }
    if (backAngleEl) {
      backAngleEl.textContent = Math.round(backAngle) + '°';
      backAngleEl.className = 'angle-value ' + (badFormSimulated && t > 0.4 ? 'warn' : 'good');
    }
    if (depthEl) {
      depthEl.textContent = depthStatus;
      depthEl.className = 'depth-value ' + (depthStatus.includes('✓') ? 'good' : '');
    }
    if (formScoreEl) {
      formScoreEl.textContent = formScore + '%';
    }
    if (correctionEl && correctionEl.textContent !== correction) {
      correctionEl.textContent = correction;          // guarded → aria-live announces only real changes
      correctionEl.className = 'correction-text ' + correctionClass;
    }

    // ── Update Arcs ──
    if (activeEx === 'squat') {
      drawAngleArc(primaryAngleArc, currentPositions.kneeR, currentPositions.hipR, currentPositions.ankleR, 1.0, badFormSimulated && t > 0.4 ? warnColor : okColor);
      drawAngleArc(secondaryAngleArc, currentPositions.hipCenter, currentPositions.neck, [currentPositions.hipCenter[0], currentPositions.hipCenter[1] + 2, currentPositions.hipCenter[2]], 1.2, badFormSimulated && t > 0.4 ? warnColor : okColor);
    } else if (activeEx === 'deadlift') {
      drawAngleArc(primaryAngleArc, currentPositions.hipCenter, currentPositions.neck, [currentPositions.hipCenter[0], currentPositions.hipCenter[1] + 2, currentPositions.hipCenter[2]], 1.2, badFormSimulated && t > 0.4 ? warnColor : okColor);
      drawAngleArc(secondaryAngleArc, currentPositions.kneeR, currentPositions.hipR, currentPositions.ankleR, 0.9, badFormSimulated && t > 0.4 ? warnColor : okColor);
    } else if (activeEx === 'curl') {
      drawAngleArc(primaryAngleArc, currentPositions.elbowR, currentPositions.shoulderR, currentPositions.wristR, 0.8, badFormSimulated && t > 0.4 ? warnColor : okColor);
      drawAngleArc(secondaryAngleArc, currentPositions.hipCenter, currentPositions.neck, [currentPositions.hipCenter[0], currentPositions.hipCenter[1] + 2, currentPositions.hipCenter[2]], 1.2, badFormSimulated && t > 0.4 ? warnColor : okColor);
    }

    if (scoreCircleEl) {
      const circumference = 2 * Math.PI * 54;
      const offset = circumference - (formScore / 100) * circumference;
      scoreCircleEl.style.strokeDashoffset = offset;
      scoreCircleEl.style.stroke = formScore >= 80 ? '#22c55e' : formScore >= 60 ? '#f59e0b' : '#ef4444';
    }

    // Scanline translation
    const scanY = (Math.sin(elapsed * 2) + 1) / 2 * 9.5 + 0.3;
    scanLine.position.y = scanY;
    scanLineMat.opacity = 0.12 + Math.sin(elapsed * 4) * 0.08;

    // Camera track
    const orbitAngle = elapsed * 0.12 + demoMouseX * 0.8 + userOrbit;
    const camRadius = 16;
    camera.position.x = Math.sin(orbitAngle) * camRadius;
    camera.position.z = Math.cos(orbitAngle) * camRadius;
    camera.position.y = 5 + Math.sin(elapsed * 0.25) * 0.5;
    camera.lookAt(0, 4.5, 0);

    renderer.render(scene, camera);
  }

  animate();

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);
})();
