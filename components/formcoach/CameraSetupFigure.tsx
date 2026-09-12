/**
 * CameraSetupFigure — where to put the phone, as a picture.
 *
 * The engine cannot measure the camera angle, so the setup instructions are
 * the ONLY thing standing between the user and a set judged from a view the
 * checks were never written for (elbow flare read from the side, shin angle
 * from the front). Words alone lose that argument; a diagram of a body, a
 * floor and a phone wins it in a glance.
 *
 * One scene, two figures. A shallow floor arc sits under the lifter and the
 * phone stands on that arc, so the three recommended angles read as three
 * positions on one dial rather than three unrelated drawings: the arc's right
 * end is beside the lifter, its bottom is nearest the viewer. A short dashed
 * line from the phone toward the torso says what the phone is looking at.
 *
 * Flat 3 px round-cap strokes only — no gradients, glow or text — so it sits
 * on the technique page like an instruction, not an illustration. Ink carries
 * the body, bench and floor; the persona accent is spent on the phone alone,
 * because the phone is the one thing the user is being asked to move.
 *
 * Every coordinate is fixed arithmetic: the same props always draw the same
 * picture.
 */
import { type JSX } from 'react';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

export type FigureOrientation = 'lying' | 'standing';
export type FigureCameraAngle = 'side' | 'front' | 'front_45';

