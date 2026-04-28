import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Button, TextInput, Card, Chip } from 'react-native-paper';
import * as Location from 'expo-location';
import * as DB from '../db/database';
import type { HarvestLog } from '../types';
import { useGardenStore } from '../stores/gardenStore';
import { getLocationProfile, getCurrentSeason, getSeasonLabels } from '../services/latitudeUtils';
import { sendPlantingWindowNotification } from '../services/notifications';
import { SEED_VEGETABLES } from '../db/seed';

export function SettingsScreen() {
  const saveLocation = useGardenStore((s) => s.saveLocation);
  const storedLat = useGardenStore((s) => s.latitude);
  const storedLon = useGardenStore((s) => s.longitude);

  const [latitude, setLatitude] = useState(storedLat?.toFixed(4) ?? '');
  const [longitude, setLongitude] = useState(storedLon?.toFixed(4) ?? '');

  // Sync text fields when location is updated externally (e.g. from Globe tab)
  useEffect(() => {
    if (storedLat != null) setLatitude(storedLat.toFixed(4));
    if (storedLon != null) setLongitude(storedLon.toFixed(4));
  }, [storedLat, storedLon]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [harvestCount, setHarvestCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [totalGDD, setTotalGDD] = useState(0);
  const [harvestLog, setHarvestLog] = useState<HarvestLog[]>([]);
  const [plantableCrops, setPlantableCrops] = useState<string[]>([]);
  const [plantableSeasonLabel, setPlantableSeasonLabel] = useState('');

  const profile = storedLat != null ? getLocationProfile(storedLat) : null;

  useEffect(() => {
    setHarvestCount(DB.getHarvestCount());
    setActiveCount(DB.getActiveCardCount());
    setTotalGDD(DB.getTotalGDDAccumulated());
    setHarvestLog(DB.getAllHarvestLogs().slice(0, 5));
  }, []);

  useEffect(() => {
    if (storedLat == null) { setPlantableCrops([]); setPlantableSeasonLabel(''); return; }
    const currentSeason = getCurrentSeason(storedLat);
    const labels = getSeasonLabels(storedLat);
    setPlantableSeasonLabel(labels[currentSeason] ?? currentSeason);
    const alreadyPlanted = DB.getAllPlantedVegeNames();
    setPlantableCrops(
      SEED_VEGETABLES
        .filter((v) => v.season?.split(',').map((s) => s.trim()).includes(currentSeason) && !alreadyPlanted.includes(v.name))
        .map((v) => v.name),
    );
  }, [storedLat]);

  async function detectLocation() {
    setDetecting(true);
    setStatusMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is needed to auto-detect your position for weather data.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const detectedLat = loc.coords.latitude;
      const detectedLon = loc.coords.longitude;
      setLatitude(detectedLat.toFixed(4));
      setLongitude(detectedLon.toFixed(4));
      if (detectedLat > 0) {
        setStatusMsg('⚠️ GPS returned a Northern Hemisphere location — if you are in NZ/Australia, the emulator GPS is fake. Enter your real coordinates manually below.');
      } else {
        setStatusMsg('✅ Location detected — tap Save to apply');
      }
    } catch {
      Alert.alert('Error', 'Could not detect location. Check permissions or enter coordinates manually.');
    } finally {
      setDetecting(false);
    }
  }

  function saveLocationHandler() {
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      Alert.alert('Invalid coordinates', 'Please enter valid latitude (−90 to 90) and longitude (−180 to 180).');
      return;
    }
    saveLocation(lat, lon);
    const p = getLocationProfile(lat);
    setStatusMsg(`✅ Saved! ${p.band} — ${p.hemisphere} hemisphere. Pull down on Garden to refresh GDD.`);
  }

  async function sendPlantingReminder() {
    await sendPlantingWindowNotification(plantableCrops, plantableSeasonLabel);
    Alert.alert('Reminder sent!', 'Check your notification tray.');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Garden Stats */}
      <Card style={styles.card}>
        <Card.Title title="Garden Stats" titleStyle={styles.cardTitle} />
        <Card.Content>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{activeCount}</Text>
              <Text style={styles.statLabel}>Growing now</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{harvestCount}</Text>
              <Text style={styles.statLabel}>Harvested</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalGDD.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Total GDD</Text>
            </View>
          </View>

          {harvestLog.length > 0 && (
            <View style={styles.harvestLog}>
              <Text style={styles.harvestTitle}>Recent harvests</Text>
              {harvestLog.map((h) => (
                <View key={h.id} style={styles.harvestRow}>
                  <Text style={styles.harvestName}>🌾 {h.vege_name}</Text>
                  <Text style={styles.harvestDate}>
                    {new Date(h.harvested_at).toLocaleDateString('en-NZ', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Planting window */}
      <Card style={styles.card}>
        <Card.Title title="Planting Window" titleStyle={styles.cardTitle} />
        <Card.Content>
          {storedLat == null ? (
            <Text variant="bodySmall" style={styles.hint}>
              Set your location above to see what you can plant now.
            </Text>
          ) : plantableCrops.length === 0 ? (
            <Text variant="bodySmall" style={styles.hint}>
              You're already growing everything suitable for {plantableSeasonLabel} 🎉
            </Text>
          ) : (
            <>
              <Text variant="bodySmall" style={[styles.hint, { marginBottom: 10 }]}>
                Ready to plant this {plantableSeasonLabel}:
              </Text>
              <View style={styles.cropChips}>
                {plantableCrops.map((name) => (
                  <Chip key={name} compact style={styles.cropChip} textStyle={styles.cropChipText}>
                    {name}
                  </Chip>
                ))}
              </View>
              <Button
                mode="outlined"
                icon="bell-ring-outline"
                onPress={sendPlantingReminder}
                style={{ marginTop: 12 }}
                textColor="#2E7D32"
              >
                Send as notification
              </Button>
            </>
          )}
        </Card.Content>
      </Card>

      {/* Location card */}
      <Card style={styles.card}>
        <Card.Title
          title="Weather Location"
          subtitle="Used to fetch daily temperatures for GDD"
          titleStyle={styles.cardTitle}
        />
        <Card.Content>
          <Text variant="bodySmall" style={styles.hint}>
            Your coordinates are stored only on this device and sent to Open-Meteo to retrieve local temperature data. No account or API key needed.
          </Text>

          <Text variant="bodySmall" style={styles.hintSmall}>
            Southern Hemisphere (e.g. New Zealand) latitudes are <Text style={styles.bold}>negative</Text> — e.g. Christchurch is <Text style={styles.bold}>-43.53</Text>, 172.64
          </Text>

          <View style={styles.coordRow}>
            <TextInput
              label="Latitude"
              value={latitude}
              onChangeText={setLatitude}
              mode="outlined"
              style={styles.coordInput}
              keyboardType="default"
              placeholder="-43.5300"
            />
            <TextInput
              label="Longitude"
              value={longitude}
              onChangeText={setLongitude}
              mode="outlined"
              style={styles.coordInput}
              keyboardType="default"
              placeholder="172.6400"
            />
          </View>

          {(() => {
            const previewLat = parseFloat(latitude);
            if (!isNaN(previewLat) && latitude.trim() !== '') {
              const hemi = previewLat < 0 ? '🌏 Southern Hemisphere' : '🌍 Northern Hemisphere';
              const color = previewLat < 0 ? '#2E7D32' : '#E65100';
              return <Text style={[styles.hintSmall, { color, fontWeight: '600', marginBottom: 4 }]}>{hemi}</Text>;
            }
            return null;
          })()}

          {statusMsg ? <Text style={styles.status}>{statusMsg}</Text> : null}

          <View style={styles.btnRow}>
            <Button
              icon="crosshairs-gps"
              mode="outlined"
              onPress={detectLocation}
              loading={detecting}
              disabled={detecting}
              style={styles.btn}
            >
              Detect GPS
            </Button>
            <Button
              icon="content-save"
              mode="contained"
              onPress={saveLocationHandler}
              style={styles.btn}
              buttonColor="#2E7D32"
            >
              Save
            </Button>
          </View>
        </Card.Content>
      </Card>

      {/* Location profile card */}
      {profile && (
        <Card style={styles.card}>
          <Card.Title title="Your Growing Zone" titleStyle={styles.cardTitle} />
          <Card.Content>
            <Text variant="bodyMedium" style={styles.bandLabel}>{profile.band}</Text>
            <Text variant="bodySmall" style={styles.hint}>
              {profile.hemisphere} hemisphere · Lat {storedLat?.toFixed(2)}°
            </Text>
            <View style={styles.seasonTable}>
              {(['spring', 'summer', 'autumn', 'winter'] as const).map((s) => (
                <View key={s} style={styles.seasonRow}>
                  <Text style={styles.seasonName}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                  <Text style={styles.seasonMonths}>{profile.seasonLabels[s]}</Text>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* GDD info */}
      <Card style={styles.card}>
        <Card.Title title="How GDD Works" titleStyle={styles.cardTitle} />
        <Card.Content>
          <Text variant="bodySmall" style={styles.hint}>
            Growing Degree Days (GDD) measure accumulated heat above a crop's base temperature — giving a more accurate picture of plant development than calendar days alone.
          </Text>
          <Text variant="bodySmall" style={[styles.hint, styles.formula]}>
            GDD per day = ((Tmax + Tmin) ÷ 2) − Base Temperature
          </Text>
          <Text variant="bodySmall" style={styles.hint}>
            Each crop has its own base temperature and total GDD needed to reach maturity. The progress bar fills as GDD accumulates.
          </Text>
        </Card.Content>
      </Card>

      {/* About */}
      <Card style={styles.card}>
        <Card.Title title="About GrowTrack" titleStyle={styles.cardTitle} />
        <Card.Content>
          <Text variant="bodySmall" style={styles.hint}>
            Weather data: Open-Meteo (open-meteo.com) — free & open source, no account required.{'\n\n'}
            All plant data is stored locally on your device using SQLite. No server. No internet required except for weather updates.
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F8E9' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 14 },
  cardTitle: { color: '#2E7D32', fontWeight: '700' },
  hint: { color: '#555', lineHeight: 20, marginBottom: 8 },
  hintSmall: { color: '#666', lineHeight: 18, marginBottom: 6, fontSize: 12 },
  bold: { fontWeight: '700' },
  formula: {
    backgroundColor: '#F1F8E9',
    padding: 8,
    borderRadius: 8,
    fontFamily: 'monospace',
    color: '#1B5E20',
  },
  coordRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  coordInput: { flex: 1, backgroundColor: '#fff' },
  status: { color: '#2E7D32', fontSize: 12, marginBottom: 10 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1 },
  bandLabel: { fontWeight: '700', color: '#1B5E20', fontSize: 16, marginBottom: 4 },
  seasonTable: { marginTop: 8, gap: 4 },
  seasonRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  seasonName: { color: '#444', fontWeight: '600', fontSize: 13 },
  seasonMonths: { color: '#2E7D32', fontSize: 13 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '700', color: '#2E7D32' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  harvestLog: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10, marginTop: 4 },
  harvestTitle: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 6 },
  harvestRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  harvestName: { fontSize: 13, color: '#333' },
  harvestDate: { fontSize: 12, color: '#888' },
  cropChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cropChip: { backgroundColor: '#E8F5E9' },
  cropChipText: { color: '#2E7D32', fontSize: 12 },
});

