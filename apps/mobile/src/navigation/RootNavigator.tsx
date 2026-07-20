import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { NotificationCenterScreen } from '../screens/driver/NotificationCenterScreen';
import { ReservationDetailScreen } from '../screens/driver/ReservationDetailScreen';
import { RegisterVehicleScreen } from '../screens/driver/RegisterVehicleScreen';
import { WelcomeScreen } from '../screens/driver/WelcomeScreen';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';
import { AuthNavigator } from './AuthNavigator';
import { DriverTabs } from './DriverTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasSeenWelcome = useAuthStore((state) => state.hasSeenWelcome);
  const isWelcomeReady = useAuthStore((state) => state.isWelcomeReady);

  if (isAuthenticated && !isWelcomeReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {isAuthenticated && !hasSeenWelcome ? (
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
      ) : isAuthenticated ? (
        <>
          <Stack.Screen
            name="DriverTabs"
            component={DriverTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ReservationDetail"
            component={ReservationDetailScreen}
            options={{ title: 'Reservation Detail' }}
          />
          <Stack.Screen
            name="NotificationCenter"
            component={NotificationCenterScreen}
            options={{ title: 'Notifications' }}
          />
          <Stack.Screen
            name="RegisterVehicle"
            component={RegisterVehicleScreen}
            options={{ title: 'Register Vehicle' }}
          />
        </>
      ) : (
        <Stack.Screen
          name="Auth"
          component={AuthNavigator}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
