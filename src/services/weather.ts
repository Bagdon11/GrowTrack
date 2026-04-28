import { DailyWeather } from '../types';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

export interface WeatherResult {
  data: DailyWeather[];
  /** Seconds east of UTC for the resolved timezone (e.g. +43200 for NZ). */
  utcOffsetSeconds: number;
}

/**
 * Fetch daily max/min temperatures from Open-Meteo (no API key required).
 * Fetches data from plantedDate up to and including today in the local timezone.
 *
 * Returns the raw data PLUS the UTC offset so callers can compute the correct
 * local "today" date for watermarking — avoiding the future-watermark bug that
 * occurs when forecast days extend past local midnight.
 */
export async function fetchWeatherSince(
  latitude: number,
  longitude: number,
  since: string, // YYYY-MM-DD — earliest date we need data from
): Promise<WeatherResult> {
  const now = new Date();
  const startDate = new Date(since);
  // +2 buffer: `new Date(YYYY-MM-DD)` is UTC midnight, so for UTC+ zones the
  // difference is up to 14 hours less than the true local-day span.
  const pastDays = Math.min(
    Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 2,
    92,
  );

  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    past_days: String(pastDays),
    // 2 forecast days ensures "today" is always covered in any UTC+ timezone.
    // We cap the watermark to local-today using utc_offset_seconds so future
    // forecast dates never get saved as the last-update marker.
    forecast_days: '2',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}?${params.toString()}`, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response!.ok) {
    throw new Error(`Weather API error: ${response!.status}`);
  }

  const json = (await response.json()) as {
    utc_offset_seconds: number;
    daily: {
      time: string[];
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
    };
  };

  const data = json.daily.time
    .map((date, i) => ({
      date,
      tmax: json.daily.temperature_2m_max[i],
      tmin: json.daily.temperature_2m_min[i],
    }))
    .filter((d): d is DailyWeather => d.tmax !== null && d.tmin !== null);

  return { data, utcOffsetSeconds: json.utc_offset_seconds ?? 0 };
}