export interface CameraSetupFigureProps {
  orientation: FigureOrientation;
  cameraAngle: FigureCameraAngle;
  /** Persona accent — used for the phone only. */
  accent: string;
  /** Page ink — figure, bench, floor and sight-line. */
  ink: string;
  width: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene geometry (viewBox units)
// ─────────────────────────────────────────────────────────────────────────────

const VB_W = 240;
const VB_H = 132;
// Cropped from the top: the tallest element (a standing head) starts at y≈28.
const VIEW_BOX = `0 16 ${VB_W} ${VB_H}`;

const STROKE = 3;

/** The floor: front half of an ellipse centred under the lifter's feet. */
const FLOOR = { cx: 120, cy: 112, rx: 92, ry: 28 };
// Sweep flag 0 = the half that passes BELOW the centre (toward the viewer), so
// the arc never crosses the body.
const FLOOR_ARC = `M ${FLOOR.cx - FLOOR.rx} ${FLOOR.cy} A ${FLOOR.rx} ${FLOOR.ry} 0 0 0 ${FLOOR.cx + FLOOR.rx} ${FLOOR.cy}`;

const PHONE_W = 12;
const PHONE_H = 22;
/** Distance from the phone's centre to its camera dot. */
const LENS_OFFSET = 7;

/** The dashed sight-line: starts clear of the phone body, stays short. */
const SIGHT_GAP = 14;
const SIGHT_LEN = 22;
/** Never run the line into the body — it points AT the torso, it does not touch it. */
const SIGHT_MARGIN = 8;

interface Pt {
  x: number;
  y: number;
}

/**
 * Where on the floor arc the phone stands, in degrees: 0 = the arc's right end
 * (beside the lifter), 90 = its bottom (nearest the viewer). The standing
 * figure faces the viewer, so "front" is near the bottom; the lying figure is
 * drawn in profile with the feet to the right, so "front" (foot of the bench)
 * is the right end and "side" is the viewer's own position.
 */
const RING_ANGLE: Record<FigureOrientation, Record<FigureCameraAngle, number>> = {
  standing: { side: 0, front_45: 32, front: 78 },
  lying: { side: 90, front_45: 32, front: 0 },
};

/** What the sight-line points at. */
const AIM: Record<FigureOrientation, Pt> = {
  standing: { x: 120, y: 66 },
  lying: { x: 112, y: 80 },
};

const ACCESSIBILITY_LABEL: Record<FigureCameraAngle, string> = {
  side: 'Phone to your side, pointed at your torso.',
  front: 'Phone in front of you, pointed at your torso.',
  front_45: 'Phone in front of you, about 45 degrees to the side, pointed at your torso.',
};

function ringPoint(deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  return { x: FLOOR.cx + FLOOR.rx * Math.cos(rad), y: FLOOR.cy + FLOOR.ry * Math.sin(rad) };
}

function sightLine(from: Pt, to: Pt): { x1: number; y1: number; x2: number; y2: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const ux = dx / dist;
  const uy = dy / dist;
  const start = SIGHT_GAP;
  const end = Math.min(SIGHT_GAP + SIGHT_LEN, dist - SIGHT_MARGIN);
  return {
    x1: from.x + ux * start,
    y1: from.y + uy * start,
    x2: from.x + ux * end,
    y2: from.y + uy * end,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Figures — stroke, cap and colour are inherited from the wrapping <G>.
// ─────────────────────────────────────────────────────────────────────────────

/** Facing the viewer, feet on the floor's centre line. */
function StandingFigure(): JSX.Element {
  return (
    <>
      <Circle cx={120} cy={38} r={9} />
      {/* spine */}
      <Line x1={120} y1={47} x2={120} y2={88} />
      {/* shoulders + hanging arms */}
      <Line x1={104} y1={56} x2={136} y2={56} />
      <Line x1={104} y1={56} x2={98} y2={84} />
      <Line x1={136} y1={56} x2={142} y2={84} />
      {/* legs — hip-width, narrow enough that the front sight-line clears them */}
      <Line x1={120} y1={88} x2={113} y2={110} />
      <Line x1={120} y1={88} x2={127} y2={110} />
    </>
  );
}

/** In profile on a bench, head left, feet right, one arm up holding a bar. */
function LyingFigure(): JSX.Element {
  return (
    <>
      {/* bench: top + two legs down to the floor line */}
      <Line x1={66} y1={95} x2={168} y2={95} />
      <Line x1={80} y1={95} x2={80} y2={112} />
      <Line x1={140} y1={95} x2={140} y2={112} />
      {/* body along the bench */}
      <Circle cx={76} cy={86} r={8} />
      <Line x1={88} y1={88} x2={130} y2={88} />
      {/* arm up, bar end seen end-on */}
      <Line x1={94} y1={88} x2={94} y2={66} />
      <Circle cx={94} cy={61} r={4.5} />
      {/* thigh out, shin down to the floor */}
      <Line x1={130} y1={88} x2={150} y2={93} />
      <Line x1={150} y1={93} x2={150} y2={112} />
    </>
  );
}

export function CameraSetupFigure({
  orientation,
  cameraAngle,
  accent,
  ink,
  width,
}: CameraSetupFigureProps): JSX.Element {
  const height = Math.round((width * VB_H) / VB_W);

  const foot = ringPoint(RING_ANGLE[orientation][cameraAngle]);
  // The phone stands ON the arc: its bottom edge is the ring point.
  const phone: Pt = { x: foot.x, y: foot.y - PHONE_H / 2 };
  const sight = sightLine(phone, AIM[orientation]);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={VIEW_BOX}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${orientation === 'lying' ? 'Lying on a bench.' : 'Standing.'} ${ACCESSIBILITY_LABEL[cameraAngle]}`}
    >
      <G stroke={ink} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d={FLOOR_ARC} strokeOpacity={0.28} />
        {orientation === 'lying' ? <LyingFigure /> : <StandingFigure />}
        {/* Round caps grow each 3-unit dash by 1.5 at both ends: 6 on, 4 off. */}
        <Line
          x1={sight.x1}
          y1={sight.y1}
          x2={sight.x2}
          y2={sight.y2}
          strokeDasharray="3 7"
          strokeOpacity={0.55}
        />
      </G>

      {/* The phone — the only accent in the picture. */}
      <Rect
        x={phone.x - PHONE_W / 2}
        y={phone.y - PHONE_H / 2}
        width={PHONE_W}
        height={PHONE_H}
        rx={2.5}
        stroke={accent}
        strokeWidth={STROKE}
        fill="none"
      />
      <Circle cx={phone.x} cy={phone.y - LENS_OFFSET} r={1.5} fill={accent} />
    </Svg>
  );
}
