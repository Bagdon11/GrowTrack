import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, Chip } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PlantCardWithVege, RootStackParamList } from '../types';
import { GDDProgressBar } from './GDDProgressBar';
import { getProgressPercent } from '../services/gdd';
import { useGardenStore } from '../stores/gardenStore';

interface Props {
  card: PlantCardWithVege;
}

function daysSince(dateStr: string): number {
  const planted = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - planted.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntilNext(lastDateStr: string | null, intervalDays: number): number {
  if (!lastDateStr) return 0; // Never done — show as due immediately
  const last = new Date(lastDateStr);
  const next = new Date(last.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function PlantCard({ card }: Props) {
  const recordWatered = useGardenStore((s) => s.recordWatered);
  const recordFertilised = useGardenStore((s) => s.recordFertilised);
  const harvestCard = useGardenStore((s) => s.harvestCard);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { vege } = card;

  const daysPlanted = daysSince(card.planted_date);
  const progress = getProgressPercent(card.accumulated_gdd, vege.gdd_to_maturity);
  const isReady = progress >= 90;

  const waterDue = daysUntilNext(card.watered_at, vege.water_interval_days);
  const fertiliseDue = daysUntilNext(card.fertilised_at, vege.fertilise_interval_days);

  const displayName =
    vege.variety && vege.variety !== 'Generic'
      ? `${vege.name} · ${vege.variety}`
      : vege.name;

  return (
    <Card
      style={[styles.card, isReady && styles.cardReady]}
      elevation={2}
      onPress={() => navigation.navigate('PlantDetail', { cardId: card.id })}
    >
      <Card.Content>
        {/* Header row */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text variant="titleMedium" style={[styles.vegeName, isReady && styles.vegeNameReady]}>
              {displayName}
            </Text>
            {card.location ? (
              <Text variant="bodySmall" style={styles.location}>
                📍 {card.location}
              </Text>
            ) : null}
          </View>
          <Chip
            compact
            icon={isReady ? 'check-circle' : 'sprout'}
            style={[styles.daysChip, isReady && styles.readyChip]}
            textStyle={isReady ? styles.readyChipText : undefined}
          >
            {isReady ? 'Harvest!' : `Day ${daysPlanted}`}
          </Chip>
        </View>

        {/* GDD progress bar */}
        <GDDProgressBar accumulated={card.accumulated_gdd} total={vege.gdd_to_maturity} />

        {/* Watering + fertilising reminders */}
        <View style={styles.reminders}>
          <Chip
            compact
            icon="water"
            style={[styles.reminderChip, waterDue === 0 && styles.dueChip]}
            textStyle={waterDue === 0 ? styles.dueText : undefined}
          >
            {waterDue === 0 ? '💧 Water now' : `Water in ${waterDue}d`}
          </Chip>
          <Chip
            compact
            icon="leaf"
            style={[styles.reminderChip, fertiliseDue === 0 && styles.dueChip]}
            textStyle={fertiliseDue === 0 ? styles.dueText : undefined}
          >
            {fertiliseDue === 0 ? '🌿 Fertilise now' : `Fertilise in ${fertiliseDue}d`}
          </Chip>
        </View>

        {/* Planted date */}
        <Text variant="bodySmall" style={styles.plantedDate}>
          Planted {card.planted_date}
        </Text>
      </Card.Content>

      <Card.Actions style={styles.actions}>
        <Button
          mode="text"
          icon="water"
          compact
          onPress={() => recordWatered(card.id)}
          textColor="#1976D2"
        >
          Watered
        </Button>
        <Button
          mode="text"
          icon="leaf"
          compact
          onPress={() => recordFertilised(card.id)}
          textColor="#388E3C"
        >
          Fertilised
        </Button>
        {isReady && (
          <Button
            mode="contained"
            icon="basket"
            compact
            onPress={() => harvestCard(card.id)}
            buttonColor="#E53935"
          >
            Harvest
          </Button>
        )}
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  cardReady: {
    borderWidth: 2,
    borderColor: '#E53935',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  headerLeft: { flex: 1, marginRight: 8 },
  vegeName: {
    fontWeight: '700',
    color: '#1B5E20',
    flexShrink: 1,
  },
  vegeNameReady: { color: '#B71C1C' },
  location: { color: '#666', marginTop: 2 },
  daysChip: { backgroundColor: '#E8F5E9' },
  readyChip: { backgroundColor: '#FFEBEE' },
  readyChipText: { color: '#B71C1C', fontWeight: '700' },
  reminders: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  reminderChip: { backgroundColor: '#F5F5F5' },
  dueChip: { backgroundColor: '#FFF9C4' },
  dueText: { fontWeight: '700', color: '#5D4037' },
  plantedDate: { color: '#999', marginTop: 6, fontSize: 11 },
  actions: { paddingTop: 0 },
});
