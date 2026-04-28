import React, { useState, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, Searchbar, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useGardenStore } from '../stores/gardenStore';
import { VegeListItem } from '../components/VegeListItem';
import { SeasonCard, SEASONS } from '../components/SeasonCard';
import { AddCustomCropDialog } from '../components/AddCustomCropDialog';
import { PlantCropDialog } from '../components/PlantCropDialog';
import { getSeasonLabels, getLocationProfile } from '../services/latitudeUtils';
import { Colors } from '../constants/theme';
import type { RootTabParamList, Vegetable } from '../types';

type Props = BottomTabScreenProps<RootTabParamList, 'Add'>;

type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter' | 'fruit';

export function AddPlantScreen({ navigation }: Props) {
  const vegetables = useGardenStore((s) => s.vegetables);
  const addPlantCard = useGardenStore((s) => s.addPlantCard);
  const addVegetable = useGardenStore((s) => s.addVegetable);
  const latitude = useGardenStore((s) => s.latitude);

  const seasonLabels = useMemo(() => getSeasonLabels(latitude ?? -43.5), [latitude]);
  const locationProfile = useMemo(
    () => (latitude != null ? getLocationProfile(latitude) : null),
    [latitude],
  );

  const [selectedSeason, setSelectedSeason] = useState<SeasonKey | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Vegetable | null>(null);
  const [customCropVisible, setCustomCropVisible] = useState(false);

  const seasonCounts = useMemo(
    () =>
      Object.fromEntries(
        SEASONS.map((s) => [
          s.key,
          vegetables.filter((v) => v.season?.includes(s.key)).length,
        ]),
      ),
    [vegetables],
  );

  const filteredVeges = useMemo(() => {
    const bySeason = selectedSeason
      ? vegetables.filter((v) => v.season?.includes(selectedSeason))
      : vegetables;
    if (search.trim() === '') return bySeason;
    const q = search.toLowerCase();
    return bySeason.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.variety ?? '').toLowerCase().includes(q),
    );
  }, [vegetables, selectedSeason, search]);

  function handleBack() {
    setSelectedSeason(null);
    setSearch('');
  }

  async function handlePlant(plantedDate: string, location: string, notes: string) {
    if (!selected) return;
    await addPlantCard(selected.id, plantedDate, location, notes);
    setSelected(null);
    navigation.navigate('Garden');
  }

  // ── Season selection grid ────────────────────────────────────────
  if (!selectedSeason) {
    const fruitSeason = SEASONS.find((s) => s.key === 'fruit')!;
    const calendarSeasons = SEASONS.filter((s) => s.key !== 'fruit');
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.gridHeading}>What are you planting?</Text>
        {locationProfile ? (
          <Text style={styles.gridSubheading}>
            {locationProfile.band} · {locationProfile.hemisphere} hemisphere
          </Text>
        ) : (
          <Text style={styles.gridSubheading}>
            Set your location on the Globe tab for local seasons
          </Text>
        )}
        <SeasonCard
          season={fruitSeason}
          cropCount={seasonCounts[fruitSeason.key] ?? 0}
          onPress={() => setSelectedSeason('fruit')}
          fullWidth
        />
        <View style={styles.seasonGrid}>
          {calendarSeasons.map((s) => (
            <SeasonCard
              key={s.key}
              season={s}
              cropCount={seasonCounts[s.key] ?? 0}
              onPress={() => setSelectedSeason(s.key as SeasonKey)}
              monthOverride={seasonLabels[s.key as keyof typeof seasonLabels]}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  // ── Filtered veg list for the selected season ────────────────────
  const currentSeason = SEASONS.find((s) => s.key === selectedSeason)!;

  return (
    <View style={styles.container}>
      <View style={[styles.seasonHeader, { borderBottomColor: currentSeason.borderColor }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={currentSeason.textColor} />
        </TouchableOpacity>
        <Text style={[styles.seasonTitle, { color: currentSeason.textColor }]}>
          {currentSeason.emoji}  {currentSeason.label}
        </Text>
        <Text style={styles.seasonMonths}>{currentSeason.months}</Text>
      </View>

      <Searchbar
        placeholder="Search crops..."
        value={search}
        onChangeText={setSearch}
        style={styles.search}
        inputStyle={styles.searchInput}
      />

      <FlatList
        data={filteredVeges}
        keyExtractor={(v) => String(v.id)}
        renderItem={({ item }) => <VegeListItem vege={item} onPress={setSelected} />}
        ItemSeparatorComponent={() => <Divider />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No crops found for this season</Text>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={styles.addCropBtn}
            onPress={() => setCustomCropVisible(true)}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.addCropBtnText}>Add a custom crop</Text>
          </TouchableOpacity>
        }
      />

      <AddCustomCropDialog
        visible={customCropVisible}
        onDismiss={() => setCustomCropVisible(false)}
        onSave={(v) => { addVegetable(v); }}
      />

      <PlantCropDialog
        vegetable={selected}
        onDismiss={() => setSelected(null)}
        onPlant={handlePlant}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Season grid
  gridContent: { padding: 16, paddingBottom: 40 },
  gridHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primaryDark,
    marginBottom: 4,
  },
  gridSubheading: {
    fontSize: 13,
    color: Colors.muted,
    marginBottom: 20,
  },
  seasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  // Season header bar
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 3,
    gap: 8,
  },
  backBtn: { padding: 4 },
  seasonTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  seasonMonths: { fontSize: 12, color: '#888', fontWeight: '600' },

  // Veg list
  search: { margin: 12, backgroundColor: Colors.surface, borderRadius: 12 },
  searchInput: { fontSize: 15 },
  list: { paddingBottom: 32, backgroundColor: Colors.surface },
  empty: { textAlign: 'center', marginTop: 48, color: '#aaa', fontSize: 15 },

  // Add custom crop button
  addCropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 4,
  },
  addCropBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },
});

