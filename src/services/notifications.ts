import * as Notifications from 'expo-notifications';
import { PlantCard, Vegetable } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Schedule a repeating local notification for watering reminders. */
export async function scheduleWaterNotification(
  card: PlantCard,
  vege: Vegetable,
): Promise<void> {
  const identifier = `water-${card.id}`;
  await Notifications.cancelScheduledNotificationAsync(identifier);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `💧 Time to water your ${vege.name}!`,
      body: card.location
        ? `Check your ${vege.name} in ${card.location}`
        : `Your ${vege.name} needs water`,
      data: { cardId: card.id, type: 'water' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: vege.water_interval_days * 24 * 60 * 60,
      repeats: true,
    },
  });
}

/** Schedule a repeating local notification for fertilising reminders. */
export async function scheduleFertiliseNotification(
  card: PlantCard,
  vege: Vegetable,
): Promise<void> {
  const identifier = `fertilise-${card.id}`;
  await Notifications.cancelScheduledNotificationAsync(identifier);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `🌿 Time to fertilise your ${vege.name}!`,
      body: card.location
        ? `${vege.name} in ${card.location} is ready for nutrients`
        : `Feed your ${vege.name} today`,
      data: { cardId: card.id, type: 'fertilise' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: vege.fertilise_interval_days * 24 * 60 * 60,
      repeats: true,
    },
  });
}

/** Fire an immediate one-time notification that a plant is ready to harvest. */
export async function sendHarvestReadyNotification(
  card: PlantCard,
  vege: Vegetable,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🎉 ${vege.name} is ready to harvest!`,
      body: card.location
        ? `Your ${vege.name} in ${card.location} has reached full maturity`
        : `Your ${vege.name} has reached full maturity`,
      data: { cardId: card.id, type: 'harvest' },
    },
    trigger: null, // immediate
  });
}

export async function cancelNotificationsForCard(cardId: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`water-${cardId}`);
  await Notifications.cancelScheduledNotificationAsync(`fertilise-${cardId}`);
}

/** Fire a frost warning for frost-sensitive plants currently growing. */
export async function sendFrostWarningNotification(
  frostedPlants: string[],
  minTemp: number,
): Promise<void> {
  if (frostedPlants.length === 0) return;
  const list = frostedPlants.slice(0, 3).join(', ');
  const more = frostedPlants.length > 3 ? ` +${frostedPlants.length - 3} more` : '';
  await Notifications.scheduleNotificationAsync({
    identifier: `frost-warning-${new Date().toISOString().split('T')[0]}`,
    content: {
      title: `❄️ Frost warning tonight! (${minTemp.toFixed(1)}°C)`,
      body: `Protect your ${list}${more} — frost forecast for your area`,
      data: { type: 'frost' },
    },
    trigger: null,
  });
}

export async function sendPlantingWindowNotification(
  cropNames: string[],
  seasonLabel: string,
): Promise<void> {
  if (cropNames.length === 0) return;
  const body = cropNames.map((n) => `• ${n}`).join('\n');
  await Notifications.scheduleNotificationAsync({
    identifier: `planting-window-${new Date().toISOString().split('T')[0]}`,
    content: {
      title: `🌱 ${seasonLabel} planting window — ${cropNames.length} crops ready`,
      body,
      data: { type: 'planting-window' },
    },
    trigger: null,
  });
}
