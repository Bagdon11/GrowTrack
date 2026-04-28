/**
 * GardenSpaceScreen — multi-photo garden walk-through with drag-to-place plant markers.
 *
 * UX summary:
 *  • Add photos of your backyard from different angles to build your "space".
 *  • Each photo is full-width and paginated (swipe left/right).
 *  • Active garden plants appear in a bottom panel.
 *  • Long-press (or press-and-hold) a plant chip and drag it up into the photo to
 *    drop a floating label exactly where that plant lives in real life.
 *  • Tap an existing marker to remove it.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Chip, FAB, IconButton, Surface, Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { useGardenStore } from '../stores/gardenStore';
import * as DB from '../db/database';
import type { PlantCardWithVege, SpaceMarker, SpacePhoto } from '../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PHOTO_HEIGHT = Math.round(SCREEN_H * 0.52);
const PANEL_HEIGHT = 160;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Pastel colour bucket from plant name (consistent per name). */
function chipColor(name: string): string {
  const COLORS = ['#A5D6A7', '#80DEEA', '#FFCC80', '#CE93D8', '#F48FB1', '#B0BEC5'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

// ── DraggablePlantChip ────────────────────────────────────────────────────────

interface DragChipProps {
  card: PlantCardWithVege;
  onDragStart(card: PlantCardWithVege, pageX: number, pageY: number): void;
  onDragMove(pageX: number, pageY: number): void;
  onDragEnd(pageX: number, pageY: number): void;
}

function DraggablePlantChip({ card, onDragStart, onDragMove, onDragEnd }: DragChipProps) {
  // Stable callbacks via refs so the PanResponder (created once) can call them.
  const cbRef = useRef({ onDragStart, onDragMove, onDragEnd });
  cbRef.current = { onDragStart, onDragMove, onDragEnd };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        cbRef.current.onDragStart(card, evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderMove: (evt) => {
        cbRef.current.onDragMove(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderRelease: (evt) => {
        cbRef.current.onDragEnd(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderTerminate: (evt) => {
        cbRef.current.onDragEnd(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
    }),
  ).current;

  const label =
    card.vege.variety && card.vege.variety !== 'Generic'
      ? `${card.vege.name} · ${card.vege.variety}`
      : card.vege.name;

  return (
    <View {...panResponder.panHandlers} style={styles.chipWrapper}>
      <Chip
        icon="drag-vertical"
        style={[styles.plantChip, { backgroundColor: chipColor(card.vege.name) }]}
        textStyle={styles.chipText}
      >
        {label}
      </Chip>
    </View>
  );
}

// ── PhotoView ─────────────────────────────────────────────────────────────────

interface PhotoViewProps {
  photo: SpacePhoto;
  markers: SpaceMarker[];
  onRemoveMarker(markerId: number): void;
  photoRef: React.RefObject<View | null>;
}

function PhotoView({ photo, markers, onRemoveMarker, photoRef }: PhotoViewProps) {
  return (
    <View style={styles.photoWrapper}>
      <View
        ref={photoRef}
        style={styles.photoContainer}
        collapsable={false}
      >
        <Image source={{ uri: photo.photo_uri }} style={styles.photo} resizeMode="cover" />

        {/* Floating plant markers */}
        {markers.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[
              styles.marker,
              {
                left: `${m.x_percent * 100}%` as unknown as number,
                top: `${m.y_percent * 100}%` as unknown as number,
              },
            ]}
            onPress={() => {
              Alert.alert(
                m.vege_name,
                'Remove this plant marker?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => onRemoveMarker(m.id) },
                ],
              );
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.markerBubble, { backgroundColor: chipColor(m.vege_name) }]}>
              <Text style={styles.markerPin}>📍</Text>
              <Text style={styles.markerLabel}>{m.vege_name}</Text>
            </View>
            <View style={[styles.markerStem, { borderTopColor: chipColor(m.vege_name) }]} />
          </TouchableOpacity>
        ))}

        {/* Photo label overlay */}
        {photo.label ? (
          <View style={styles.photoLabel}>
            <Text style={styles.photoLabelText}>{photo.label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function GardenSpaceScreen() {
  const cards = useGardenStore((s) => s.cards);

  const [photos, setPhotos] = useState<SpacePhoto[]>([]);
  const [markers, setMarkers] = useState<Record<number, SpaceMarker[]>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Drag state
  const [draggedCard, setDraggedCard] = useState<PlantCardWithVege | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  // Ref to the currently-visible photo container (to measure screen position)
  const photoRef = useRef<View | null>(null);
  const photoFrameRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // ── data loading ────────────────────────────────────────────────────────────

  const loadPhotos = useCallback(() => {
    const ps = DB.getAllSpacePhotos();
    setPhotos(ps);
    const ms: Record<number, SpaceMarker[]> = {};
    for (const p of ps) {
      ms[p.id] = DB.getMarkersForPhoto(p.id);
    }
    setMarkers(ms);
  }, []);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // ── photo actions ────────────────────────────────────────────────────────────

  async function addPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      // Try camera too
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera or photo library access to add garden photos.');
        return;
      }
    }

    Alert.alert('Add garden photo', 'Choose source', [
      {
        text: 'Take photo',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: 'images',
            quality: 0.85,
          });
          if (!result.canceled && result.assets[0]) {
            const id = DB.insertSpacePhoto(result.assets[0].uri, null);
            loadPhotos();
            // Jump to new photo
            setTimeout(() => setCurrentIndex(photos.length), 100);
          }
        },
      },
      {
        text: 'Choose from library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            quality: 0.85,
          });
          if (!result.canceled && result.assets[0]) {
            DB.insertSpacePhoto(result.assets[0].uri, null);
            loadPhotos();
            setTimeout(() => setCurrentIndex(photos.length), 100);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function removeCurrentPhoto() {
    const photo = photos[currentIndex];
    if (!photo) return;
    Alert.alert(
      'Remove photo',
      'This will also remove all plant markers on this photo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            DB.deleteSpacePhoto(photo.id);
            setCurrentIndex((i) => Math.max(0, i - 1));
            loadPhotos();
          },
        },
      ],
    );
  }

  // ── drag handlers ────────────────────────────────────────────────────────────

  const measurePhoto = useCallback(() => {
    photoRef.current?.measure((_fx, _fy, w, h, px, py) => {
      photoFrameRef.current = { x: px, y: py, w, h };
    });
  }, []);

  const handleDragStart = useCallback(
    (card: PlantCardWithVege, pageX: number, pageY: number) => {
      measurePhoto();
      isDraggingRef.current = true;
      setDraggedCard(card);
      setDragPos({ x: pageX, y: pageY });
    },
    [measurePhoto],
  );

  const handleDragMove = useCallback((pageX: number, pageY: number) => {
    if (isDraggingRef.current) {
      setDragPos({ x: pageX, y: pageY });
    }
  }, []);

  const handleDragEnd = useCallback(
    (pageX: number, pageY: number) => {
      isDraggingRef.current = false;
      const card = draggedCard;
      const frame = photoFrameRef.current;
      const photo = photos[currentIndex];

      if (card && photo && frame.w > 0) {
        const relX = (pageX - frame.x) / frame.w;
        const relY = (pageY - frame.y) / frame.h;

        if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
          const vegeName =
            card.vege.variety && card.vege.variety !== 'Generic'
              ? `${card.vege.name} · ${card.vege.variety}`
              : card.vege.name;
          const newId = DB.insertSpaceMarker(photo.id, card.id, vegeName, relX, relY);
          setMarkers((prev) => ({
            ...prev,
            [photo.id]: [
              ...(prev[photo.id] ?? []),
              { id: newId, photo_id: photo.id, card_id: card.id, vege_name: vegeName, x_percent: relX, y_percent: relY },
            ],
          }));
        }
      }

      setDraggedCard(null);
    },
    [draggedCard, photos, currentIndex],
  );

  function removeMarker(markerId: number) {
    DB.deleteSpaceMarker(markerId);
    const photo = photos[currentIndex];
    if (!photo) return;
    setMarkers((prev) => ({
      ...prev,
      [photo.id]: (prev[photo.id] ?? []).filter((m) => m.id !== markerId),
    }));
  }

  // ── render ───────────────────────────────────────────────────────────────────

  const currentPhoto = photos[currentIndex] ?? null;
  const currentMarkers = currentPhoto ? (markers[currentPhoto.id] ?? []) : [];

  // Drop zone highlight: is the ghost over the photo?
  const frame = photoFrameRef.current;
  const isOverPhoto =
    draggedCard !== null &&
    frame.w > 0 &&
    dragPos.x >= frame.x &&
    dragPos.x <= frame.x + frame.w &&
    dragPos.y >= frame.y &&
    dragPos.y <= frame.y + frame.h;

  return (
    <View style={styles.container}>

      {/* ── photo area ──────────────────────────────────────────────────────── */}
      {photos.length === 0 ? (
        <View style={styles.emptyPhoto}>
          <Text style={styles.emptyEmoji}>🏡</Text>
          <Text style={styles.emptyTitle}>Your garden space is empty</Text>
          <Text style={styles.emptyBody}>
            Tap the camera button below to add photos of your backyard from
            different angles. Then drag your plants from the panel below onto
            the photo to mark exactly where they live.
          </Text>
        </View>
      ) : (
        <View style={[styles.photoArea, isOverPhoto && styles.photoAreaHighlight]}>
          {currentPhoto && (
            <PhotoView
              photo={currentPhoto}
              markers={currentMarkers}
              onRemoveMarker={removeMarker}
              photoRef={photoRef}
            />
          )}

          {/* Pagination dots */}
          {photos.length > 1 && (
            <View style={styles.dots}>
              {photos.map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setCurrentIndex(i)}
                  style={[styles.dot, i === currentIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}

          {/* Prev / Next arrows */}
          {photos.length > 1 && (
            <>
              {currentIndex > 0 && (
                <IconButton
                  icon="chevron-left"
                  size={28}
                  style={styles.arrowLeft}
                  iconColor="#fff"
                  onPress={() => setCurrentIndex((i) => i - 1)}
                />
              )}
              {currentIndex < photos.length - 1 && (
                <IconButton
                  icon="chevron-right"
                  size={28}
                  style={styles.arrowRight}
                  iconColor="#fff"
                  onPress={() => setCurrentIndex((i) => i + 1)}
                />
              )}
            </>
          )}

          {/* Remove photo */}
          <IconButton
            icon="trash-can-outline"
            size={20}
            iconColor="#fff"
            style={styles.deletePhotoBtn}
            onPress={removeCurrentPhoto}
          />

          {/* Drop hint while dragging */}
          {draggedCard && (
            <View style={styles.dropHint}>
              <Text style={styles.dropHintText}>
                {isOverPhoto ? '✅ Release to place' : '⬆ Drag up to place'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── bottom plant panel ───────────────────────────────────────────────── */}
      <Surface style={styles.panel} elevation={4}>
        <Text style={styles.panelTitle}>
          {cards.length === 0
            ? 'Add plants in the Garden tab first'
            : 'Hold & drag a plant onto the photo above'}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!isDraggingRef.current}
          contentContainerStyle={styles.chipRow}
        >
          {cards.map((card) => (
            <DraggablePlantChip
              key={card.id}
              card={card}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            />
          ))}
        </ScrollView>
      </Surface>

      {/* ── floating drag ghost ──────────────────────────────────────────────── */}
      {draggedCard && (
        <View
          style={[styles.ghost, { left: dragPos.x - 60, top: dragPos.y - 22 }]}
          pointerEvents="none"
        >
          <Chip
            icon="map-marker"
            style={[styles.ghostChip, { backgroundColor: chipColor(draggedCard.vege.name) }]}
            textStyle={styles.chipText}
          >
            {draggedCard.vege.variety && draggedCard.vege.variety !== 'Generic'
              ? `${draggedCard.vege.name} · ${draggedCard.vege.variety}`
              : draggedCard.vege.name}
          </Chip>
        </View>
      )}

      {/* ── add photo FAB ────────────────────────────────────────────────────── */}
      <FAB
        icon="camera-plus"
        style={styles.fab}
        color="#fff"
        onPress={addPhoto}
        label={photos.length === 0 ? 'Add photo' : ''}
        size="small"
      />
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },

  // Photo area
  photoArea: {
    height: PHOTO_HEIGHT,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  photoAreaHighlight: {
    borderWidth: 3,
    borderColor: '#66BB6A',
  },
  photoWrapper: { flex: 1 },
  photoContainer: {
    width: SCREEN_W,
    height: PHOTO_HEIGHT,
    position: 'relative',
  },
  photo: { width: '100%', height: '100%' },

  // Markers
  marker: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -50 }, { translateY: -52 }],
  },
  markerBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  markerPin: { fontSize: 12 },
  markerLabel: { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },
  markerStem: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  // Photo label
  photoLabel: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  photoLabelText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Navigation
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { backgroundColor: '#fff' },
  arrowLeft: {
    position: 'absolute',
    left: 4,
    top: PHOTO_HEIGHT / 2 - 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
  },
  arrowRight: {
    position: 'absolute',
    right: 4,
    top: PHOTO_HEIGHT / 2 - 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
  },
  deletePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    margin: 0,
  },
  dropHint: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dropHintText: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    fontSize: 13,
    fontWeight: '600',
    overflow: 'hidden',
  },

  // Empty state
  emptyPhoto: {
    height: PHOTO_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    color: '#ccc',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyBody: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Bottom panel
  panel: {
    height: PANEL_HEIGHT,
    backgroundColor: '#12122a',
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  panelTitle: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    gap: 8,
  },
  chipWrapper: { marginRight: 0 },
  plantChip: { height: 36 },
  chipText: { fontSize: 12, color: '#1a1a1a', fontWeight: '600' },

  // Drag ghost
  ghost: {
    position: 'absolute',
    zIndex: 999,
    elevation: 10,
    opacity: 0.92,
  },
  ghostChip: {
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 16,
    bottom: PANEL_HEIGHT + 16,
    backgroundColor: '#2E7D32',
  },
});
