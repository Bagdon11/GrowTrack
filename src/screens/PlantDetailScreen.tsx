import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Text, Button, TextInput, Card, Divider, IconButton } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useGardenStore } from '../stores/gardenStore';
import { GDDProgressBar } from '../components/GDDProgressBar';
import { getProgressPercent, getStageForPercent } from '../services/gdd';
import * as DB from '../db/database';
import type { RootStackParamList, JournalEntry } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PlantDetail'>;

export function PlantDetailScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const cards = useGardenStore((s) => s.cards);
  const card = cards.find((c) => c.id === cardId);

  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [noteText, setNoteText] = useState('');
  const [adding, setAdding] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setJournal(DB.getJournalForCard(cardId));
    }, [cardId]),
  );

  if (!card) {
    return (
      <View style={styles.centered}>
        <Text>Plant not found.</Text>
      </View>
    );
  }

  const { vege } = card;
  const progress = getProgressPercent(card.accumulated_gdd, vege.gdd_to_maturity);
  const stage = getStageForPercent(progress);

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach pictures to your journal.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      DB.insertJournalEntry(cardId, noteText.trim() || null, result.assets[0].uri);
      setNoteText('');
      setJournal(DB.getJournalForCard(cardId));
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take photos for your journal.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      DB.insertJournalEntry(cardId, noteText.trim() || null, result.assets[0].uri);
      setNoteText('');
      setJournal(DB.getJournalForCard(cardId));
    }
  }

  function saveNote() {
    if (!noteText.trim()) return;
    DB.insertJournalEntry(cardId, noteText.trim(), null);
    setNoteText('');
    setJournal(DB.getJournalForCard(cardId));
    setAdding(false);
  }

  function deleteEntry(id: number) {
    Alert.alert('Delete entry', 'Remove this journal entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          DB.deleteJournalEntry(id);
          setJournal(DB.getJournalForCard(cardId));
        },
      },
    ]);
  }

  const displayName =
    vege.variety && vege.variety !== 'Generic'
      ? `${vege.name} · ${vege.variety}`
      : vege.name;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header card */}
      <Card style={styles.card} elevation={2}>
        <Card.Content>
          <Text variant="headlineSmall" style={styles.name}>{displayName}</Text>
          {card.location ? (
            <Text variant="bodySmall" style={styles.sub}>📍 {card.location}</Text>
          ) : null}
          <Text variant="bodySmall" style={styles.sub}>
            Planted {card.planted_date} · {stage.emoji} {stage.name}
          </Text>

          <View style={styles.progressRow}>
            <GDDProgressBar accumulated={card.accumulated_gdd} total={vege.gdd_to_maturity} />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{card.accumulated_gdd.toFixed(0)}</Text>
              <Text style={styles.statLabel}>GDD earned</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{vege.gdd_to_maturity.toFixed(0)}</Text>
              <Text style={styles.statLabel}>GDD to harvest</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{progress.toFixed(0)}%</Text>
              <Text style={styles.statLabel}>Complete</Text>
            </View>
          </View>

          {vege.description ? (
            <Text variant="bodySmall" style={styles.desc}>{vege.description}</Text>
          ) : null}
        </Card.Content>
      </Card>

      {/* Care info */}
      <Card style={styles.card} elevation={1}>
        <Card.Title title="Care Guide" titleStyle={styles.sectionTitle} />
        <Card.Content>
          <View style={styles.careRow}>
            <Text style={styles.careItem}>💧 Water every {vege.water_interval_days} days</Text>
            <Text style={styles.careItem}>🌿 Fertilise every {vege.fertilise_interval_days} days</Text>
          </View>
          <View style={styles.careRow}>
            <Text style={styles.careItem}>🌡️ Base temp {vege.base_temp}°C</Text>
            <Text style={styles.careItem}>
              ❄️ {vege.frost_tolerant ? 'Frost tolerant' : 'Frost sensitive'}
            </Text>
          </View>
          {vege.spacing_cm ? (
            <Text style={styles.careItem}>📏 Space {vege.spacing_cm}cm apart</Text>
          ) : null}
        </Card.Content>
      </Card>

      {/* Journal */}
      <Card style={styles.card} elevation={1}>
        <Card.Title
          title="Journal"
          titleStyle={styles.sectionTitle}
          right={() => (
            <View style={styles.journalActions}>
              <IconButton icon="camera" size={22} onPress={takePhoto} iconColor="#2E7D32" />
              <IconButton icon="image" size={22} onPress={pickPhoto} iconColor="#2E7D32" />
              <IconButton
                icon={adding ? 'chevron-up' : 'pencil-plus'}
                size={22}
                onPress={() => setAdding((v) => !v)}
                iconColor="#2E7D32"
              />
            </View>
          )}
        />
        <Card.Content>
          {adding && (
            <View style={styles.noteInput}>
              <TextInput
                mode="outlined"
                placeholder="Write a note about your plant…"
                value={noteText}
                onChangeText={setNoteText}
                multiline
                numberOfLines={3}
                outlineColor="#c8e6c9"
                activeOutlineColor="#2E7D32"
                style={styles.textArea}
              />
              <View style={styles.noteButtons}>
                <Button
                  mode="contained"
                  onPress={saveNote}
                  buttonColor="#2E7D32"
                  disabled={!noteText.trim()}
                  style={styles.noteBtn}
                >
                  Save note
                </Button>
                <Button
                  mode="text"
                  onPress={() => { setAdding(false); setNoteText(''); }}
                  textColor="#888"
                >
                  Cancel
                </Button>
              </View>
            </View>
          )}

          {journal.length === 0 && !adding ? (
            <Text style={styles.empty}>No journal entries yet. Tap ✏️ to add a note or 📷 to add a photo.</Text>
          ) : null}

          {journal.map((entry, idx) => (
            <View key={entry.id}>
              {idx > 0 && <Divider style={styles.divider} />}
              <View style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryDate}>
                    {new Date(entry.created_at).toLocaleDateString('en-NZ', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                  <IconButton
                    icon="trash-can-outline"
                    size={16}
                    onPress={() => deleteEntry(entry.id)}
                    iconColor="#ccc"
                    style={styles.deleteBtn}
                  />
                </View>
                {entry.photo_uri ? (
                  <TouchableOpacity>
                    <Image source={{ uri: entry.photo_uri }} style={styles.photo} />
                  </TouchableOpacity>
                ) : null}
                {entry.note ? (
                  <Text style={styles.entryNote}>{entry.note}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F8E9' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { marginBottom: 12, borderRadius: 14, backgroundColor: '#fff' },
  name: { fontWeight: '700', color: '#1B5E20' },
  sub: { color: '#666', marginTop: 2 },
  progressRow: { marginTop: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#2E7D32' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  desc: { marginTop: 12, color: '#555', fontStyle: 'italic', lineHeight: 18 },
  sectionTitle: { fontWeight: '700', color: '#2E7D32' },
  careRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  careItem: { fontSize: 13, color: '#444', flex: 1 },
  journalActions: { flexDirection: 'row', alignItems: 'center', marginRight: 4 },
  noteInput: { marginBottom: 12 },
  textArea: { backgroundColor: '#fff', fontSize: 14 },
  noteButtons: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  noteBtn: { marginRight: 8 },
  empty: { color: '#aaa', fontStyle: 'italic', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  entry: { paddingVertical: 8 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryDate: { fontSize: 11, color: '#aaa' },
  deleteBtn: { margin: 0 },
  photo: { width: '100%', height: 200, borderRadius: 8, marginTop: 8, marginBottom: 4 },
  entryNote: { fontSize: 14, color: '#333', marginTop: 4, lineHeight: 20 },
  divider: { marginVertical: 4 },
});
