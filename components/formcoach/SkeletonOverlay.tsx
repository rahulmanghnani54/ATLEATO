import Svg, { Circle, Line } from 'react-native-svg';
import type { Keypoint } from '@tensorflow-models/pose-detection';
import { POSE_CONNECTIONS } from '@/lib/poseAnalyzer';
import { TOKENS } from '@/lib/theme';

interface Props {
  keypoints: Keypoint[];
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

const MIN_CONFIDENCE = 0.3;

// This overlay is drawn on the live camera feed, which is its own dark stage —
// it never sits on the themed page, so it is pinned to TOKENS.dark like the rest
// of the form-coach chrome instead of following the active scheme.
const stage = TOKENS.dark;
const JOINT_COLOR = stage.crownAccent;
const BONE_COLOR = stage.accentLine;
const JOINT_RING = stage.crownText;

export function SkeletonOverlay({ keypoints, width, height, scaleX, scaleY }: Props) {
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
      {/* Bones */}
      {POSE_CONNECTIONS.map(([startIdx, endIdx], i) => {
        const start = keypoints[startIdx];
        const end = keypoints[endIdx];
        if (
          !start || !end ||
          (start.score ?? 0) < MIN_CONFIDENCE ||
          (end.score ?? 0) < MIN_CONFIDENCE
        ) return null;
        return (
          <Line
            key={`bone-${i}`}
            x1={start.x * scaleX}
            y1={start.y * scaleY}
            x2={end.x * scaleX}
            y2={end.y * scaleY}
            stroke={BONE_COLOR}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        );
      })}
      {/* Joints */}
      {keypoints.map((kp, i) => {
        if ((kp.score ?? 0) < MIN_CONFIDENCE) return null;
        return (
          <Circle
            key={`joint-${i}`}
            cx={kp.x * scaleX}
            cy={kp.y * scaleY}
            r={5}
            fill={JOINT_COLOR}
            stroke={JOINT_RING}
            strokeWidth={1.5}
          />
        );
      })}
    </Svg>
  );
}
