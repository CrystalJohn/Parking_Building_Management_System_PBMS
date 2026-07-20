import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActiveSessionScreen } from '../screens/driver/ActiveSessionScreen';
import { HistoryScreen } from '../screens/driver/HistoryScreen';
import { HomeScreen } from '../screens/driver/HomeScreen';
import { ProfileScreen } from '../screens/driver/ProfileScreen';
import { ReservationsScreen } from '../screens/driver/ReservationsScreen';
import { colors } from '../theme/colors';
import type { DriverTabParamList } from './types';

const Tab = createBottomTabNavigator<DriverTabParamList>();

const tabIcons: Record<
  keyof DriverTabParamList,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Reservations: { active: 'calendar', inactive: 'calendar-outline' },
  ActiveSessionTab: { active: 'car', inactive: 'car-outline' },
  History: { active: 'time', inactive: 'time-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

const navActiveColor = '#0b5ed7';
const navInactiveColor = '#6b7280';

export function DriverTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: navActiveColor,
        tabBarInactiveTintColor: navInactiveColor,
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ color, focused }) => {
          const icon = tabIcons[route.name];

          return (
            <View style={[styles.iconShell, focused && styles.iconShellActive]}>
              <Ionicons
                name={focused ? icon.active : icon.inactive}
                size={focused ? 21 : 20}
                color={color}
              />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen
        name="Reservations"
        component={ReservationsScreen}
        options={{ title: 'Reservation', tabBarLabel: 'Reservation' }}
      />
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

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { bottom: Math.max(insets.bottom, 12) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const options = descriptors[route.key].options;
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;
        const icon = tabIcons[route.name as keyof DriverTabParamList];
        const color = focused ? navActiveColor : navInactiveColor;

        function handlePress() {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.dispatch({
              ...CommonActions.navigate(route.name, route.params),
              target: state.key,
            });
          }
        }

        function handleLongPress() {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarButtonTestID}
            onLongPress={handleLongPress}
            onPress={handlePress}
            style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}
          >
            <View style={[styles.iconShell, focused && styles.iconShellActive]}>
              <Ionicons
                name={focused ? icon.active : icon.inactive}
                size={focused ? 21 : 20}
                color={color}
              />
            </View>
            <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 72,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#e5edf7',
    flexDirection: 'row',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 14,
  },
  tabButton: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    gap: 3,
  },
  tabButtonPressed: {
    opacity: 0.7,
  },
  tabItem: {},
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  iconShell: {
    width: 34,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  iconShellActive: {
    backgroundColor: '#eaf2ff',
  },
});
