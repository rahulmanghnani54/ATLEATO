/**
 * The 'press' profile serves the overhead press AND the bench press. Its
 * torso-stack check ("shoulders over your hips") is a statement about an upright
 * lifter; measured on a lying one it reads ~1.0 torso lengths against a critAt
 * of 0.38, i.e. a critical fault on every bench rep. These cases pin the
 * orientation guard so the shared profile cannot regress into that again.
 */
import { getProfile, runChecks } from '@/lib/vision/biomechanics';
import type { BodyCalibration, Kpt } from '@/lib/vision/calibration';

// MoveNet/BlazePose indices, as lib/vision/biomechanics.ts KP.
const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16, L_HIP = 23, R_HIP = 24;

const TORSO_PX = 200;
const SHOULDER_PX = 120;

const cal: BodyCalibration = {
  shoulderWidth: SHOULDER_PX,
  torsoLength: TORSO_PX,
  upperArmLen: 110,
  forearmLen: 100,
  thighLen: NaN,
  shinLen: NaN,
  scale: TORSO_PX,
  samples: 30,
  complete: true,
};

/** A skeleton with the torso rotated `degFromVertical` about the hips, arms
 *  locked out along the torso axis. 33 slots so index lookups never fall off. */
function skeleton(degFromVertical: number): Kpt[] {
  const k: Kpt[] = Array.from({ length: 33 }, () => [NaN, NaN, 0] as Kpt);
  const rad = (degFromVertical * Math.PI) / 180;
  const hipX = 400, hipY = 600;
  // Screen y grows downward, so "up the torso" is -cos.
  const shX = hipX + TORSO_PX * Math.sin(rad);
  const shY = hipY - TORSO_PX * Math.cos(rad);
  const put = (i: number, x: number, y: number) => { k[i] = [x, y, 0.95]; };
  put(L_HIP, hipX - 20, hipY); put(R_HIP, hipX + 20, hipY);
  put(L_SH, shX - SHOULDER_PX / 2, shY); put(R_SH, shX + SHOULDER_PX / 2, shY);
  // Arms straight up the torso axis from each shoulder (lockout).
  const ax = 110 * Math.sin(rad), ay = -110 * Math.cos(rad);
  put(L_EL, shX - SHOULDER_PX / 2 + ax, shY + ay);
  put(R_EL, shX + SHOULDER_PX / 2 + ax, shY + ay);
  put(L_WR, shX - SHOULDER_PX / 2 + ax * 1.9, shY + ay * 1.9);
  put(R_WR, shX + SHOULDER_PX / 2 + ax * 1.9, shY + ay * 1.9);
  return k;
}

const press = getProfile('press');
const stackFinding = (deg: number) =>
  runChecks(press, skeleton(deg), cal, 'top').find((f) => f.id === 'press.torso_stack');

describe('press.torso_stack is an upright-only check', () => {
  it('stays silent on a flat bench press (torso horizontal)', () => {
    expect(stackFinding(90)).toBeUndefined();
  });

  it('stays silent on an incline bench at 30deg (torso 60deg from vertical)', () => {
    expect(stackFinding(60)).toBeUndefined();
  });

  it('stays silent on a push-up (torso ~80deg from vertical)', () => {
    expect(stackFinding(80)).toBeUndefined();
  });

  it('still fires on an overhead press with a hard lay-back', () => {
    // sin(25deg) = 0.42 torso lengths of lean: past critAt 0.38.
    const f = stackFinding(25);
    expect(f).toBeDefined();
    expect(f!.severity).toBe('critical');
  });

  it('stays silent on a well-stacked overhead press', () => {
    expect(stackFinding(5)).toBeUndefined();
  });
});

describe('pull.torso_swing is an upright-only check', () => {
  const pull = getProfile('pull');
  const swing = (deg: number) =>
    runChecks(pull, skeleton(deg), cal, 'bottom').find((f) => f.id === 'pull.torso_swing');

  it('does not call a bent-over row set-up a swing', () => {
    expect(swing(60)).toBeUndefined();
  });

  it('still catches a kipping pull-up', () => {
    // sin(25deg) = 0.42 > critAt 0.4
    expect(swing(25)?.severity).toBe('critical');
  });
});

describe('squat.torso_pitch keeps the unconditional form', () => {
  it('a squat folded past 45deg is the fault, not an orientation to excuse', () => {
    const squat = getProfile('squat');
    const f = runChecks(squat, skeleton(50), cal, 'bottom').find((x) => x.id === 'squat.torso_pitch');
    expect(f?.severity).toBe('critical');
  });
});
