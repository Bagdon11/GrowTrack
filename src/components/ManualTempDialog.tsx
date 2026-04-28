/**
 * ManualTempDialog — lets users log morning / midday / evening temperatures
 * for a given date so GDD can be calculated without internet access.
 *
 * The dialog shows three rows (one per slot) with a number pad-friendly input
 * and a +/- stepper for easy adjustment.  A live GDD preview is shown at the
 * bottom based on the entered values.
 *
 * On "Apply", the readings are saved to the DB and the store's applyManualGDD
 * action accumulates GDD for all active cards using those temperatures.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  Divider,
  IconButton,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import * as DB from '../db/database';
import type { TempSlot } from '../db/database';
import { dailyGDD } from '../services/gdd';
import { useGardenStore } from '../stores/gardenStore';

interface SlotState {
  value: string;  // raw text field content
  locked: boolean; // true once a valid number is entered and saved
}

const SLOTS: { key: TempSlot; label: string; icon: string; hint: string }[] = [
  { key: 'morning', label: 'Morning',  icon: 'weather-sunset-up',  hint: 'e.g. 8°C at 7am' },
  { key: 'midday',  label: 'Midday',   icon: 'weather-sunny',      hint: 'e.g. 18°C at 1pm' },
  { key: 'evening', label: 'Evening',  icon: 'weather-sunset-down', hint: 'e.g. 12°C at 6pm' },
];

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ManualTempDialog({ visible, onDismiss }: Props) {
  const applyManualGDD = useGardenStore((s) => s.applyManualGDD);
  const cards = useGardenStore((s) => s.cards);

  const [date] = useState(todayLocal);
  const [slots, setSlots] = useState<Record<TempSlot, SlotState>>({
    morning: { value: '', locked: false },
    midday:  { value: '', locked: false },
    evening: { value: '', locked: false },
  });
  const [applying, setApplying] = useState(false);

  // Load any already-saved readings for today on open
  useEffect(() => {
    if (!visible) return;
    const saved = DB.getManualReadingsForDate(date);
    if (saved.length === 0) return;
    setSlots((prev) => {
      const next = { ...prev };
      for (const r of saved) {
        next[r.slot] = { value: String(r.temp_c), locked: true };
      }
      return next;
    });
  }, [visible, date]);

  function setSlotValue(slot: TempSlot, value: string) {
    // Allow negative numbers and decimals
    if (value !== '' && value !== '-' && isNaN(parseFloat(value))) return;
    setSlots((prev) => ({ ...prev, [slot]: { value, locked: false } }));
  }

  function step(slot: TempSlot, delta: number) {
    const current = parseFloat(slots[slot].value) || 0;
    const next = Math.round((current + delta) * 10) / 10;
    setSlots((prev) => ({ ...prev, [slot]: { value: String(next), locked: false } }));
  }

  // Derive tmax/tmin from entered values
  const temps = SLOTS.map(({ key }) => parseFloat(slots[key].value)).filter((v) => !isNaN(v));
  const tmax = temps.length > 0 ? Math.max(...temps) : null;
  const tmin = temps.length > 0 ? Math.min(...temps) : null;

  // Representative base temp for preview — use the most common one across active cards
  const previewBaseTemp =
    cards.length > 0
      ? cards.reduce((a, c) => a + c.vege.base_temp, 0) / cards.length
      : 10;

  const previewGDD =
    tmax !== null && tmin !== null
      ? dailyGDD(tmax, tmin, previewBaseTemp)
      : null;

  const canApply = temps.length >= 2; // Need at least 2 readings for a valid tmax/tmin

  function handleDismiss() {
    setSlots({ morning: { value: '', locked: false }, midday: { value: '', locked: false }, evening: { value: '', locked: false } });
    onDismiss();
  }

  async function handleApply() {
    if (!canApply || tmax === null || tmin === null) return;
    setApplying(true);

    // Persist each entered reading
    for (const { key } of SLOTS) {
      const v = parseFloat(slots[key].value);
      if (!isNaN(v)) {
        DB.upsertManualReading(date, key, v);
      }
    }

    await applyManualGDD(date, tmax, tmin);
    setApplying(false);
    handleDismiss();
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>🌡️ Manual Temperature Entry</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.subtitle}>
            No internet? Enter today's temperatures to calculate GDD manually.
            Use at least 2 readings — the highest becomes Tmax, lowest becomes Tmin.
          </Text>

          <Text style={styles.dateLabel}>📅 {date}</Text>

          {SLOTS.map(({ key, label, hint }) => (
            <View key={key} style={styles.row}>
              <View style={styles.rowLabel}>
                <Text style={styles.slotLabel}>{label}</Text>
                <Text style={styles.slotHint}>{hint}</Text>
              </View>
              <View style={styles.stepper}>
                <IconButton
                  icon="minus"
                  size={18}
                  style={styles.stepBtn}
                  onPress={() => step(key, -0.5)}
                />
                <TextInput
                  value={slots[key].value}
                  onChangeText={(v) => setSlotValue(key, v)}
                  keyboardType="numeric"
                  style={styles.tempInput}
                  contentStyle={styles.tempInputContent}
                  mode="outlined"
                  dense
                  right={<TextInput.Affix text="°C" />}
                  placeholder="—"
                />
                <IconButton
                  icon="plus"
                  size={18}
                  style={styles.stepBtn}
                  onPress={() => step(key, 0.5)}
                />
              </View>
            </View>
          ))}

          <Divider style={styles.divider} />

          {/* Live GDD preview */}
          {previewGDD !== null ? (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>GDD preview (avg base {previewBaseTemp.toFixed(1)}°C)</Text>
              <Text style={styles.previewValue}>
                {previewGDD > 0 ? `+${previewGDD.toFixed(1)}` : '0'} GDD today
              </Text>
              <Text style={styles.previewMeta}>
                Tmax {tmax!.toFixed(1)}°C · Tmin {tmin!.toFixed(1)}°C
              </Text>
              {previewGDD === 0 && (
                <Text style={styles.previewCold}>
                  ❄️ Average temp didn't exceed base — no growth today
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.previewHint}>Enter at least 2 readings to see a GDD preview</Text>
          )}
        </Dialog.Content>

        <Dialog.Actions style={styles.actions}>
          <Button onPress={handleDismiss} textColor="#888">Cancel</Button>
          <Button
            mode="contained"
            onPress={handleApply}
            loading={applying}
            disabled={!canApply || applying}
            buttonColor="#2E7D32"
          >
            Apply to Garden
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 16, marginHorizontal: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rowLabel: { flex: 1 },
  slotLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  slotHint: { fontSize: 11, color: '#999', marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { margin: 0, width: 32, height: 32 },
  tempInput: { width: 90, backgroundColor: '#fff' },
  tempInputContent: { textAlign: 'center', fontSize: 15, fontWeight: '700' },
  divider: { marginVertical: 14 },
  preview: {
    backgroundColor: '#F1F8E9',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  previewLabel: { fontSize: 11, color: '#666', marginBottom: 4 },
  previewValue: { fontSize: 24, fontWeight: '800', color: '#2E7D32' },
  previewMeta: { fontSize: 11, color: '#888', marginTop: 4 },
  previewCold: { fontSize: 11, color: '#1565C0', marginTop: 6, textAlign: 'center' },
  previewHint: { fontSize: 12, color: '#aaa', textAlign: 'center' },
  actions: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
});
