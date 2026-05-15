import type { Keypoint } from '@tensorflow-models/pose-detection';

// MoveNet keypoint indices
const KP = {
  NOSE: 0,
  LEFT_EYE: 1, RIGHT_EYE: 2,
  LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16,
} as const;

export interface PoseCorrection {
  severity: 'good' | 'warning' | 'error';
  message: string;
  /** Machine-readable key used by the Claude cue layer to group issues */
  issueKey?: string;
}

function getKp(keypoints: Keypoint[], idx: number): { x: number; y: number; score: number } | null {
  const kp = keypoints[idx];
  if (!kp || (kp.score ?? 0) < 0.3) return null;
  return { x: kp.x, y: kp.y, score: kp.score ?? 0 };
}

function angleDeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dot / (magAB * magCB)))) * (180 / Math.PI);
}

// ─── Bilateral asymmetry ──────────────────────────────────────────────────────

export function analyzeBilateral(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const lShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const rShoulder = getKp(keypoints, KP.RIGHT_SHOULDER);
  const lHip = getKp(keypoints, KP.LEFT_HIP);
  const lKnee = getKp(keypoints, KP.LEFT_KNEE);
  const lAnkle = getKp(keypoints, KP.LEFT_ANKLE);
  const rHip = getKp(keypoints, KP.RIGHT_HIP);
  const rKnee = getKp(keypoints, KP.RIGHT_KNEE);
  const rAnkle = getKp(keypoints, KP.RIGHT_ANKLE);

  // Shoulder height imbalance
  if (lShoulder && rShoulder) {
    const diff = Math.abs(lShoulder.y - rShoulder.y);
    if (diff > 15) {
      const higher = lShoulder.y < rShoulder.y ? 'Left' : 'Right';
      corrections.push({
        severity: 'warning',
        message: `${higher} shoulder is higher than the other — even out your bar path (${Math.round(diff)}px difference).`,
        issueKey: 'shoulder_height_imbalance',
      });
    }
  }

  // Knee angle asymmetry
  if (lHip && lKnee && lAnkle && rHip && rKnee && rAnkle) {
    const leftKneeAngle = angleDeg(lHip, lKnee, lAnkle);
    const rightKneeAngle = angleDeg(rHip, rKnee, rAnkle);
    const diff = Math.abs(leftKneeAngle - rightKneeAngle);
    if (diff > 20) {
      const worse = leftKneeAngle > rightKneeAngle ? 'Right' : 'Left';
      corrections.push({
        severity: 'warning',
        message: `${worse} knee is bending more than the other (${Math.round(diff)}° depth difference) — check both legs are loaded evenly.`,
        issueKey: 'knee_angle_asymmetry',
      });
    }
  }

  return corrections;
}

// ─── Velocity helper ──────────────────────────────────────────────────────────

/** Returns the maximum single-frame wrist descent (positive = moving downward / increasing Y).
 *  Uses rolling max of consecutive differences to detect any fast burst, not just an average. */
function wristDescentRate(wristYHistory: number[]): number {
  if (wristYHistory.length < 2) return 0;
  let max = 0;
  for (let i = 1; i < wristYHistory.length; i++) {
    max = Math.max(max, wristYHistory[i] - wristYHistory[i - 1]);
  }
  return max;
}

// ─── Exercise analyzers ───────────────────────────────────────────────────────

