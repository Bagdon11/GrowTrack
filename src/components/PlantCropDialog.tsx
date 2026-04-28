import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, Button, TextInput, Dialog, Portal, Chip, Divider } from 'react-native-paper';
import { Colors, SeasonColors } from '../constants/theme';
import type { Vegetable } from '../types';

interface Props {
  vegetable: Vegetable | null;
  onDismiss: () => void;
  onPlant: (plantedDate: string, location: string, notes: string) => Promise<void>;
}

export function PlantCropDialog({ vegetable, onDismiss, onPlant }: Props) {
  const [plantedDate, setPlantedDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [planting, setPlanting] = useState(false);

  function handleDismiss() {
    setPlantedDate(new Date().toISOString().split('T')[0]);
    setLocation('');
    setNotes('');
    onDismiss();
  }

  async function handlePlant() {
    setPlanting(true);
    try {
      await onPlant(plantedDate, location, notes);
      handleDismiss();
    } finally {
      setPlanting(false);
    }
  }

  return (
    <Portal>
      <Dialog visible={!!vegetable} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.dialogTitle}>
          🌱 Plant {vegetable?.name}
        </Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView contentContainerStyle={styles.scroll}>
            {vegetable && (
              <>
                <View style={styles.chipRow}>
                  <Chip icon="thermometer" compact style={styles.chip}>
                    {vegetable.base_temp}°C base
                  </Chip>
                  <Chip icon="sprout" compact style={styles.chip}>
                    {Math.round(vegetable.gdd_to_maturity)} GDD
                  </Chip>
                  <Chip icon="water" compact style={styles.chip}>
                    Water/{vegetable.water_interval_days}d
                  </Chip>
                  {vegetable.season?.split(',').map((s) => (
                    <Chip
                      key={s}
                      compact
                      style={[
                        styles.chip,
                        { backgroundColor: SeasonColors[s.trim()] ?? '#F5F5F5' },
                      ]}
                    >
                      {s.trim()}
                    </Chip>
                  ))}
                </View>

                {vegetable.description ? (
                  <Text style={styles.description}>{vegetable.description}</Text>
                ) : null}

                <Divider style={styles.divider} />

                <TextInput
                  label="Planted date"
                  value={plantedDate}
                  onChangeText={setPlantedDate}
                  mode="outlined"
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="YYYY-MM-DD"
                />
                <TextInput
                  label="Location in garden (optional)"
                  value={location}
                  onChangeText={setLocation}
                  mode="outlined"
                  style={styles.input}
                  placeholder="e.g. Raised bed 2, North corner"
                />
                <TextInput
                  label="Notes (optional)"
                  value={notes}
                  onChangeText={setNotes}
                  mode="outlined"
                  style={styles.input}
                  multiline
                  numberOfLines={3}
                />
              </>
            )}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={handleDismiss}>Cancel</Button>
          <Button
            mode="contained"
            onPress={handlePlant}
            loading={planting}
            disabled={planting}
            buttonColor={Colors.primary}
          >
            Plant it!
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { backgroundColor: '#fff', borderRadius: 16 },
  dialogTitle: { color: Colors.primary, fontWeight: '700' },
  scrollArea: { paddingHorizontal: 0 },
  scroll: { paddingHorizontal: 24, paddingVertical: 8 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  chip: { backgroundColor: '#E8F5E9' },
  description: { fontSize: 13, color: '#555', lineHeight: 20, marginBottom: 4 },
  divider: { marginVertical: 12 },
  input: { marginBottom: 12, backgroundColor: '#fff' },
});
