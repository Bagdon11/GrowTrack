import * as SQLite from 'expo-sqlite';
import { Vegetable, PlantCard, JournalEntry, HarvestLog, SpacePhoto, SpaceMarker } from '../types';
import { SEED_VEGETABLES } from './seed';

const db = SQLite.openDatabaseSync('growtrack.db');

/**
 * Bump whenever SEED_VEGETABLES changes. Only NEW entries are inserted;
 * existing rows are never modified and plant_cards are never touched.
 */
const DB_SEED_VERSION = 'canterbury-v3';

/**
 * Schema version — increment whenever a migration step is added below.
 * This is separate from DB_SEED_VERSION so we can evolve the schema
 * independently of the seed data.
 */
const SCHEMA_VERSION = 2;

// ── Schema ───────────────────────────────────────────────────────────────────

export function initDatabase(): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS vegetables (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      name                    TEXT    NOT NULL,
      variety                 TEXT,
      base_temp               REAL    NOT NULL DEFAULT 10.0,
      gdd_to_maturity         REAL    NOT NULL,
      days_to_germination     INTEGER NOT NULL DEFAULT 7,
      water_interval_days     INTEGER NOT NULL DEFAULT 3,
      fertilise_interval_days INTEGER NOT NULL DEFAULT 14,
      spacing_cm              INTEGER,
      description             TEXT,
      season                  TEXT,
      frost_tolerant          INTEGER NOT NULL DEFAULT 0,
      source                  TEXT    NOT NULL DEFAULT 'seed'
                                      CHECK(source IN ('seed','local','community')),
      remote_id               TEXT    UNIQUE
    );

    CREATE TABLE IF NOT EXISTS plant_cards (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      vege_id          INTEGER NOT NULL REFERENCES vegetables(id),
      planted_date     TEXT    NOT NULL,
      location         TEXT,
      notes            TEXT,
      accumulated_gdd  REAL    NOT NULL DEFAULT 0.0,
      last_gdd_update  TEXT,
      watered_at       TEXT,
      fertilised_at    TEXT,
      status           TEXT    NOT NULL DEFAULT 'growing'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id     INTEGER NOT NULL REFERENCES plant_cards(id),
      created_at  TEXT    NOT NULL,
      note        TEXT,
      photo_uri   TEXT
    );

    CREATE TABLE IF NOT EXISTS harvest_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id      INTEGER NOT NULL,
      vege_name    TEXT    NOT NULL,
      harvested_at TEXT    NOT NULL,
      final_gdd    REAL    NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS space_photos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_uri  TEXT    NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      label      TEXT
    );

    CREATE TABLE IF NOT EXISTS space_markers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id   INTEGER NOT NULL REFERENCES space_photos(id) ON DELETE CASCADE,
      card_id    INTEGER,
      vege_name  TEXT    NOT NULL,
      x_percent  REAL    NOT NULL,
      y_percent  REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manual_temp_readings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      slot        TEXT    NOT NULL CHECK(slot IN ('morning','midday','evening')),
      temp_c      REAL    NOT NULL,
      UNIQUE(date, slot)
    );
  `);

  runMigrations();
  seedVegetables();
}

// ── Migrations ────────────────────────────────────────────────────────────────
// Each migration runs exactly once, identified by its version number.
// Add new steps at the END — never modify existing ones.

function runMigrations(): void {
  const current = parseInt(
    db.getFirstSync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'schema_version'",
    )?.value ?? '0',
    10,
  );

  if (current >= SCHEMA_VERSION) return;

  // ── v1 → v2: add source + remote_id columns to vegetables ────────────────
  // ALTER TABLE ADD COLUMN is safe on existing databases; the DEFAULT fills
  // existing rows so the NOT NULL constraint is satisfied without a full rewrite.
  if (current < 2) {
    try {
      db.execSync(`ALTER TABLE vegetables ADD COLUMN source TEXT NOT NULL DEFAULT 'seed' CHECK(source IN ('seed','local','community'))`);
    } catch {
      // Column already exists (fresh install created it via CREATE TABLE) — ignore.
    }
    try {
      db.execSync('ALTER TABLE vegetables ADD COLUMN remote_id TEXT');
    } catch {
      // Same — ignore on fresh install.
    }
    // Ensure any pre-existing local custom crops are tagged correctly.
    // Rows that were inserted via insertVegetable (user-created) will have
    // source = 'seed' from the default — we can't distinguish them retroactively,
    // so we leave them as 'seed'. Going forward insertVegetable uses 'local'.
  }

  db.runSync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)",
    String(SCHEMA_VERSION),
  );
}

function seedVegetables(): void {
  const version = db.getFirstSync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'seed_version'",
  )?.value;
  if (version === DB_SEED_VERSION) return;

  // Safe upsert: INSERT OR IGNORE means existing rows (matched by name+variety)
  // are left untouched — IDs stay stable, plant_cards are never touched.
  // New plants in SEED_VEGETABLES are added; removed ones stay in the DB so
  // any user who planted them keeps their history.
  for (const v of SEED_VEGETABLES) {
    db.runSync(
      `INSERT OR IGNORE INTO vegetables
         (name, variety, base_temp, gdd_to_maturity, days_to_germination,
          water_interval_days, fertilise_interval_days, spacing_cm,
          description, season, frost_tolerant, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')`,
      v.name,
      v.variety ?? null,
      v.base_temp,
      v.gdd_to_maturity,
      v.days_to_germination,
      v.water_interval_days,
      v.fertilise_interval_days,
      v.spacing_cm ?? null,
      v.description ?? null,
      v.season ?? null,
      v.frost_tolerant ?? 0,
    );
  }
  db.runSync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('seed_version', ?)",
    DB_SEED_VERSION,
  );
}

