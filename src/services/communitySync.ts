/**
 * communitySync — fetches the approved community plant list from the
 * GrowTrack GitHub repository and upserts any new/updated entries into the
 * local SQLite database.
 *
 * The JSON file lives at:
 *   https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/GrowTrack/main/community-plants.json
 *
 * Update COMMUNITY_PLANTS_URL below to match your real GitHub username/repo.
 */

import * as DB from '../db/database';

const COMMUNITY_PLANTS_URL =
  'https://web-production-45650.up.railway.app/api/growtrack/plants';

/** Minimum milliseconds between sync attempts (4 hours). */
const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Shape of each entry in community-plants.json */
export interface CommunityPlant {
  /** Stable UUID assigned when the plant is approved. Never changes. */
  id: string;
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
  frost_tolerant: number;
}

export interface SyncResult {
  added: number;
  updated: number;
  error?: string;
}

/**
 * Fetch and apply the latest community plant list.
 * Skips the request if the last sync was less than SYNC_INTERVAL_MS ago.
 * Safe to call on every app launch.
 */
export async function syncCommunityPlants(): Promise<SyncResult> {
  // Throttle: check when we last synced
  const lastSyncStr = DB.getSetting('community_sync_at');
  if (lastSyncStr) {
    const elapsed = Date.now() - parseInt(lastSyncStr, 10);
    if (elapsed < SYNC_INTERVAL_MS) {
      return { added: 0, updated: 0 };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(COMMUNITY_PLANTS_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return { added: 0, updated: 0, error: `HTTP ${response.status}` };
  }

  let plants: CommunityPlant[];
  try {
    plants = (await response.json()) as CommunityPlant[];
  } catch {
    return { added: 0, updated: 0, error: 'Invalid JSON from server' };
  }

  if (!Array.isArray(plants)) {
    return { added: 0, updated: 0, error: 'Unexpected response shape' };
  }

  let added = 0;
  let updated = 0;

  for (const plant of plants) {
    // Basic shape guard — skip malformed entries rather than crashing
    if (
      typeof plant.id !== 'string' ||
      !plant.id ||
      typeof plant.name !== 'string' ||
      !plant.name ||
      typeof plant.base_temp !== 'number' ||
      typeof plant.gdd_to_maturity !== 'number'
    ) {
      continue;
    }

    const existing = DB.getVegetableByRemoteId(plant.id);
    DB.upsertCommunityVegetable({
      name: plant.name,
      variety: plant.variety ?? null,
      base_temp: plant.base_temp,
      gdd_to_maturity: plant.gdd_to_maturity,
      days_to_germination: plant.days_to_germination ?? 7,
      water_interval_days: plant.water_interval_days ?? 3,
      fertilise_interval_days: plant.fertilise_interval_days ?? 14,
      spacing_cm: plant.spacing_cm ?? null,
      description: plant.description ?? null,
      season: plant.season ?? null,
      frost_tolerant: plant.frost_tolerant ?? 0,
      source: 'community',
      remote_id: plant.id,
    });

    if (existing) {
      updated++;
    } else {
      added++;
    }
  }

  // Record sync time
  DB.setSetting('community_sync_at', String(Date.now()));

  return { added, updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission — lets users propose a custom crop to the community.
// Submissions are sent as a GitHub Issue via a simple serverless endpoint
// on your website (e.g. a Netlify Function or Formspree form).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * URL of your submission endpoint.
 * Options (all free tier):
 *   - Formspree:   https://formspree.io/f/YOUR_FORM_ID
 *   - Netlify:     https://your-site.netlify.app/.netlify/functions/submit-plant
 *   - Your own:    https://yourdomain.com/api/submit-plant
 *
 * The endpoint receives a POST with JSON body matching CommunityPlantSubmission.
 * It should create a GitHub Issue or write to a review spreadsheet.
 */
const SUBMISSION_URL = 'https://web-production-45650.up.railway.app/api/growtrack/submit';

export interface CommunityPlantSubmission {
  name: string;
  variety: string | null;
  base_temp: number;
  gdd_to_maturity: number;
  days_to_germination: number;
  water_interval_days: number;
  fertilise_interval_days: number;
  spacing_cm: number | null;
  description: string;
  season: string;
  frost_tolerant: number;
  /** Optional: submitter's region for context (e.g. "Canterbury, NZ") */
  region?: string;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Submit a locally-created crop to the community review queue.
 * All fields are validated here before sending.
 */
export async function submitCommunityPlant(
  plant: CommunityPlantSubmission,
): Promise<SubmitResult> {
  // Validate all required fields
  const errors: string[] = [];
  if (!plant.name.trim()) errors.push('Name is required');
  if (!plant.description.trim()) errors.push('Description is required');
  if (!plant.season.trim()) errors.push('At least one season must be selected');
  if (plant.gdd_to_maturity <= 0) errors.push('GDD to maturity must be > 0');
  if (plant.days_to_germination <= 0) errors.push('Days to germination must be > 0');
  if (plant.water_interval_days <= 0) errors.push('Water interval must be > 0');
  if (plant.fertilise_interval_days <= 0) errors.push('Fertilise interval must be > 0');
  if (plant.base_temp < -10 || plant.base_temp > 30) errors.push('Base temp out of range (−10 to 30°C)');

  if (errors.length > 0) {
    return { ok: false, error: errors.join('\n') };
  }

  if (SUBMISSION_URL.includes('YOUR_SUBMISSION_ENDPOINT')) {
    return { ok: false, error: 'Submission endpoint not configured yet.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(SUBMISSION_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plant),
    });

    if (!response.ok) {
      return { ok: false, error: `Server error: ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
