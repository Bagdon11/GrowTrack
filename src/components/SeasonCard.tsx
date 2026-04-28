import React from 'react';
import { TouchableOpacity, View, StyleSheet, Text } from 'react-native';
import { Surface } from 'react-native-paper';

export interface SeasonInfo {
  key: 'spring' | 'summer' | 'autumn' | 'winter' | 'fruit';
  label: string;
  emoji: string;
  /** Default months — overridden at render time by the dynamic monthOverride prop */
  months: string;
  description: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

export const SEASONS: SeasonInfo[] = [
  {
    key: 'fruit',
    label: 'Fruit',
    emoji: '🍎',
    months: 'Plant May – Jul',
    description: 'Perennial trees, berries & canes',
    bgColor: '#FCE4EC',
    borderColor: '#F48FB1',
    textColor: '#880E4F',
  },
  {
    key: 'spring',
    label: 'Spring',
    emoji: '🌸',
    months: 'Aug – Nov',
    description: 'Cool-season restarts & warm-season seed raising',
    bgColor: '#F1F8E9',
    borderColor: '#81C784',
    textColor: '#2E7D32',
  },
  {
    key: 'summer',
    label: 'Summer',
    emoji: '☀️',
    months: 'Dec – Feb',
    description: 'Warm-season fruiting crops & succession sowing',
    bgColor: '#FFFDE7',
    borderColor: '#FFD54F',
    textColor: '#F57F17',
  },
  {
    key: 'autumn',
    label: 'Autumn',
    emoji: '🍂',
    months: 'Mar – May',
    description: 'The biggest planting season for Canterbury',
    bgColor: '#FFF3E0',
    borderColor: '#FFAB40',
    textColor: '#E65100',
  },
  {
    key: 'winter',
    label: 'Winter',
    emoji: '❄️',
    months: 'Jun – Aug',
    description: 'Hardy overwintering crops & garlic',
    bgColor: '#E3F2FD',
    borderColor: '#64B5F6',
    textColor: '#0D47A1',
  },
];

interface Props {
  season: SeasonInfo;
  cropCount: number;
  onPress: () => void;
  fullWidth?: boolean;
  /** Override the month range string with a hemisphere-specific value */
  monthOverride?: string;
}

export function SeasonCard({ season, cropCount, onPress, fullWidth = false, monthOverride }: Props) {
  const displayMonths = monthOverride ?? season.months;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.wrapper, fullWidth && styles.wrapperFull]}
    >
      <Surface
        style={[
          styles.card,
          fullWidth && styles.cardFull,
          {
            backgroundColor: season.bgColor,
            borderColor: season.borderColor,
          },
        ]}
        elevation={2}
      >
        {fullWidth ? (
          // Horizontal layout for the full-width fruit card
          <View style={styles.rowLayout}>
            <Text style={styles.emojiSmall}>{season.emoji}</Text>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: season.textColor }]}>
                {season.label}
              </Text>
              <Text style={[styles.months, { color: season.textColor }]}>
                {displayMonths}
              </Text>
              <Text style={styles.description}>{season.description}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: season.borderColor }]}>
              <Text style={styles.badgeText}>{cropCount} crops</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.emoji}>{season.emoji}</Text>
            <Text style={[styles.label, { color: season.textColor }]}>
              {season.label}
            </Text>
            <Text style={[styles.months, { color: season.textColor }]}>
              {displayMonths}
            </Text>
            <View style={[styles.badge, { backgroundColor: season.borderColor }]}>
              <Text style={styles.badgeText}>{cropCount} crops</Text>
            </View>
            <Text style={styles.description}>{season.description}</Text>
          </>
        )}
      </Surface>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '48%',
    marginBottom: 12,
  },
  wrapperFull: {
    width: '100%',
    marginBottom: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 18,
    alignItems: 'center',
    minHeight: 180,
    justifyContent: 'center',
  },
  cardFull: {
    minHeight: 0,
    padding: 16,
    alignItems: 'stretch',
  },
  rowLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rowText: {
    flex: 1,
  },
  emojiSmall: {
    fontSize: 36,
  },
  emoji: {
    fontSize: 44,
    marginBottom: 8,
  },
  label: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  months: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    opacity: 0.8,
  },
  badge: {
    marginTop: 10,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  description: {
    marginTop: 10,
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    lineHeight: 16,
  },
});
