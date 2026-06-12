import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { ActiveSessionScreen } from '../screens/driver/ActiveSessionScreen';
import { HistoryScreen } from '../screens/driver/HistoryScreen';
import { HomeScreen } from '../screens/driver/HomeScreen';
import { ProfileScreen } from '../screens/driver/ProfileScreen';
import { ReservationsScreen } from '../screens/driver/ReservationsScreen';
import { colors } from '../theme/colors';
import type { DriverTabParamList } from './types';

const Tab = createBottomTabNavigator<DriverTabParamList>();

const tabIcons: Record<keyof DriverTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Reservations: 'calendar-outline',
  ActiveSessionTab: 'car-outline',
  History: 'time-outline',
  Profile: 'person-outline',
};

export function DriverTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={tabIcons[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Reservations" component={ReservationsScreen} />
      <Tab.Screen
        name="ActiveSessionTab"
        component={ActiveSessionScreen}
        options={{ title: 'Active Session', tabBarLabel: 'Session' }}
      />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
