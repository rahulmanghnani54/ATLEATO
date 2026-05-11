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
}

function getKp(keypoints: Keypoint[], idx: number): { x: number; y: number; score: number } | null {
  const kp = keypoints[idx];
  if (!kp || (kp.score ?? 0) < 0.3) return null;
  return { x: kp.x, y: kp.y, score: kp.score ?? 0 };
}

function angleDeg(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dot / (magAB * magCB)))) * (180 / Math.PI);
}

export function analyzeSquat(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = angleDeg(leftHip, leftKnee, leftAnkle);
    if (kneeAngle > 160) {
      corrections.push({ severity: 'good', message: 'Standing tall — ready to squat.' });
    } else if (kneeAngle < 100) {
      corrections.push({ severity: 'good', message: 'Good depth — below parallel!' });
    } else if (kneeAngle < 130) {
      corrections.push({ severity: 'warning', message: 'Go deeper — aim for below parallel.' });
    }

    // Check knee cave (knee x should be between hip and ankle x in frontal view)
    if (Math.abs(leftKnee.x - leftAnkle.x) > 40) {
      corrections.push({ severity: 'warning', message: 'Drive your knees out over your toes.' });
    }
  }

  if (leftShoulder && leftHip && leftKnee) {
    const torsoAngle = angleDeg(
      { x: leftShoulder.x, y: leftShoulder.y },
      { x: leftHip.x, y: leftHip.y },
      { x: leftKnee.x, y: leftKnee.y },
    );
    if (torsoAngle < 145) {
      corrections.push({ severity: 'warning', message: 'Keep your chest up — torso too forward.' });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Good form — keep it up!' });
  }
  return corrections;
}

export function analyzeBenchPress(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);
  const rightShoulder = getKp(keypoints, KP.RIGHT_SHOULDER);
  const rightElbow = getKp(keypoints, KP.RIGHT_ELBOW);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = angleDeg(leftShoulder, leftElbow, leftWrist);
    if (elbowAngle < 80) {
      corrections.push({ severity: 'good', message: 'Good depth — chest touched!' });
    } else if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: 'Arms locked out at top.' });
    }

    // Check elbow flare (elbow should not be wider than shoulder significantly)
    if (leftShoulder && rightShoulder && leftElbow && rightElbow) {
      const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
      const elbowWidth = Math.abs(rightElbow.x - leftElbow.x);
      if (elbowWidth > shoulderWidth * 1.4) {
        corrections.push({ severity: 'warning', message: 'Tuck your elbows in at ~45° — protect your shoulders.' });
      }
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
    // Check hip hinge — shoulders should be roughly above or slightly in front of hips
    if (leftShoulder.y < leftHip.y && Math.abs(leftShoulder.x - leftHip.x) < 20) {
      corrections.push({ severity: 'warning', message: 'Hinge at the hips — push them back before bending.' });
    }
  }

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = angleDeg(leftHip, leftKnee, leftAnkle);
    if (kneeAngle < 100) {
      corrections.push({ severity: 'good', message: 'Good setup position.' });
    }
  }

  if (leftShoulder && leftHip && leftKnee) {
    const backAngle = angleDeg(leftShoulder, leftHip, leftKnee);
    if (backAngle < 100) {
      corrections.push({ severity: 'error', message: 'Keep your back straight — spinal flexion detected.' });
    } else {
      corrections.push({ severity: 'good', message: 'Neutral spine — good.' });
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
    const elbowAngle = angleDeg(leftShoulder, leftElbow, leftWrist);
    if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: 'Full lockout — great!' });
    } else if (elbowAngle < 90) {
      corrections.push({ severity: 'good', message: 'Starting position — drive the bar overhead.' });
    }
  }

  corrections.push({ severity: 'good', message: 'Keep core braced, no lower back arch.' });
  return corrections;
}

export type ExerciseType = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'generic';

export function detectExerciseType(name: string): ExerciseType {
  const n = name.toLowerCase();
  if (n.includes('squat') || n.includes('lunge')) return 'squat';
  if (n.includes('bench') || n.includes('press') && n.includes('chest')) return 'bench';
  if (n.includes('deadlift')) return 'deadlift';
  if (n.includes('overhead press') || n.includes('ohp')) return 'ohp';
  return 'generic';
}

export function analyzeForm(keypoints: Keypoint[], exerciseName: string): PoseCorrection[] {
  const type = detectExerciseType(exerciseName);
  switch (type) {
    case 'squat': return analyzeSquat(keypoints);
    case 'bench': return analyzeBenchPress(keypoints);
    case 'deadlift': return analyzeDeadlift(keypoints);
    case 'ohp': return analyzeOhp(keypoints);
    default: return [{ severity: 'good', message: 'Hold position — analysing...' }];
  }
}

// Skeleton bone connections
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