export function analyzeSquat(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle > 160) {
      corrections.push({ severity: 'good', message: `Knee angle: ${kneeAngle}° — standing tall, ready to squat.`, issueKey: 'squat_standing' });
    } else if (kneeAngle < 100) {
      corrections.push({ severity: 'good', message: `Knee angle: ${kneeAngle}° — great depth, below parallel!`, issueKey: 'squat_good_depth' });
    } else if (kneeAngle < 130) {
      corrections.push({ severity: 'warning', message: `Knee angle: ${kneeAngle}° — go deeper, target <100° for below parallel.`, issueKey: 'squat_insufficient_depth' });
    }

    // Knee valgus check
    const xDiff = Math.abs(leftKnee.x - leftAnkle.x);
    if (xDiff > 40) {
      corrections.push({
        severity: 'error',
        message: `Knee caving inward (${Math.round(xDiff)}px offset) — drive your knees out over your toes.`,
        issueKey: 'knee_valgus_left',
      });
    }
  }

  if (leftShoulder && leftHip && leftKnee) {
    const torsoAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (torsoAngle < 145) {
      corrections.push({
        severity: 'warning',
        message: `Torso angle: ${torsoAngle}° — keep your chest up, too much forward lean.`,
        issueKey: 'squat_forward_lean',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Good form — keep it up!' });
  }
  return corrections;
}

export function analyzeBenchPress(keypoints: Keypoint[], wristYHistory: number[] = []): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);
  const rightShoulder = getKp(keypoints, KP.RIGHT_SHOULDER);
  const rightElbow = getKp(keypoints, KP.RIGHT_ELBOW);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle < 80) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — good depth, chest touched!`, issueKey: 'bench_good_depth' });
    } else if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — arms locked out at top.`, issueKey: 'bench_lockout' });
    }

    if (leftShoulder && rightShoulder && leftElbow && rightElbow) {
      const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
      const elbowWidth = Math.abs(rightElbow.x - leftElbow.x);
      if (elbowWidth > shoulderWidth * 1.4) {
        corrections.push({
          severity: 'warning',
          message: `Elbows flared ${Math.round(elbowWidth)}px wide vs ${Math.round(shoulderWidth)}px shoulder width — tuck in at ~45° to protect your shoulders.`,
          issueKey: 'bench_elbow_flare',
        });
      }
    }
  }

  // Velocity cue: fast descent
  if (wristYHistory.length >= 5) {
    const rate = wristDescentRate(wristYHistory);
    if (rate > 8) {
      corrections.push({
        severity: 'warning',
        message: `Bar descending at ${rate.toFixed(1)}px/frame — lower the bar slower, aim for 2–3 seconds down.`,
        issueKey: 'bench_descent_too_fast',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Looking good — maintain arch and leg drive.' });
  }
  return corrections;
}

export function analyzeDeadlift(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);

  if (leftShoulder && leftHip) {
    if (leftShoulder.y < leftHip.y && Math.abs(leftShoulder.x - leftHip.x) < 20) {
      corrections.push({ severity: 'warning', message: 'Hinge at the hips — push them back before bending.', issueKey: 'deadlift_no_hip_hinge' });
    }
  }
  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle < 100) {
      corrections.push({ severity: 'good', message: `Knee angle: ${kneeAngle}° — good setup position.`, issueKey: 'deadlift_good_setup' });
    }
  }
  if (leftShoulder && leftHip && leftKnee) {
    const backAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (backAngle < 100) {
      corrections.push({ severity: 'error', message: `Back angle: ${backAngle}° — spinal flexion detected. Keep your back neutral.`, issueKey: 'deadlift_spinal_flexion' });
    } else {
      corrections.push({ severity: 'good', message: `Back angle: ${backAngle}° — neutral spine, good.`, issueKey: 'deadlift_neutral_spine' });
    }
  }
  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Maintain bar close to legs throughout the lift.' });
  }
  return corrections;
}

export function analyzeOhp(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — full lockout, great!`, issueKey: 'ohp_lockout' });
    } else if (elbowAngle < 90) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — starting position, drive the bar overhead.`, issueKey: 'ohp_start' });
    }
  }
  corrections.push({ severity: 'good', message: 'Keep core braced and avoid lower back arch.', issueKey: 'ohp_core' });
  return corrections;
}

export function analyzeRomanianDeadlift(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle < 150) {
      corrections.push({ severity: 'warning', message: `Knee angle: ${kneeAngle}° — RDL should have soft knees (~160°), not a deep squat.`, issueKey: 'rdl_excessive_knee_bend' });
    }
  }
  if (leftShoulder && leftHip && leftKnee) {
    const backAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (backAngle < 100) {
      corrections.push({ severity: 'error', message: `Back angle: ${backAngle}° — back rounding detected. Hinge from the hips with a neutral spine.`, issueKey: 'rdl_back_rounding' });
    } else {
      corrections.push({ severity: 'good', message: `Hip hinge angle: ${backAngle}° — neutral spine, good.` });
    }
  }
  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Good RDL form — keep the bar close to your legs.' });
  }
  return corrections;
}

