import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import { useActiveSessionsQuery, useReservationsQuery, useSlotAvailabilityQuery } from '../../hooks/useDriverQueries';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import type { DriverTabParamList, RootStackParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<DriverTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const availabilityQuery = useSlotAvailabilityQuery();
  const reservationsQuery = useReservationsQuery();
  const activeSessionsQuery = useActiveSessionsQuery();
  const activeSession = activeSessionsQuery.data?.[0];
  const activeReservation = reservationsQuery.data?.find((reservation) => reservation.status === 'active');

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.greeting}>Hi, {user?.fullName ?? user?.phone ?? 'Driver'}</Text>
        <Text style={styles.title}>Driver Dashboard</Text>
        <Text style={styles.subtitle}>
          Track reservations, active sessions, QR code, and payment state from backend data.
        </Text>
      </View>

      <InfoCard title="Slot Availability" subtitle="Live availability from PBMS backend">
        <QueryState
          loading={availabilityQuery.isLoading}
          error={availabilityQuery.error}
          onRetry={() => availabilityQuery.refetch()}
        />
        <Text style={styles.metric}>{formatAvailability(availabilityQuery.data)}</Text>
        <Button variant="secondary" onPress={() => availabilityQuery.refetch()}>
          Refresh availability
        </Button>
      </InfoCard>

      <InfoCard
        title="Current Summary"
        subtitle={activeSession ? activeSession.licensePlate : 'No active parking session'}
      >
        <Text style={styles.line}>
          Reservation: {activeReservation ? `${activeReservation.vehicleType} · ${activeReservation.status}` : 'None'}
        </Text>
        <Text style={styles.line}>
          Session: {activeSession ? `${activeSession.status} · ${activeSession.slot?.code ?? 'slot assigned'}` : 'None'}
        </Text>
        <Button
          disabled={!activeSession}
          onPress={() => navigation.navigate('ActiveSessionTab')}
        >
          View active session
        </Button>
        <Button
          variant="secondary"
          disabled={!activeSession}
          onPress={() => activeSession && navigation.navigate('QRCode', { sessionId: activeSession.id })}
        >
          Show QR code
        </Button>
      </InfoCard>

      <InfoCard title="Notifications" subtitle="Reservation, payment, and session alerts">
        <Button variant="secondary" onPress={() => navigation.navigate('NotificationCenter')}>
          Open notification center
        </Button>
      </InfoCard>
    </Screen>
  );
}

function formatAvailability(value: unknown) {
  if (!value) {
    return 'No availability data';
  }

  if (typeof value === 'object' && 'available' in value) {
    const data = value as { available?: number; total?: number };
    return `${data.available ?? 0} available${data.total ? ` / ${data.total} total` : ''}`;
  }

  return JSON.stringify(value, null, 2);
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  greeting: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  metric: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  line: {
    color: colors.text,
    fontSize: 15,
  },
});
