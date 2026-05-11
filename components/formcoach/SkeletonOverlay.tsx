import Svg, { Circle, Line } from 'react-native-svg';
import type { Keypoint } from '@tensorflow-models/pose-detection';
import { POSE_CONNECTIONS } from '@/lib/poseAnalyzer';

interface Props {
  keypoints: Keypoint[];
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

const MIN_CONFIDENCE = 0.3;
const JOINT_COLOR = '#ff6b35';
const BONE_COLOR = 'rgba(255, 107, 53, 0.7)';

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
            stroke="#fff"
            strokeWidth={1.5}
          />
        );
      })}
    </Svg>
  );
}