export function analyzeBarbellRow(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);

  if (leftShoulder && leftHip && leftKnee) {
    const torsoAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (torsoAngle > 60) {
      corrections.push({ severity: 'warning', message: `Torso angle: ${torsoAngle}° — too upright for bent-over row. Hinge to ~45° for maximum back activation.`, issueKey: 'row_torso_too_upright' });
    } else {
      corrections.push({ severity: 'good', message: `Torso angle: ${torsoAngle}° — good hinge position.` });
    }
  }
  if (leftShoulder && leftElbow && leftElbow.y < leftShoulder.y) {
    corrections.push({ severity: 'good', message: 'Elbows pulling past torso — full range of motion.', issueKey: 'row_full_rom' });
  }
  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Drive elbows back and squeeze the shoulder blades together.' });
  }
  return corrections;
}

export function analyzeLatPulldown(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle < 80) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — full contraction at bottom!`, issueKey: 'lat_pulldown_full_contraction' });
    } else if (elbowAngle > 150) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — arms extended at top, full stretch.` });
    }
  }
  corrections.push({ severity: 'good', message: 'Keep chest tall, pull elbows down and back.', issueKey: 'lat_pulldown_form_cue' });
  return corrections;
}

export function analyzeBicepCurl(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle < 60) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — good peak contraction!`, issueKey: 'curl_peak_contraction' });
    } else if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — full extension at bottom.` });
    }
    if (leftElbow.x < leftShoulder.x - 30) {
      corrections.push({ severity: 'warning', message: 'Elbow drifting forward — keep upper arms pinned to your sides to isolate the bicep.', issueKey: 'curl_elbow_drift' });
    }
  }
  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Squeeze at the top, control the descent.' });
  }
  return corrections;
}

