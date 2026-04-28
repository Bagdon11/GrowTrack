// Side-effect import: registers the background GDD task at module scope
// so TaskManager can find it even when the app is launched by the OS.
import './src/services/backgroundFetch';

import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { MD3LightTheme, PaperProvider, Banner } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { initDatabase } from './src/db/database';
import { useGardenStore } from './src/stores/gardenStore';
import { requestNotificationPermissions } from './src/services/notifications';
import { registerBackgroundGDDTask } from './src/services/backgroundFetch';
import { syncCommunityPlants } from './src/services/communitySync';
import { checkForUpdate } from './src/services/updateCheck';
import type { UpdateInfo } from './src/services/updateCheck';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AppNavigator } from './src/navigation/AppNavigator';
import { Colors, paperTheme } from './src/constants/theme';
import * as DB from './src/db/database';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...paperTheme.colors,
  },
};

export default function App() {
  const loadData = useGardenStore((s) => s.loadData);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    // Database must be the very first thing — everything else depends on it.
    try {
      initDatabase();
    } catch (e) {
      console.error('[GrowTrack] Database init failed:', e);
    }

    loadData();
    requestNotificationPermissions();
    registerBackgroundGDDTask().catch(() => {
      // Background fetch registration may fail in dev — safe to ignore.
    });

    // Community plant sync — runs silently in the background.
    syncCommunityPlants()
      .then((result) => {
        if (result.added > 0 || result.updated > 0) {
          // New plants arrived — reload the vegetable list.
          loadData();
        }
      })
      .catch(() => {
        // Network unavailable — silently ignore.
      });

    // Update check — show a dismissible banner if a newer APK is on GitHub.
    const lastCheckedStr = DB.getSetting('update_checked_at');
    const lastChecked = lastCheckedStr ? parseInt(lastCheckedStr, 10) : null;
    checkForUpdate(lastChecked)
      .then((info) => {
        DB.setSetting('update_checked_at', String(Date.now()));
        if (info.available) setUpdateInfo(info);
      })
      .catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <NavigationContainer>
            <View style={styles.root}>
              {updateInfo?.available && (
                <Banner
                  visible
                  actions={[
                    {
                      label: 'Dismiss',
                      onPress: () => setUpdateInfo(null),
                    },
                    ...(updateInfo.downloadUrl
                      ? [
                          {
                            label: 'Download update',
                            onPress: () => {
                              if (updateInfo.downloadUrl) {
                                Linking.openURL(updateInfo.downloadUrl);
                              }
                            },
                          },
                        ]
                      : []),
                  ]}
                  icon="update"
                >
                  {`GrowTrack ${updateInfo.latestVersion} is available — download the latest APK to get new features and fixes.`}
                </Banner>
              )}
              <AppNavigator />
            </View>
          </NavigationContainer>
          <StatusBar style="light" />
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

