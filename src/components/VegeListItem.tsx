import React from 'react';
import { StyleSheet } from 'react-native';
import { List, Chip } from 'react-native-paper';
import { Vegetable } from '../types';

interface Props {
  vege: Vegetable;
  onPress: (vege: Vegetable) => void;
}

const SEASON_COLORS: Record<string, string> = {
  spring: '#C8E6C9',
  summer: '#FFECB3',
  autumn: '#FFE0B2',
  winter: '#BBDEFB',
};

export function VegeListItem({ vege, onPress }: Props) {
  const seasonColor =
    vege.season ? (SEASON_COLORS[vege.season.toLowerCase()] ?? '#F5F5F5') : '#F5F5F5';

  const title =
    vege.variety && vege.variety !== 'Generic'
      ? `${vege.name} · ${vege.variety}`
      : vege.name;

  const description = [
    `${Math.round(vege.gdd_to_maturity)} GDD to harvest`,
    `Water every ${vege.water_interval_days}d`,
    vege.frost_tolerant ? '❄️ Frost tolerant' : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <List.Item
      title={title}
      titleStyle={styles.title}
      description={description}
      descriptionStyle={styles.description}
      onPress={() => onPress(vege)}
      right={() =>
        vege.season ? (
          <Chip
            style={[styles.chip, { backgroundColor: seasonColor }]}
            compact
            textStyle={styles.chipText}
          >
            {vege.season}
          </Chip>
        ) : null
      }
      style={styles.item}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: '#fff',
    paddingVertical: 4,
  },
  title: { fontWeight: '600', color: '#1B5E20' },
  description: { color: '#666', fontSize: 12, marginTop: 2 },
  chip: { alignSelf: 'center', marginRight: 4 },
  chipText: { fontSize: 11 },
});
