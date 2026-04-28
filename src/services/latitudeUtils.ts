// ── Latitude band & hemisphere classification ────────────────────────────────
// Rules from user-supplied spec (April 2026).
// All functions are pure — no side effects.

export type LatitudeBand =
  | 'Tropical'
  | 'Subtropical'
  | 'Warm temperate'
  | 'Cool temperate'
  | 'Subpolar'
  | 'Polar';

export type Hemisphere = 'Northern' | 'Southern' | 'Equatorial';

export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonLabels {
  spring: string;
  summer: string;
  autumn: string;
  winter: string;
}

export interface LocationProfile {
  hemisphere: Hemisphere;
  band: LatitudeBand;
  seasonLabels: SeasonLabels;
  currentSeason: SeasonKey;
}

// ── Band classification ───────────────────────────────────────────────────────

export function classifyBand(lat: number): LatitudeBand {
  const a = Math.abs(lat);
  if (a < 23.5)  return 'Tropical';
  if (a < 35)    return 'Subtropical';
  if (a < 45)    return 'Warm temperate';
  if (a < 55)    return 'Cool temperate';
  if (a < 66.5)  return 'Subpolar';
  return 'Polar';
}

// ── Hemisphere ────────────────────────────────────────────────────────────────

export function getHemisphere(lat: number): Hemisphere {
  if (lat === 0) return 'Equatorial';
  return lat > 0 ? 'Northern' : 'Southern';
}

// ── Season month labels ───────────────────────────────────────────────────────

export function getSeasonLabels(lat: number): SeasonLabels {
  const hemi = getHemisphere(lat);
  if (hemi === 'Northern') {
    return { spring: 'Mar–May', summer: 'Jun–Aug', autumn: 'Sep–Nov', winter: 'Dec–Feb' };
  }
  // Southern & Equatorial: SH calendar
  return { spring: 'Sep–Nov', summer: 'Dec–Feb', autumn: 'Mar–May', winter: 'Jun–Aug' };
}

// ── Current season from today's date ─────────────────────────────────────────

export function getCurrentSeason(lat: number): SeasonKey {
  const month = new Date().getMonth(); // 0 = Jan … 11 = Dec
  // NH season for this month
  const nhSeason: SeasonKey =
    month >= 2 && month <= 4 ? 'spring'
    : month >= 5 && month <= 7 ? 'summer'
    : month >= 8 && month <= 10 ? 'autumn'
    : 'winter';

  const hemi = getHemisphere(lat);
  if (hemi !== 'Southern') return nhSeason;

  // SH: flip by 6 months
  const flip: Record<SeasonKey, SeasonKey> = {
    spring: 'autumn',
    autumn: 'spring',
    summer: 'winter',
    winter: 'summer',
  };
  return flip[nhSeason];
}

// ── Full profile ──────────────────────────────────────────────────────────────

export function getLocationProfile(lat: number): LocationProfile {
  return {
    hemisphere: getHemisphere(lat),
    band: classifyBand(lat),
    seasonLabels: getSeasonLabels(lat),
    currentSeason: getCurrentSeason(lat),
  };
}

// ── Band display metadata (colours match globe overlay) ──────────────────────

export interface BandMeta {
  band: LatitudeBand;
  color: string;        // opaque for legend
  overlayColor: string; // rgba for globe
  description: string;
}

export const BAND_META: BandMeta[] = [
  {
    band: 'Polar',
    color: '#B0BEC5',
    overlayColor: 'rgba(176,190,197,0.35)',
    description: 'Permafrost & ice — extreme growing constraints',
  },
  {
    band: 'Subpolar',
    color: '#90CAF9',
    overlayColor: 'rgba(100,160,220,0.35)',
    description: 'Short cool seasons — hardy crops only',
  },
  {
    band: 'Cool temperate',
    color: '#81C784',
    overlayColor: 'rgba(100,180,100,0.35)',
    description: 'Long seasons, hard frosts — wide crop variety',
  },
  {
    band: 'Warm temperate',
    color: '#AED581',
    overlayColor: 'rgba(150,200,80,0.35)',
    description: 'Mild winters, warm summers — excellent variety',
  },
  {
    band: 'Subtropical',
    color: '#FFD54F',
    overlayColor: 'rgba(255,200,60,0.35)',
    description: 'Hot summers, mild winters — frost rare',
  },
  {
    band: 'Tropical',
    color: '#FF8A65',
    overlayColor: 'rgba(255,120,60,0.35)',
    description: 'Year-round heat — wet/dry seasons',
  },
];

export function getBandMeta(band: LatitudeBand): BandMeta {
  return BAND_META.find((b) => b.band === band) ?? BAND_META[2];
}
