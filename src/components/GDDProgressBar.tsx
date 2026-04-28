import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Text } from 'react-native';
import { GDD_STAGES, getProgressPercent, getStageForPercent } from '../services/gdd';

interface Props {
  accumulated: number;
  total: number;
}

export function GDDProgressBar({ accumulated, total }: Props) {
  const progress = getProgressPercent(accumulated, total);
  const stage = getStageForPercent(progress);
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: progress,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const widthInterp = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Stage emoji markers */}
      <View style={styles.stageRow}>
        {GDD_STAGES.map((s) => (
          <View
            key={s.name}
            style={[
              styles.stageMarker,
              // Position each marker at the start of its stage
              { left: `${s.minPercent}%` as unknown as number },
            ]}
          >
            <Text
              style={[
                styles.stageEmoji,
                progress >= s.minPercent ? styles.stageEmojiActive : styles.stageEmojiInactive,
              ]}
            >
              {s.emoji}
            </Text>
          </View>
        ))}
      </View>

      {/* Track + animated fill */}
      <View style={styles.track}>
        <Animated.View
          style={[styles.fill, { width: widthInterp, backgroundColor: stage.color }]}
        />
        {/* Subtle segment dividers */}
        {GDD_STAGES.slice(1).map((s) => (
          <View
            key={s.name}
            style={[styles.divider, { left: `${s.minPercent}%` as unknown as number }]}
          />
        ))}
      </View>

      {/* Stage label + percentage */}
      <View style={styles.labelRow}>
        <Text style={[styles.stageName, { color: stage.color }]}>
          {stage.emoji} {stage.name}
        </Text>
        <Text style={styles.percent}>{Math.round(progress)}%</Text>
      </View>
      <Text style={styles.gddText}>
        {Math.round(accumulated)} / {Math.round(total)} GDD accumulated
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },

  stageRow: {
    position: 'relative',
    height: 26,
    marginBottom: 4,
  },
  stageMarker: {
    position: 'absolute',
    transform: [{ translateX: -9 }],
  },
  stageEmoji: { fontSize: 17 },
  stageEmojiActive: { opacity: 1 },
  stageEmojiInactive: { opacity: 0.35 },

  track: {
    height: 18,
    backgroundColor: '#E0E0E0',
    borderRadius: 9,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: 9,
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  stageName: { fontSize: 13, fontWeight: '700' },
  percent: { fontSize: 13, color: '#333', fontWeight: '700' },
  gddText: { fontSize: 11, color: '#888', marginTop: 2 },
});
