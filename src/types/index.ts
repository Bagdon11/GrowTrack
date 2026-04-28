export interface Vegetable {
  id: number;
  name: string;
  variety: string | null;
  base_temp: number;
  gdd_to_maturity: number;
  days_to_germination: number;
  water_interval_days: number;
  fertilise_interval_days: number;
  spacing_cm: number | null;
  description: string | null;
  season: string | null;
  frost_tolerant: number; // 0 = no, 1 = yes
  /** 'seed' = bundled, 'local' = user-created, 'community' = synced from server */
  source: 'seed' | 'local' | 'community';
  /** Stable ID from the community JSON (null for seed/local entries). */
  remote_id: string | null;
}

export interface PlantCard {
  id: number;
  vege_id: number;
  planted_date: string; // YYYY-MM-DD
  location: string | null;
  notes: string | null;
  accumulated_gdd: number;
  last_gdd_update: string | null; // YYYY-MM-DD
  watered_at: string | null; // ISO datetime
  fertilised_at: string | null; // ISO datetime
  status: 'growing' | 'harvested' | 'removed';
}

export interface PlantCardWithVege extends PlantCard {
  vege: Vegetable;
}

export interface DailyWeather {
  date: string; // YYYY-MM-DD
  tmax: number;
  tmin: number;
}

export interface GDDStage {
  name: string;
  emoji: string;
  minPercent: number;
  maxPercent: number;
  color: string;
}

export type RootTabParamList = {
  Garden: undefined;
  Add: undefined;
  Space: undefined;
  Globe: undefined;
  Settings: undefined;
};

// ── Garden Space ──────────────────────────────────────────────────────────────

export interface SpacePhoto {
  id: number;
  photo_uri: string;
  sort_order: number;
  label: string | null;
}

export interface SpaceMarker {
  id: number;
  photo_id: number;
  card_id: number | null;
  vege_name: string;
  x_percent: number; // 0.0 – 1.0 relative to photo width
  y_percent: number; // 0.0 – 1.0 relative to photo height
}

export type RootStackParamList = {
  Tabs: undefined;
  PlantDetail: { cardId: number };
};

export interface JournalEntry {
  id: number;
  card_id: number;
  created_at: string;
  note: string | null;
  photo_uri: string | null;
}

export interface HarvestLog {
  id: number;
  card_id: number;
  vege_name: string;
  harvested_at: string;
  final_gdd: number;
}
