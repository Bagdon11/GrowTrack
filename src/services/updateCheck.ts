/**
 * updateCheck — compares the running app version against the version published
 * on your Railway server (/api/growtrack/version).
 *
 * To publish a new version: set GROWTRACK_VERSION and GROWTRACK_APK_URL
 * environment variables on Railway, then redeploy.
 */

// Railway endpoint — already configured for your server.
const VERSION_URL = 'https://web-production-45650.up.railway.app/api/growtrack/version';

/** The version currently running — keep in sync with app.json "version". */
export const CURRENT_VERSION = '1.0.0';

/** Minimum milliseconds between update checks (6 hours). */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface UpdateInfo {
  available: boolean;
  latestVersion: string;
  /** Direct APK download URL set via GROWTRACK_APK_URL on Railway. */
  downloadUrl: string | null;
  releaseNotes: null; // Railway endpoint doesn't include notes; reserved for future use
}

/**
 * Check your Railway server for a newer APK version.
 * Returns `available: false` on any network or parse error so the app
 * degrades gracefully when offline.
 *
 * Pass `force = true` to bypass the 6-hour throttle.
 */
export async function checkForUpdate(
  lastCheckedAt: number | null,
  force = false,
): Promise<UpdateInfo> {
  const noUpdate: UpdateInfo = {
    available: false,
    latestVersion: CURRENT_VERSION,
    downloadUrl: null,
    releaseNotes: null,
  };

  if (!force && lastCheckedAt !== null) {
    if (Date.now() - lastCheckedAt < CHECK_INTERVAL_MS) {
      return noUpdate;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(VERSION_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return noUpdate;

    const data = (await response.json()) as {
      version: string;
      apk_url: string | null;
    };

    if (!data?.version) return noUpdate;

    const available = isNewerVersion(data.version, CURRENT_VERSION);
    return {
      available,
      latestVersion: data.version,
      downloadUrl: data.apk_url ?? null,
      releaseNotes: null,
    };
  } catch {
    return noUpdate;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Simple semver comparison: returns true if `latest` is newer than `current`.
 * Handles "1.0.0" vs "1.0.1" style strings.
 */
function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}
