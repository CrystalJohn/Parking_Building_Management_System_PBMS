import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { NotificationCenterScreen } from '../screens/driver/NotificationCenterScreen';
import { PaymentStatusScreen } from '../screens/driver/PaymentStatusScreen';
import { QRCodeScreen } from '../screens/driver/QRCodeScreen';
import { ReservationDetailScreen } from '../screens/driver/ReservationDetailScreen';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';
import { AuthNavigator } from './AuthNavigator';
import { DriverTabs } from './DriverTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Always declare all root screens and select the initial route declaratively.
 * This avoids imperative auth redirects during navigator initialization.
 */
export function RootNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <Stack.Navigator
      initialRouteName={isAuthenticated ? 'DriverTabs' : 'Auth'}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Auth"
        component={AuthNavigator}
        options={{ headerShown: false }}
      />
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
        name="QRCode"
        component={QRCodeScreen}
        options={{ title: 'QR Code' }}
      />
      <Stack.Screen
        name="PaymentStatus"
        component={PaymentStatusScreen}
        options={{ title: 'Payment Status' }}
      />
      <Stack.Screen
        name="NotificationCenter"
        component={NotificationCenterScreen}
        options={{ title: 'Notifications' }}
      />
    </Stack.Navigator>
  );
}
