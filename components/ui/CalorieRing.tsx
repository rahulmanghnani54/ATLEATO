import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Colors } from '@/constants/theme';

interface Props {
  consumed: number;
  goal: number;
  size?: number;
}

export function CalorieRing({ consumed, goal, size = 180 }: Props) {
  const strokeWidth = 14;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const strokeDashoffset = circumference * (1 - progress);
  const remaining = Math.max(goal - consumed, 0);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke="#f3f4f6" strokeWidth={strokeWidth} fill="none"
      />
      {/* Progress */}
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={Colors.primary} strokeWidth={strokeWidth} fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {/* Remaining label */}
      <SvgText
        x={size / 2} y={size / 2 - 10}
        textAnchor="middle" fontSize="32" fontWeight="700" fill="#111827"
      >
        {remaining}
      </SvgText>
      <SvgText
        x={size / 2} y={size / 2 + 16}
        textAnchor="middle" fontSize="13" fill="#6b7280"
      >
        kcal left
      </SvgText>
    </Svg>
  );
}
