import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { GardenScreen } from '../screens/GardenScreen';
import { AddPlantScreen } from '../screens/AddPlantScreen';
import { GlobeScreen } from '../screens/GlobeScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PlantDetailScreen } from '../screens/PlantDetailScreen';
import { GardenSpaceScreen } from '../screens/GardenSpaceScreen';
import { Colors } from '../constants/theme';
import type { RootTabParamList, RootStackParamList } from '../types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_SCREEN_OPTIONS = {
  tabBarActiveTintColor: Colors.primary,
  tabBarInactiveTintColor: '#888',
  tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border },
  headerStyle: { backgroundColor: Colors.primary },
  headerTintColor: Colors.onPrimary,
  headerTitleStyle: { fontWeight: '700' as const },
};

function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={TAB_SCREEN_OPTIONS}>
      <Tab.Screen
        name="Garden"
        component={GardenScreen}
        options={{
          title: 'My Garden',
          tabBarLabel: 'Garden',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="sprout" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Add"
        component={AddPlantScreen}
        options={{
          title: 'Add Plant',
          tabBarLabel: 'Add Plant',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="plus-circle-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Space"
        component={GardenSpaceScreen}
        options={{
          title: 'Garden Space',
          tabBarLabel: 'Space',
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: Colors.onPrimary,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="image-multiple-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Globe"
        component={GlobeScreen}
        options={{
          title: 'My Location',
          tabBarLabel: 'Globe',
          headerStyle: { backgroundColor: '#0a0a1a' },
          headerTintColor: Colors.onPrimary,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="earth" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="PlantDetail"
        component={PlantDetailScreen}
        options={{
          title: 'Plant Details',
          headerStyle: { backgroundColor: Colors.primary },
          headerTintColor: Colors.onPrimary,
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
    </Stack.Navigator>
  );
}
