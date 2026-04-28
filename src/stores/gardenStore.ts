import { create } from 'zustand';
import { PlantCardWithVege, Vegetable } from '../types';
import * as DB from '../db/database';
import { fetchWeatherSince } from '../services/weather';
import { accumulateGDD, getProgressPercent } from '../services/gdd';
import {
  scheduleWaterNotification,
  scheduleFertiliseNotification,
  cancelNotificationsForCard,
  sendHarvestReadyNotification,
  sendFrostWarningNotification,
} from '../services/notifications';

// Ensure the database schema exists before any store initialization reads from it.
// This is safe to call multiple times — it's idempotent.
DB.initDatabase();

interface GardenState {
  vegetables: Vegetable[];
  cards: PlantCardWithVege[];
  isLoading: boolean;
  isRefreshing: boolean;
  refreshStatus: string | null; // feedback shown to user after a pull-to-refresh
  latitude: number | null;
  longitude: number | null;
  saveLocation: (lat: number, lon: number) => void;
  loadData: () => void;
  addPlantCard: (
    vegeId: number,
    plantedDate: string,
    location: string,
    notes: string,
  ) => Promise<void>;
  refreshGDD: () => Promise<void>;
  clearRefreshStatus: () => void;
  applyManualGDD: (date: string, tmax: number, tmin: number) => Promise<void>;
  recordWatered: (cardId: number) => void;
  recordFertilised: (cardId: number) => void;
  harvestCard: (cardId: number) => Promise<void>;
  removeCard: (cardId: number) => Promise<void>;
  addVegetable: (v: Omit<import('../types').Vegetable, 'id'>) => void;
}

function buildCardsWithVege(
  rawCards: ReturnType<typeof DB.getAllActivePlantCards>,
  veges: Vegetable[],
): PlantCardWithVege[] {
  const vegeMap = new Map(veges.map((v) => [v.id, v]));
  return rawCards
    .map((c) => {
      const vege = vegeMap.get(c.vege_id);
      if (!vege) return null;
      return { ...c, vege };
    })
    .filter((c): c is PlantCardWithVege => c !== null);
}

