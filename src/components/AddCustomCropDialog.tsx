import React, { useState } from 'react';
import { Alert, ScrollView, Switch, StyleSheet, View } from 'react-native';
import {
  Text,
  Button,
  TextInput,
  Dialog,
  Portal,
  Chip,
  HelperText,
} from 'react-native-paper';
import { Colors, SeasonColors } from '../constants/theme';
import { submitCommunityPlant } from '../services/communitySync';
import type { Vegetable } from '../types';

type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter' | 'fruit';

const SEASON_KEYS: SeasonKey[] = ['spring', 'summer', 'autumn', 'winter', 'fruit'];

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSave: (v: Omit<Vegetable, 'id'>) => void;
}

/** Validate all fields and return an array of error strings (empty = valid). */
function validate(fields: {
  name: string;
  gdd: string;
  baseTemp: string;
  germDays: string;
  waterDays: string;
  fertDays: string;
  desc: string;
  seasons: SeasonKey[];
}): string[] {
  const errs: string[] = [];
  if (!fields.name.trim()) errs.push('Plant name is required');

  const parsedGdd = parseFloat(fields.gdd);
  if (!fields.gdd.trim() || isNaN(parsedGdd) || parsedGdd <= 0)
    errs.push('GDD to maturity must be a positive number');

  const parsedBaseTemp = parseFloat(fields.baseTemp);
  if (isNaN(parsedBaseTemp) || parsedBaseTemp < -10 || parsedBaseTemp > 30)
    errs.push('Base temperature must be between −10 and 30°C');

  const parsedGermDays = parseInt(fields.germDays, 10);
  if (isNaN(parsedGermDays) || parsedGermDays <= 0)
    errs.push('Days to germination must be a positive integer');

  const parsedWaterDays = parseInt(fields.waterDays, 10);
  if (isNaN(parsedWaterDays) || parsedWaterDays <= 0)
    errs.push('Water interval must be a positive integer');

  const parsedFertDays = parseInt(fields.fertDays, 10);
  if (isNaN(parsedFertDays) || parsedFertDays <= 0)
    errs.push('Fertilise interval must be a positive integer');

  if (!fields.desc.trim()) errs.push('Description is required');
  if (fields.seasons.length === 0) errs.push('Select at least one season');

  return errs;
}

