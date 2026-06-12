import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { AvailabilityCard } from '../../components/dashboard/AvailabilityCard';
import { QuickActionCard } from '../../components/dashboard/QuickActionCard';
import { SummaryCard } from '../../components/dashboard/SummaryCard';
import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import {
  useActiveSessionsQuery,
  useReservationsQuery,
  useSlotAvailabilityQuery,
} from '../../hooks/useDriverQueries';
import type { DriverTabParamList, RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import type { SlotAvailabilityItem } from '../../types/api';
import {
  formatDateTime,
  formatSlotLabel,
  formatVehicleType,
  groupAvailabilityByVehicleType,
} from '../../utils/dashboard';
import { canCancelReservation, getReservationStatusLabel } from '../../utils/reservationStatus';
import { formatDuration, getSessionDurationMs } from '../../utils/session';

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
  const activeReservation = reservationsQuery.data?.find((reservation) =>
    canCancelReservation(reservation.status)
  );
  const availability = availabilityQuery.data ?? [];
  const availabilityGroups = groupAvailabilityByVehicleType(availability);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => {
    if (!activeSession) {
      setDurationMs(0);
      return;
    }

    setDurationMs(getSessionDurationMs(activeSession));
    const timer = setInterval(() => {
      setDurationMs(getSessionDurationMs(activeSession));
    }, 30_000);

    return () => clearInterval(timer);
  }, [activeSession]);

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.greeting}>Hi, {user?.fullName ?? user?.phone ?? 'Driver'}</Text>
        <Text style={styles.title}>Driver Dashboard</Text>
        <Text style={styles.subtitle}>Here is your parking status today.</Text>
      </View>

      <InfoCard title="Slot Availability" subtitle="Live availability from PBMS backend">
        <QueryState
          loading={availabilityQuery.isLoading}
          error={availabilityQuery.error}
          empty={!availability.length}
          emptyMessage="No availability data available."
          loadingMessage="Loading slot availability..."
          onRetry={() => availabilityQuery.refetch()}
        />
        {availability.length ? (
          <View style={styles.availabilityGroups}>
            <AvailabilityGroup title="Car slots" items={availabilityGroups.car} />
            <AvailabilityGroup title="Motorbike slots" items={availabilityGroups.motorbike} />
          </View>
        ) : null}
      </InfoCard>

      <InfoCard title="Current Reservation" subtitle="Your active booking before arrival">
        <QueryState
          loading={reservationsQuery.isLoading}
          error={reservationsQuery.error}
          onRetry={() => reservationsQuery.refetch()}
        />
        {activeReservation ? (
          <SummaryCard
            title="Active reservation"
            subtitle={`Status: ${getReservationStatusLabel(activeReservation.status)}`}
            tone="success"
          >
            <Detail label="Vehicle type" value={formatVehicleType(activeReservation.vehicleType)} />
            <Detail label="Assigned slot" value={formatSlotLabel(activeReservation.slot)} />
            <Detail label="Expires at" value={formatDateTime(activeReservation.expiresAt)} />
            <Button
              variant="secondary"
              onPress={() => navigation.navigate('ReservationDetail', { reservationId: activeReservation.id })}
            >
              Show Reservation QR
            </Button>
          </SummaryCard>
        ) : !reservationsQuery.isLoading && !reservationsQuery.error ? (
          <SummaryCard
            title="No active reservation"
            subtitle="Reserve a slot before arriving at the parking building."
            tone="empty"
          />
        ) : null}
      </InfoCard>

      <InfoCard title="Active Session" subtitle="Current parking session after staff check-in">
        <QueryState
          loading={activeSessionsQuery.isLoading}
          error={activeSessionsQuery.error}
          onRetry={() => activeSessionsQuery.refetch()}
        />
        {activeSession ? (
          <SummaryCard title={activeSession.licensePlate} subtitle={`Status: ${activeSession.status}`} tone="warning">
            <Detail label="Assigned slot" value={formatSlotLabel(activeSession.slot)} />
            <Detail label="Check-in time" value={formatDateTime(activeSession.checkInTime)} />
            <Detail label="Duration" value={formatDuration(durationMs)} />
            <View style={styles.buttonGroup}>
              <Button onPress={() => navigation.navigate('ActiveSessionTab')}>
                View session
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation.navigate('QRCode', { sessionId: activeSession.id })}
              >
                Show checkout QR
              </Button>
            </View>
          </SummaryCard>
        ) : !activeSessionsQuery.isLoading && !activeSessionsQuery.error ? (
          <SummaryCard title="No active parking session" tone="empty" />
        ) : null}
      </InfoCard>

      <InfoCard title="Quick Actions" subtitle="Common driver tasks">
        <View style={styles.quickActions}>
          <QuickActionCard
            label="Reserve a slot"
            description="Create a reservation for car or motorbike."
            onPress={() => navigation.navigate('Reservations')}
          />
          <QuickActionCard
            label="View active session"
            description="Check current slot, duration, QR, and checkout status."
            onPress={() => navigation.navigate('ActiveSessionTab')}
          />
          <QuickActionCard
            label="Parking history"
            description="Review completed parking sessions."
            onPress={() => navigation.navigate('History')}
          />
          <QuickActionCard
            label="Notifications"
            description="Open local demo notification center."
            onPress={() => navigation.navigate('NotificationCenter')}
          />
        </View>
      </InfoCard>
    </Screen>
  );
}

function AvailabilityGroup({ title, items }: { title: string; items: SlotAvailabilityItem[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <View style={styles.availabilityGroup}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {items.map((item) => (
        <AvailabilityCard
          key={`${item.floorId}-${item.zone}-${item.vehicleType}`}
          item={item}
        />
      ))}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 18,
    gap: 8,
    padding: 20,
  },
  greeting: {
    color: '#ccfbf1',
    fontSize: 14,
    fontWeight: '800',
  },
  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: '#d1fae5',
    fontSize: 15,
    lineHeight: 22,
  },
  availabilityGroups: {
    gap: 16,
  },
  availabilityGroup: {
    gap: 10,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  buttonGroup: {
    gap: 10,
  },
  quickActions: {
    gap: 10,
  },
});