export const useGardenStore = create<GardenState>((set, get) => ({
  vegetables: [],
  cards: [],
  isLoading: true,
  isRefreshing: false,
  refreshStatus: null,
  latitude: (() => {
    const s = DB.getSetting('latitude');
    const n = s ? parseFloat(s) : NaN;
    return isNaN(n) ? null : n;
  })(),
  longitude: (() => {
    const s = DB.getSetting('longitude');
    const n = s ? parseFloat(s) : NaN;
    return isNaN(n) ? null : n;
  })(),

  saveLocation(lat, lon) {
    DB.setSetting('latitude', lat.toFixed(6));
    DB.setSetting('longitude', lon.toFixed(6));
    set({ latitude: lat, longitude: lon });
  },

  loadData() {
    const vegetables = DB.getAllVegetables();
    const rawCards = DB.getAllActivePlantCards();
    const cards = buildCardsWithVege(rawCards, vegetables);
    set({ vegetables, cards, isLoading: false });
  },

  async addPlantCard(vegeId, plantedDate, location, notes) {
    const id = DB.insertPlantCard(
      vegeId,
      plantedDate,
      location || null,
      notes || null,
    );
    const rawCard = DB.getAllActivePlantCards().find((c) => c.id === id);
    const vege = DB.getVegetableById(vegeId);
    if (rawCard && vege) {
      await scheduleWaterNotification(rawCard, vege);
      await scheduleFertiliseNotification(rawCard, vege);
    }
    get().loadData();
  },

  async refreshGDD() {
    const latStr = DB.getSetting('latitude');
    const lonStr = DB.getSetting('longitude');
    if (!latStr || !lonStr) {
      set({ refreshStatus: '📍 No location set — add it in Settings' });
      return;
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) {
      set({ refreshStatus: '📍 Invalid location — check Settings' });
      return;
    }

    set({ isRefreshing: true, refreshStatus: null });
    try {
      const { cards } = get();
      if (cards.length === 0) {
        set({ refreshStatus: 'No plants to update' });
        return;
      }

      const earliest = cards.reduce(
        (min, c) => (c.planted_date < min ? c.planted_date : min),
        cards[0].planted_date,
      );

      const { data: weather, utcOffsetSeconds } = await fetchWeatherSince(lat, lon, earliest);

      if (weather.length === 0) {
        set({ refreshStatus: '⚠️ No weather data returned — check your location coordinates' });
        return;
      }

      // Compute local "today" using the UTC offset the API returned for these
      // coordinates.  This avoids the future-watermark bug: without this, using
      // weather.at(-1) (a forecast day) as the watermark causes subsequent
      // refreshes to find d.date > future → 0 GDD forever.
      const localNow = new Date(Date.now() + utcOffsetSeconds * 1000);
      const localToday = localNow.toISOString().split('T')[0];

      // Only accumulate up to and including local today — discard future forecasts
      // from GDD calculation (forecasts are uncertain; we only count observed days).
      const pastWeather = weather.filter((d) => d.date <= localToday);

      // Frost warning check: tmin <= 2°C = frost risk
      const todayWeather = pastWeather.at(-1);
      if (todayWeather && todayWeather.tmin <= 2) {
        const frostSensitive = cards
          .filter((c) => c.vege.frost_tolerant === 0)
          .map((c) => c.vege.name);
        await sendFrostWarningNotification(frostSensitive, todayWeather.tmin);
      }

      let totalNewGDD = 0;
      for (const card of cards) {
        const newGDD = accumulateGDD(
          pastWeather,
          card.vege.base_temp,
          card.planted_date,
          card.last_gdd_update,
        );
        totalNewGDD += newGDD;
        const updated = card.accumulated_gdd + newGDD;
        // Watermark = local today (never a future date)
        DB.updatePlantCardGDD(card.id, updated, localToday);

        const prevPct = getProgressPercent(
          card.accumulated_gdd,
          card.vege.gdd_to_maturity,
        );
        const newPct = getProgressPercent(updated, card.vege.gdd_to_maturity);
        if (prevPct < 90 && newPct >= 90) {
          await sendHarvestReadyNotification(card, card.vege);
        }
      }

      get().loadData();

      set({
        refreshStatus:
          totalNewGDD > 0
            ? `✅ +${totalNewGDD.toFixed(1)} GDD added across ${cards.length} plant${cards.length > 1 ? 's' : ''}`
            : `✅ Weather up to date — 0 new GDD (too cool today, base temp not reached)`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ refreshStatus: `❌ Weather fetch failed: ${msg}` });
    } finally {
      set({ isRefreshing: false });
    }
  },

  clearRefreshStatus() {
    set({ refreshStatus: null });
  },

  async applyManualGDD(date: string, tmax: number, tmin: number) {
    const { cards } = get();
    if (cards.length === 0) {
      set({ refreshStatus: 'No plants to update' });
      return;
    }

    let totalNewGDD = 0;
    for (const card of cards) {
      // Only apply if this date is strictly after the last recorded update
      if (card.last_gdd_update && date <= card.last_gdd_update) continue;

      const newGDD = Math.max(0, (tmax + tmin) / 2 - card.vege.base_temp);
      totalNewGDD += newGDD;
      const updated = card.accumulated_gdd + newGDD;
      DB.updatePlantCardGDD(card.id, updated, date);

      const prevPct = getProgressPercent(card.accumulated_gdd, card.vege.gdd_to_maturity);
      const newPct = getProgressPercent(updated, card.vege.gdd_to_maturity);
      if (prevPct < 90 && newPct >= 90) {
        await sendHarvestReadyNotification(card, card.vege);
      }
    }

    get().loadData();
    set({
      refreshStatus:
        totalNewGDD > 0
          ? `🌡️ Manual entry: +${totalNewGDD.toFixed(1)} GDD added`
          : `🌡️ Manual entry applied — 0 GDD (avg temp didn't exceed base)`,
    });
  },

  recordWatered(cardId) {
    DB.updateWateredAt(cardId, new Date().toISOString());
    get().loadData();
  },

  recordFertilised(cardId) {
    DB.updateFertilisedAt(cardId, new Date().toISOString());
    get().loadData();
  },

  async harvestCard(cardId) {
    // Log harvest before changing status
    const card = get().cards.find((c) => c.id === cardId);
    if (card) {
      DB.logHarvest(cardId, card.vege.name, card.accumulated_gdd);
    }
    DB.setPlantCardStatus(cardId, 'harvested');
    await cancelNotificationsForCard(cardId);
    get().loadData();
  },

  async removeCard(cardId) {
    DB.setPlantCardStatus(cardId, 'removed');
    await cancelNotificationsForCard(cardId);
    get().loadData();
  },

  addVegetable(v) {
    DB.insertVegetable(v);
    get().loadData();
  },
}));
