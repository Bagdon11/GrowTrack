/**
 * Background GDD update task.
 * Registered here at module scope so TaskManager can find it on boot.
 * Import this file at the top of App.tsx (side-effect import).
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as DB from '../db/database';
import { fetchWeatherSince } from './weather';
import { accumulateGDD, getProgressPercent } from './gdd';
import {
  sendHarvestReadyNotification,
  sendFrostWarningNotification,
} from './notifications';

export const BACKGROUND_GDD_TASK = 'background-gdd-update';

TaskManager.defineTask(BACKGROUND_GDD_TASK, async () => {
  try {
    DB.initDatabase();

    const latStr = DB.getSetting('latitude');
    const lonStr = DB.getSetting('longitude');
    if (!latStr || !lonStr) return BackgroundTask.BackgroundTaskResult.Success;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) return BackgroundTask.BackgroundTaskResult.Success;

    const cards = DB.getAllActivePlantCards();
    if (cards.length === 0) return BackgroundTask.BackgroundTaskResult.NoData;

    const veges = DB.getAllVegetables();
    const vegeMap = new Map(veges.map((v) => [v.id, v]));

    const earliest = cards.reduce(
      (min, c) => (c.planted_date < min ? c.planted_date : min),
      cards[0].planted_date,
    );

    const weather = await fetchWeatherSince(lat, lon, earliest);

    // Compute local today via UTC offset to avoid the future-watermark bug
    const localNow = new Date(Date.now() + weather.utcOffsetSeconds * 1000);
    const localToday = localNow.toISOString().split('T')[0];
    const pastWeather = weather.data.filter((d) => d.date <= localToday);

    // Check today's forecast for frost (tmin <= 2°C = frost risk)
    const todayWeather = pastWeather.at(-1);
    if (todayWeather && todayWeather.tmin <= 2) {
      const frostSensitive = cards
        .filter((c) => {
          const v = vegeMap.get(c.vege_id);
          return v && v.frost_tolerant === 0;
        })
        .map((c) => vegeMap.get(c.vege_id)!.name);
      await sendFrostWarningNotification(frostSensitive, todayWeather.tmin);
    }

    for (const card of cards) {
      const vege = vegeMap.get(card.vege_id);
      if (!vege) continue;

      const newGDD = accumulateGDD(
        pastWeather,
        vege.base_temp,
        card.planted_date,
        card.last_gdd_update,
      );
      const updated = card.accumulated_gdd + newGDD;
      DB.updatePlantCardGDD(card.id, updated, localToday);

      // Fire harvest-ready notification when crossing 90% threshold
      const prevPct = getProgressPercent(card.accumulated_gdd, vege.gdd_to_maturity);
      const newPct = getProgressPercent(updated, vege.gdd_to_maturity);
      if (prevPct < 90 && newPct >= 90) {
        await sendHarvestReadyNotification(card, vege);
      }
    }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundGDDTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_GDD_TASK);
  if (!isRegistered) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_GDD_TASK, {
      minimumInterval: 60, // 60 minutes
    });
  }
}