// ── Vegetables ───────────────────────────────────────────────────────────────

export function getAllVegetables(): Vegetable[] {
  return db.getAllSync<Vegetable>('SELECT * FROM vegetables ORDER BY name ASC');
}

export function insertVegetable(v: Omit<Vegetable, 'id'>): number {
  const result = db.runSync(
    `INSERT INTO vegetables
       (name, variety, base_temp, gdd_to_maturity, days_to_germination,
        water_interval_days, fertilise_interval_days, spacing_cm,
        description, season, frost_tolerant, source, remote_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    v.name,
    v.variety ?? null,
    v.base_temp,
    v.gdd_to_maturity,
    v.days_to_germination,
    v.water_interval_days,
    v.fertilise_interval_days,
    v.spacing_cm ?? null,
    v.description ?? null,
    v.season ?? null,
    v.frost_tolerant,
    v.source ?? 'local',
    v.remote_id ?? null,
  );
  return result.lastInsertRowId;
}

/**
 * Upsert a community-sourced vegetable by remote_id.
 * If the remote_id already exists we update the agronomic fields but leave
 * the local ID stable so any existing plant_cards are unaffected.
 */
export function upsertCommunityVegetable(v: Omit<Vegetable, 'id'> & { remote_id: string }): void {
  db.runSync(
    `INSERT INTO vegetables
       (name, variety, base_temp, gdd_to_maturity, days_to_germination,
        water_interval_days, fertilise_interval_days, spacing_cm,
        description, season, frost_tolerant, source, remote_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'community', ?)
     ON CONFLICT(remote_id) DO UPDATE SET
       name                    = excluded.name,
       variety                 = excluded.variety,
       base_temp               = excluded.base_temp,
       gdd_to_maturity         = excluded.gdd_to_maturity,
       days_to_germination     = excluded.days_to_germination,
       water_interval_days     = excluded.water_interval_days,
       fertilise_interval_days = excluded.fertilise_interval_days,
       spacing_cm              = excluded.spacing_cm,
       description             = excluded.description,
       season                  = excluded.season,
       frost_tolerant          = excluded.frost_tolerant`,
    v.name,
    v.variety ?? null,
    v.base_temp,
    v.gdd_to_maturity,
    v.days_to_germination,
    v.water_interval_days,
    v.fertilise_interval_days,
    v.spacing_cm ?? null,
    v.description ?? null,
    v.season ?? null,
    v.frost_tolerant,
    v.remote_id,
  );
}

export function getVegetableById(id: number): Vegetable | null {
  return (
    db.getFirstSync<Vegetable>('SELECT * FROM vegetables WHERE id = ?', id) ??
    null
  );
}

export function getVegetableByRemoteId(remoteId: string): Vegetable | null {
  return (
    db.getFirstSync<Vegetable>(
      'SELECT * FROM vegetables WHERE remote_id = ?',
      remoteId,
    ) ?? null
  );
}

// ── Plant Cards ──────────────────────────────────────────────────────────────

export function getAllActivePlantCards(): PlantCard[] {
  return db.getAllSync<PlantCard>(
    "SELECT * FROM plant_cards WHERE status = 'growing' ORDER BY planted_date DESC",
  );
}

export function insertPlantCard(
  vege_id: number,
  planted_date: string,
  location: string | null,
  notes: string | null,
): number {
  const result = db.runSync(
    'INSERT INTO plant_cards (vege_id, planted_date, location, notes) VALUES (?, ?, ?, ?)',
    vege_id,
    planted_date,
    location,
    notes,
  );
  return result.lastInsertRowId;
}

export function updatePlantCardGDD(
  id: number,
  accumulated_gdd: number,
  last_gdd_update: string,
): void {
  db.runSync(
    'UPDATE plant_cards SET accumulated_gdd = ?, last_gdd_update = ? WHERE id = ?',
    accumulated_gdd,
    last_gdd_update,
    id,
  );
}

export function updateWateredAt(id: number, timestamp: string): void {
  db.runSync('UPDATE plant_cards SET watered_at = ? WHERE id = ?', timestamp, id);
}

export function updateFertilisedAt(id: number, timestamp: string): void {
  db.runSync(
    'UPDATE plant_cards SET fertilised_at = ? WHERE id = ?',
    timestamp,
    id,
  );
}

export function setPlantCardStatus(
  id: number,
  status: 'growing' | 'harvested' | 'removed',
): void {
  db.runSync(
    'UPDATE plant_cards SET status = ? WHERE id = ?',
    status,
    id,
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.runSync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    key,
    value,
  );
}

// ── Journal ───────────────────────────────────────────────────────────────────

export function getJournalForCard(cardId: number): JournalEntry[] {
  return db.getAllSync<JournalEntry>(
    'SELECT * FROM journal_entries WHERE card_id = ? ORDER BY created_at DESC',
    cardId,
  );
}

export function insertJournalEntry(
  cardId: number,
  note: string | null,
  photoUri: string | null,
): number {
  const result = db.runSync(
    'INSERT INTO journal_entries (card_id, created_at, note, photo_uri) VALUES (?, ?, ?, ?)',
    cardId,
    new Date().toISOString(),
    note,
    photoUri,
  );
  return result.lastInsertRowId;
}

export function deleteJournalEntry(id: number): void {
  db.runSync('DELETE FROM journal_entries WHERE id = ?', id);
}

// ── Harvest Log ───────────────────────────────────────────────────────────────

export function logHarvest(
  cardId: number,
  vegeName: string,
  finalGdd: number,
): void {
  db.runSync(
    'INSERT INTO harvest_log (card_id, vege_name, harvested_at, final_gdd) VALUES (?, ?, ?, ?)',
    cardId,
    vegeName,
    new Date().toISOString(),
    finalGdd,
  );
}

export function getAllHarvestLogs(): HarvestLog[] {
  return db.getAllSync<HarvestLog>(
    'SELECT * FROM harvest_log ORDER BY harvested_at DESC',
  );
}

export function getHarvestCount(): number {
  const row = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM harvest_log',
  );
  return row?.count ?? 0;
}

export function getTotalGDDAccumulated(): number {
  const row = db.getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(accumulated_gdd),0) as total FROM plant_cards',
  );
  return row?.total ?? 0;
}

export function getActiveCardCount(): number {
  const row = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) as count FROM plant_cards WHERE status = 'growing'",
  );
  return row?.count ?? 0;
}

export function getAllPlantedVegeNames(): string[] {
  const rows = db.getAllSync<{ name: string }>(
    "SELECT DISTINCT v.name FROM plant_cards pc JOIN vegetables v ON pc.vege_id = v.id WHERE pc.status = 'growing'",
  );
  return rows.map((r) => r.name);
}

// ── Garden Space ──────────────────────────────────────────────────────────────

export function getAllSpacePhotos(): SpacePhoto[] {
  return db.getAllSync<SpacePhoto>(
    'SELECT * FROM space_photos ORDER BY sort_order ASC, id ASC',
  );
}

export function insertSpacePhoto(photoUri: string, label: string | null): number {
  const maxOrder = db.getFirstSync<{ m: number | null }>(
    'SELECT MAX(sort_order) as m FROM space_photos',
  )?.m ?? -1;
  const result = db.runSync(
    'INSERT INTO space_photos (photo_uri, sort_order, label) VALUES (?, ?, ?)',
    photoUri,
    maxOrder + 1,
    label,
  );
  return result.lastInsertRowId;
}

export function deleteSpacePhoto(photoId: number): void {
  db.runSync('DELETE FROM space_markers WHERE photo_id = ?', photoId);
  db.runSync('DELETE FROM space_photos WHERE id = ?', photoId);
}

export function updateSpacePhotoLabel(photoId: number, label: string): void {
  db.runSync('UPDATE space_photos SET label = ? WHERE id = ?', label, photoId);
}

export function getMarkersForPhoto(photoId: number): SpaceMarker[] {
  return db.getAllSync<SpaceMarker>(
    'SELECT * FROM space_markers WHERE photo_id = ?',
    photoId,
  );
}

export function insertSpaceMarker(
  photoId: number,
  cardId: number | null,
  vegeName: string,
  xPercent: number,
  yPercent: number,
): number {
  const result = db.runSync(
    'INSERT INTO space_markers (photo_id, card_id, vege_name, x_percent, y_percent) VALUES (?, ?, ?, ?, ?)',
    photoId,
    cardId,
    vegeName,
    xPercent,
    yPercent,
  );
  return result.lastInsertRowId;
}

export function deleteSpaceMarker(markerId: number): void {
  db.runSync('DELETE FROM space_markers WHERE id = ?', markerId);
}

// ── Manual Temperature Readings ───────────────────────────────────────────────

export type TempSlot = 'morning' | 'midday' | 'evening';

export interface ManualTempReading {
  id: number;
  date: string;   // YYYY-MM-DD
  slot: TempSlot;
  temp_c: number;
}

export function getManualReadingsForDate(date: string): ManualTempReading[] {
  return db.getAllSync<ManualTempReading>(
    "SELECT * FROM manual_temp_readings WHERE date = ? ORDER BY CASE slot WHEN 'morning' THEN 1 WHEN 'midday' THEN 2 ELSE 3 END",
    date,
  );
}

export function upsertManualReading(date: string, slot: TempSlot, temp_c: number): void {
  db.runSync(
    'INSERT OR REPLACE INTO manual_temp_readings (date, slot, temp_c) VALUES (?, ?, ?)',
    date,
    slot,
    temp_c,
  );
}

export function deleteManualReading(date: string, slot: TempSlot): void {
  db.runSync(
    'DELETE FROM manual_temp_readings WHERE date = ? AND slot = ?',
    date,
    slot,
  );
}

/** Returns all dates that have at least one manual reading, newest first. */
export function getManualReadingDates(): string[] {
  const rows = db.getAllSync<{ date: string }>(
    'SELECT DISTINCT date FROM manual_temp_readings ORDER BY date DESC',
  );
  return rows.map((r) => r.date);
}
