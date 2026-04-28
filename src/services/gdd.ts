import { DailyWeather, GDDStage } from '../types';

/**
 * Calculate GDD for a single day.
 * Standard method: ((Tmax + Tmin) / 2) - Tbase, floored at 0.
 */
export function dailyGDD(tmax: number, tmin: number, baseTemp: number): number {
  return Math.max(0, (tmax + tmin) / 2 - baseTemp);
}

/**
 * Sum GDD for all days in the weather data that haven't been counted yet.
 * - If lastUpdate is null: accumulates from plantedDate onwards (inclusive).
 * - If lastUpdate is set: accumulates only days strictly after lastUpdate
 *   to prevent double-counting on subsequent refreshes.
 */
export function accumulateGDD(
  weatherData: DailyWeather[],
  baseTemp: number,
  plantedDate: string,
  lastUpdate: string | null,
): number {
  return weatherData
    .filter((d) =>
      lastUpdate ? d.date > lastUpdate : d.date >= plantedDate,
    )
    .reduce((sum, d) => sum + dailyGDD(d.tmax, d.tmin, baseTemp), 0);
}

export function getProgressPercent(accumulated: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, (accumulated / total) * 100);
}

export const GDD_STAGES: GDDStage[] = [
  { name: 'Germinating', emoji: '🌱', minPercent: 0,  maxPercent: 15,  color: '#A5D6A7' },
  { name: 'Seedling',    emoji: '🌿', minPercent: 15, maxPercent: 35,  color: '#4CAF50' },
  { name: 'Growing',     emoji: '🌾', minPercent: 35, maxPercent: 65,  color: '#2E7D32' },
  { name: 'Maturing',    emoji: '🥦', minPercent: 65, maxPercent: 90,  color: '#F9A825' },
  { name: 'Ready!',      emoji: '🎉', minPercent: 90, maxPercent: 101, color: '#E53935' },
];

export function getStageForPercent(percent: number): GDDStage {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    GDD_STAGES.find((s) => clamped < s.maxPercent) ??
    GDD_STAGES[GDD_STAGES.length - 1]
  );
}
