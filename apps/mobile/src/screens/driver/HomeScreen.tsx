import { Ionicons } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
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
import type { SlotAvailabilityItem, VehicleType } from '../../types/api';
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

type QuickActionTarget = keyof Pick<
  DriverTabParamList,
  'Reservations' | 'ActiveSessionTab' | 'History' | 'Profile'
>;

type QuickAction = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: QuickActionTarget;
};

const quickActions: QuickAction[] = [
  {
    title: 'My Reservations',
    description: 'View QR and reservation status.',
    icon: 'calendar-outline',
    route: 'Reservations',
  },
  {
    title: 'Active Session',
    description: 'Check your current parking session.',
    icon: 'car-sport-outline',
    route: 'ActiveSessionTab',
  },
  {
    title: 'Parking History',
    description: 'Review completed parking visits.',
    icon: 'time-outline',
    route: 'History',
  },
  {
    title: 'Profile',
    description: 'Manage your driver account.',
    icon: 'person-circle-outline',
    route: 'Profile',
  },
];

export function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const availabilityQuery = useSlotAvailabilityQuery();
  const reservationsQuery = useReservationsQuery();
  const activeSessionsQuery = useActiveSessionsQuery();
  const activeSession = activeSessionsQuery.data?.[0];
  const activeReservation = reservationsQuery.data?.find((reservation) =>
    canCancelReservation(reservation.status),
  );
  const [durationMs, setDurationMs] = useState(0);

  const availabilitySummary = useMemo(
    () => summarizeAvailability(availabilityQuery.data ?? []),
    [availabilityQuery.data],
  );

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
      <View style={styles.primaryCard}>
        <View style={styles.primaryIcon}>
          <Ionicons name="location-outline" size={26} color="#0b5ed7" />
        </View>
        <View style={styles.primaryText}>
          <Text style={styles.primaryTitle}>Reserve a Parking Slot</Text>
          <Text style={styles.primaryDescription}>
            Book your space before arriving. PBMS will assign the best available slot.
          </Text>
        </View>
        <Button onPress={() => navigation.navigate('Reservations')}>
          Reserve Now
        </Button>
      </View>

      {activeReservation ? (
        <InfoCard title="Active Reservation" subtitle="Show this QR to staff at check-in.">
          <View style={styles.compactDetails}>
            <Detail label="Vehicle" value={formatVehicleType(activeReservation.vehicleType)} />
            <Detail label="Status" value={getReservationStatusLabel(activeReservation.status)} />
            <Detail label="Expires" value={formatDateTime(activeReservation.expiresAt)} />
          </View>
          <Button
            variant="secondary"
            onPress={() => navigation.navigate('ReservationDetail', { reservationId: activeReservation.id })}
          >
            View Reservation
          </Button>
        </InfoCard>
      ) : null}

      {activeSession ? (
        <InfoCard
          title="Active Session"
          subtitle={
            activeSession.status === 'checkout_pending'
              ? 'Checkout is in progress. You can pay now in the app.'
              : 'Your current parking session after staff check-in.'
          }
        >
          <View style={styles.compactDetails}>
            <Detail label="Plate" value={activeSession.licensePlate} />
            <Detail label="Slot" value={formatSlotLabel(activeSession.slot)} />
            <Detail label="Check-in" value={formatDateTime(activeSession.checkInTime)} />
            <Detail label="Duration" value={formatDuration(durationMs)} />
          </View>
          <Button onPress={() => navigation.navigate('ActiveSessionTab')}>
            {activeSession.status === 'checkout_pending' ? 'Thanh toan ngay' : 'View Session'}
          </Button>
        </InfoCard>
      ) : null}

      <InfoCard title="Quick Actions" subtitle="Choose a task to continue.">
        <View style={styles.actionGrid}>
          {quickActions.map((action) => (
            <ActionTile
              key={action.route}
              action={action}
              onPress={() => navigation.navigate(action.route)}
            />
          ))}
        </View>
      </InfoCard>

      <InfoCard title="Parking Availability" subtitle="Summary only. Slot assignment is automatic.">
        <QueryState
          loading={availabilityQuery.isLoading}
          error={availabilityQuery.error}
          empty={!availabilityQuery.data?.length}
          emptyMessage="No availability data available."
          loadingMessage="Loading availability..."
          onRetry={() => availabilityQuery.refetch()}
        />
        {availabilityQuery.data?.length ? (
          <View style={styles.availabilitySummary}>
            <AvailabilityPill vehicleType="car" available={availabilitySummary.car.available} />
            <AvailabilityPill vehicleType="motorbike" available={availabilitySummary.motorbike.available} />
          </View>
        ) : null}
      </InfoCard>
    </Screen>
  );
}

function ActionTile({ action, onPress }: { action: QuickAction; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={action.icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.actionTitle}>{action.title}</Text>
      <Text style={styles.actionDescription}>{action.description}</Text>
    </Pressable>
  );
}

function AvailabilityPill({
  vehicleType,
  available,
}: {
  vehicleType: VehicleType;
  available: number;
}) {
  return (
    <View style={styles.availabilityPill}>
      <View style={styles.availabilityIcon}>
        <Ionicons
          name={vehicleType === 'car' ? 'car-outline' : 'bicycle-outline'}
          size={22}
          color={colors.primary}
        />
      </View>
      <View>
        <Text style={styles.availabilityLabel}>{formatVehicleType(vehicleType)}</Text>
        <Text style={styles.availabilityValue}>{available} available</Text>
      </View>
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

function summarizeAvailability(items: SlotAvailabilityItem[]) {
  const groups = groupAvailabilityByVehicleType(items);

  return {
    car: {
      available: groups.car.reduce((sum, item) => sum + item.available, 0),
    },
    motorbike: {
      available: groups.motorbike.reduce((sum, item) => sum + item.available, 0),
    },
  };
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#0b5ed7',
    borderRadius: 26,
    gap: 16,
    padding: 22,
    shadowColor: '#0b5ed7',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  greeting: {
    color: '#dbeafe',
    fontSize: 14,
    fontWeight: '800',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 6,
  },
  subtitle: {
    color: '#e0f2fe',
    fontSize: 15,
    lineHeight: 22,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  primaryCard: {
    backgroundColor: colors.surface,
    borderColor: '#dbeafe',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  primaryIcon: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  primaryText: {
    gap: 6,
  },
  primaryTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  primaryDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  compactDetails: {
    gap: 10,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionTile: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 7,
    minHeight: 142,
    padding: 14,
    width: '48%',
  },
  pressed: {
    opacity: 0.72,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  actionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  actionDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  availabilitySummary: {
    gap: 10,
  },
  availabilityPill: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  availabilityIcon: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  availabilityLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  availabilityValue: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
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
});
