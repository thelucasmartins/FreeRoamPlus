import { StyleSheet, View } from 'react-native';

import { sampleProfileForChart } from '../elevation/profile';
import type { ElevationProfile } from '../elevation/types';

interface ElevationChartProps {
  profile: ElevationProfile;
}

const BAR_COUNT = 28;
const MODERATE_GRADE_PERCENT = 5;
const STEEP_GRADE_PERCENT = 10;

function gradeColor(gradePercent: number): string {
  if (gradePercent >= STEEP_GRADE_PERCENT) return '#c1443a';
  if (gradePercent >= MODERATE_GRADE_PERCENT) return '#e0a930';
  return '#4a6b3a';
}

/** Bar-sparkline elevation profile (spec §13), colored by local grade rather than a single overall figure. */
export function ElevationChart({ profile }: ElevationChartProps) {
  const bars = sampleProfileForChart(profile, BAR_COUNT);

  return (
    <View style={styles.chart}>
      {bars.map((bar, i) => (
        <View key={i} style={styles.barTrack}>
          <View
            style={[
              styles.bar,
              { height: `${Math.max(6, bar.heightFraction * 100)}%`, backgroundColor: gradeColor(bar.gradePercent) },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 40,
    gap: 1,
  },
  barTrack: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: 1,
    minHeight: 3,
  },
});
