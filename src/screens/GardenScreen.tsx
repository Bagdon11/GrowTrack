import React, { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  RefreshControl,
} from 'react-native';
import { Text, FAB, Surface, Snackbar } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useGardenStore } from '../stores/gardenStore';
import { PlantCard } from '../components/PlantCard';
import { ManualTempDialog } from '../components/ManualTempDialog';
import type { RootTabParamList } from '../types';

type Props = BottomTabScreenProps<RootTabParamList, 'Garden'>;

export function GardenScreen({ navigation }: Props) {
  const cards = useGardenStore((s) => s.cards);
  const isLoading = useGardenStore((s) => s.isLoading);
  const isRefreshing = useGardenStore((s) => s.isRefreshing);
  const refreshStatus = useGardenStore((s) => s.refreshStatus);
  const loadData = useGardenStore((s) => s.loadData);
  const refreshGDD = useGardenStore((s) => s.refreshGDD);
  const clearRefreshStatus = useGardenStore((s) => s.clearRefreshStatus);
  const latitude = useGardenStore((s) => s.latitude);
  const [manualTempVisible, setManualTempVisible] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading garden...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* No-location banner */}
      {latitude === null && cards.length > 0 && (
        <Surface style={styles.locationBanner} elevation={0}>
          <Text style={styles.locationBannerText}>
            📍 No location set — go to Settings to enable GDD weather updates
          </Text>
        </Surface>
      )}

      <FlatList
        data={cards}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => <PlantCard card={item} />}
        contentContainerStyle={
          cards.length === 0 ? styles.emptyContainer : styles.list
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshGDD}
            colors={['#2E7D32']}
            tintColor="#2E7D32"
          />
        }
        ListHeaderComponent={
          cards.length > 0 ? (
            <Text style={styles.hint}>Pull down to update GDD from weather</Text>
          ) : null
        }
        ListEmptyComponent={
          <Surface style={styles.emptyCard} elevation={1}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text variant="titleMedium" style={styles.emptyTitle}>
              Your garden is empty
            </Text>
            <Text variant="bodyMedium" style={styles.emptyBody}>
              Tap the Plant button below to add your first crop and start
              tracking it with GDD.
            </Text>
          </Surface>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('Add')}
        label="Plant"
        color="#fff"
      />

      {/* Manual temperature entry for offline GDD */}
      {cards.length > 0 && (
        <FAB
          icon="thermometer"
          style={styles.fabManual}
          color="#fff"
          size="small"
          onPress={() => setManualTempVisible(true)}
        />
      )}

      <ManualTempDialog
        visible={manualTempVisible}
        onDismiss={() => setManualTempVisible(false)}
      />

      <Snackbar
        visible={refreshStatus !== null}
        onDismiss={clearRefreshStatus}
        duration={4000}
        style={styles.snackbar}
      >
        {refreshStatus ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F8E9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 8, paddingBottom: 100 },
  emptyContainer: { flex: 1, justifyContent: 'center', padding: 32 },
  locationBanner: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  locationBannerText: {
    color: '#E65100',
    fontSize: 12,
    textAlign: 'center',
  },
  emptyCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  emptyEmoji: { fontSize: 72, marginBottom: 16 },
  emptyTitle: { fontWeight: '700', color: '#2E7D32', textAlign: 'center' },
  emptyBody: {
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  hint: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 11,
    paddingTop: 8,
    paddingBottom: 4,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#2E7D32',
  },
  fabManual: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    backgroundColor: '#1565C0',
  },
  snackbar: {
    marginBottom: 80,
  },
});