export function AddCustomCropDialog({ visible, onDismiss, onSave }: Props) {
  const [name, setName] = useState('');
  const [variety, setVariety] = useState('');
  const [baseTemp, setBaseTemp] = useState('10');
  const [gdd, setGdd] = useState('');
  const [germDays, setGermDays] = useState('7');
  const [waterDays, setWaterDays] = useState('3');
  const [fertDays, setFertDays] = useState('14');
  const [spacing, setSpacing] = useState('');
  const [desc, setDesc] = useState('');
  const [seasons, setSeasons] = useState<SeasonKey[]>([]);
  const [frostTolerant, setFrostTolerant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  /** The saved veg object, set after a successful save so we can offer submission. */
  const [savedVege, setSavedVege] = useState<Omit<Vegetable, 'id'> | null>(null);

  function reset() {
    setName(''); setVariety(''); setBaseTemp('10'); setGdd('');
    setGermDays('7'); setWaterDays('3'); setFertDays('14');
    setSpacing(''); setDesc(''); setSeasons([]); setFrostTolerant(false);
    setErrors([]); setSavedVege(null);
  }

  function handleDismiss() {
    reset();
    onDismiss();
  }

  function toggleSeason(key: SeasonKey) {
    setSeasons((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );
  }

  async function handleSave() {
    const errs = validate({ name, gdd, baseTemp, germDays, waterDays, fertDays, desc, seasons });
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);

    setSaving(true);
    try {
      const vege: Omit<Vegetable, 'id'> = {
        name: name.trim(),
        variety: variety.trim() || null,
        base_temp: parseFloat(baseTemp),
        gdd_to_maturity: parseFloat(gdd),
        days_to_germination: parseInt(germDays, 10),
        water_interval_days: parseInt(waterDays, 10),
        fertilise_interval_days: parseInt(fertDays, 10),
        spacing_cm: spacing.trim() ? parseInt(spacing, 10) : null,
        description: desc.trim(),
        season: seasons.join(','),
        frost_tolerant: frostTolerant ? 1 : 0,
        source: 'local',
        remote_id: null,
      };
      onSave(vege);
      setSavedVege(vege);
      // Show community submission prompt
      Alert.alert(
        '✅ Crop saved!',
        'Would you like to submit this crop to the GrowTrack community? It will be reviewed before being shared with other users.',
        [
          { text: 'Not now', style: 'cancel', onPress: handleDismiss },
          { text: 'Submit to community', onPress: handleSubmitToCommunity },
        ],
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitToCommunity() {
    if (!savedVege) return;
    setSubmitting(true);
    try {
      const result = await submitCommunityPlant({
        name: savedVege.name,
        variety: savedVege.variety,
        base_temp: savedVege.base_temp,
        gdd_to_maturity: savedVege.gdd_to_maturity,
        days_to_germination: savedVege.days_to_germination,
        water_interval_days: savedVege.water_interval_days,
        fertilise_interval_days: savedVege.fertilise_interval_days,
        spacing_cm: savedVege.spacing_cm,
        description: savedVege.description ?? '',
        season: savedVege.season ?? '',
        frost_tolerant: savedVege.frost_tolerant,
      });

      if (result.ok) {
        Alert.alert('🌍 Submitted!', 'Thanks! Your crop will be reviewed and added to the global database if approved.');
      } else if (result.error?.includes('not configured')) {
        Alert.alert('Coming soon', 'Community submission will be available once the server is set up.');
      } else {
        Alert.alert('Submission failed', result.error ?? 'Unknown error. Try again later.');
      }
    } finally {
      setSubmitting(false);
      handleDismiss();
    }
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.dialogTitle}>🌿 New custom crop</Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView contentContainerStyle={styles.scroll}>
            {errors.length > 0 && (
              <View style={styles.errorBox}>
                {errors.map((e) => (
                  <HelperText key={e} type="error" visible>• {e}</HelperText>
                ))}
              </View>
            )}
            <TextInput label="Plant name *" value={name} onChangeText={setName}
              mode="outlined" style={styles.input} placeholder="e.g. Tomato" />
            <TextInput label="Variety / Cultivar" value={variety} onChangeText={setVariety}
              mode="outlined" style={styles.input} placeholder="e.g. Tigerella, Beefsteak" />
            <TextInput label="GDD to maturity *" value={gdd} onChangeText={setGdd}
              mode="outlined" style={styles.input} keyboardType="numeric" placeholder="e.g. 1200" />
            <TextInput label="Base temperature (°C) *" value={baseTemp} onChangeText={setBaseTemp}
              mode="outlined" style={styles.input} keyboardType="numeric" placeholder="10" />
            <TextInput label="Days to germination *" value={germDays} onChangeText={setGermDays}
              mode="outlined" style={styles.input} keyboardType="numeric" placeholder="7" />
            <TextInput label="Water every X days *" value={waterDays} onChangeText={setWaterDays}
              mode="outlined" style={styles.input} keyboardType="numeric" placeholder="3" />
            <TextInput label="Fertilise every X days *" value={fertDays} onChangeText={setFertDays}
              mode="outlined" style={styles.input} keyboardType="numeric" placeholder="14" />
            <TextInput label="Spacing (cm)" value={spacing} onChangeText={setSpacing}
              mode="outlined" style={styles.input} keyboardType="numeric" placeholder="optional" />
            <TextInput label="Description *" value={desc} onChangeText={setDesc}
              mode="outlined" style={styles.input} multiline numberOfLines={3}
              placeholder="Growing tips, sowing time, harvest notes..." />

            <Text style={styles.label}>Seasons *</Text>
            <View style={styles.chipRow}>
              {SEASON_KEYS.map((key) => (
                <Chip
                  key={key}
                  compact
                  selected={seasons.includes(key)}
                  onPress={() => toggleSeason(key)}
                  style={[
                    styles.chip,
                    seasons.includes(key) && { backgroundColor: SeasonColors[key] ?? Colors.background },
                  ]}
                >
                  {key}
                </Chip>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Frost tolerant</Text>
              <Switch
                value={frostTolerant}
                onValueChange={setFrostTolerant}
                trackColor={{ true: Colors.primary }}
              />
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={handleDismiss}>Cancel</Button>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving || submitting}
            disabled={saving || submitting}
            buttonColor={Colors.primary}
          >
            Save crop
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
  input: { marginBottom: 12, backgroundColor: '#fff' },
  label: { fontSize: 13, color: '#555', marginBottom: 6, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  chip: { backgroundColor: '#E8F5E9' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  switchLabel: { fontSize: 15, color: '#333' },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
});