export function analyzeTricepPushdown(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — full lockout, good tricep contraction!`, issueKey: 'tricep_pushdown_lockout' });
    }
    if (Math.abs(leftElbow.x - leftShoulder.x) > 40) {
      corrections.push({ severity: 'warning', message: `Elbows flaring (${Math.round(Math.abs(leftElbow.x - leftShoulder.x))}px) — pin upper arms to your sides.`, issueKey: 'tricep_elbow_flare' });
    }
  }
  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Control the weight on the way back up — slow eccentric.' });
  }
  return corrections;
}

export function analyzeLunge(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle < 100) {
      corrections.push({ severity: 'good', message: `Front knee angle: ${kneeAngle}° — good depth!`, issueKey: 'lunge_good_depth' });
    } else if (kneeAngle < 130) {
      corrections.push({ severity: 'warning', message: `Front knee angle: ${kneeAngle}° — step further or sink lower, target ~90°.`, issueKey: 'lunge_insufficient_depth' });
    }
    const kneeDrift = leftKnee.x - leftAnkle.x;
    if (Math.abs(kneeDrift) > 30) {
      corrections.push({ severity: 'warning', message: `Knee drifting ${kneeDrift > 0 ? 'outward' : 'inward'} over ankle (${Math.round(Math.abs(kneeDrift))}px) — keep knee aligned over foot.`, issueKey: 'lunge_knee_drift' });
    }
  }
  if (leftShoulder && leftHip && leftKnee) {
    const torsoAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (torsoAngle < 140) {
      corrections.push({ severity: 'warning', message: `Torso angle: ${torsoAngle}° — keep your torso upright during the lunge.`, issueKey: 'lunge_forward_lean' });
    }
  }
  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Good lunge form — controlled descent.' });
  }
  return corrections;
}

export function analyzeHipThrust(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle >= 80 && kneeAngle <= 110) {
      corrections.push({ severity: 'good', message: `Knee angle: ${kneeAngle}° — good foot position for hip thrust.` });
    } else if (kneeAngle > 110) {
      corrections.push({ severity: 'warning', message: `Knee angle: ${kneeAngle}° — feet too far forward. Move them closer to your glutes.`, issueKey: 'hip_thrust_feet_too_far' });
    }
  }
  if (leftShoulder && leftHip && leftKnee) {
    const hipExtension = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (hipExtension > 160) {
      corrections.push({ severity: 'good', message: `Hip extension: ${hipExtension}° — full lockout, squeeze those glutes!`, issueKey: 'hip_thrust_full_extension' });
    } else if (hipExtension < 140) {
      corrections.push({ severity: 'warning', message: `Hip extension: ${hipExtension}° — drive hips higher for full glute activation.`, issueKey: 'hip_thrust_insufficient_extension' });
    }
  }
  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Drive hips up and squeeze hard at the top.' });
  }
  return corrections;
}

// ─── Exercise type detection ──────────────────────────────────────────────────

export type ExerciseType =
  | 'squat' | 'bench' | 'deadlift' | 'rdl' | 'ohp'
  | 'row' | 'lat_pulldown' | 'bicep_curl' | 'tricep_pushdown'
  | 'lunge' | 'hip_thrust' | 'generic';

export function detectExerciseType(name: string): ExerciseType {
  const n = name.toLowerCase();
  if (n.includes('romanian') || n.includes('rdl')) return 'rdl';
  if (n.includes('hip thrust')) return 'hip_thrust';
  if (n.includes('lunge')) return 'lunge';
  if (n.includes('squat')) return 'squat';
  if (n.includes('bench') || (n.includes('press') && n.includes('chest'))) return 'bench';
  if (n.includes('deadlift')) return 'deadlift';
  if (n.includes('overhead press') || n.includes('ohp') || n.includes('military press')) return 'ohp';
  if (n.includes('barbell row') || n.includes('bent-over row') || n.includes('bentover row')) return 'row';
  if (n.includes('lat pulldown') || n.includes('lat pull')) return 'lat_pulldown';
  if (n.includes('bicep curl') || n.includes('bicep')) return 'bicep_curl';
  if (n.includes('tricep pushdown') || n.includes('tricep')) return 'tricep_pushdown';
  return 'generic';
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function analyzeForm(
  keypoints: Keypoint[],
  exerciseName: string,
  wristYHistory: number[] = []
): PoseCorrection[] {
  const type = detectExerciseType(exerciseName);
  let corrections: PoseCorrection[];

  switch (type) {
    case 'squat':           corrections = analyzeSquat(keypoints); break;
    case 'bench':           corrections = analyzeBenchPress(keypoints, wristYHistory); break;
    case 'deadlift':        corrections = analyzeDeadlift(keypoints); break;
    case 'rdl':             corrections = analyzeRomanianDeadlift(keypoints); break;
    case 'ohp':             corrections = analyzeOhp(keypoints); break;
    case 'row':             corrections = analyzeBarbellRow(keypoints); break;
    case 'lat_pulldown':    corrections = analyzeLatPulldown(keypoints); break;
    case 'bicep_curl':      corrections = analyzeBicepCurl(keypoints); break;
    case 'tricep_pushdown': corrections = analyzeTricepPushdown(keypoints); break;
    case 'lunge':           corrections = analyzeLunge(keypoints); break;
    case 'hip_thrust':      corrections = analyzeHipThrust(keypoints); break;
    default:                corrections = [{ severity: 'good', message: 'Hold position — analysing...' }];
  }

  return [...corrections, ...analyzeBilateral(keypoints)];
}

// ─── Skeleton bone connections (unchanged) ────────────────────────────────────

export const POSE_CONNECTIONS: [number, number][] = [
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER, KP.LEFT_HIP],
  [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.LEFT_KNEE],
  [KP.LEFT_KNEE, KP.LEFT_ANKLE],
  [KP.RIGHT_HIP, KP.RIGHT_KNEE],
  [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
  [KP.NOSE, KP.LEFT_EYE],
  [KP.NOSE, KP.RIGHT_EYE],
];
