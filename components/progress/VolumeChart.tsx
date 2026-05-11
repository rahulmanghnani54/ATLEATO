import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { WeeklyVolume } from '@/hooks/useProgressStats';

interface Props {
  data: WeeklyVolume[];
}

const CHART_HEIGHT = 140;
const BAR_GAP = 4;

export function VolumeChart({ data }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - Spacing.md * 4; // account for card padding
  const maxVolume = Math.max(...data.map((d) => d.totalVolumeKg), 1);
  const barWidth = (chartWidth - BAR_GAP * (data.length - 1)) / Math.max(data.length, 1);

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Complete workouts to see your volume chart</Text>
      </View>
    );
  }

  return (
    <View>
      <Svg width={chartWidth} height={CHART_HEIGHT + 30}>
        {/* Bars */}
        {data.map((d, i) => {
          const barHeight = Math.max((d.totalVolumeKg / maxVolume) * CHART_HEIGHT, 2);
          const x = i * (barWidth + BAR_GAP);
          const y = CHART_HEIGHT - barHeight;
          const isLast = i === data.length - 1;

          return (
            <React.Fragment key={d.weekStart}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill={isLast ? Colors.primary : '#e5e7eb'}
              />
              <SvgText
                x={x + barWidth / 2}
                y={CHART_HEIGHT + 16}
                textAnchor="middle"
                fontSize={9}
                fill={Colors.textSecondary}
                fontFamily="Inter_400Regular"
              >
                {d.weekLabel}
              </SvgText>
            </React.Fragment>
          );
        })}
        {/* Baseline */}
        <Line
          x1={0} y1={CHART_HEIGHT}
          x2={chartWidth} y2={CHART_HEIGHT}
          stroke={Colors.border} strokeWidth={1}
        />
      </Svg>
      <View style={styles.legend}>
        <Text style={styles.legendText}>
          {data[data.length - 1]?.weekLabel}: {Math.round(data[data.length - 1]?.totalVolumeKg ?? 0).toLocaleString()}kg
        </Text>
        <Text style={styles.legendText}>
          {data[data.length - 1]?.workoutCount} session{data[data.length - 1]?.workoutCount !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  );
}

// React import needed for Fragment in JSX
import React from 'react';

const styles = StyleSheet.create({
  empty: { height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...Typography.caption, color: Colors.textTertiary, textAlign: 'center' },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  legendText: { ...Typography.caption, color: Colors.textSecondary },
});
