import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { getErrorMessage } from '../../api/client';
import { Button } from '../../components/Button';
import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import {
  useCancelReservationMutation,
  useCreateReservationMutation,
  useReservationsQuery,
  useSlotAvailabilityQuery,
} from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import type { DriverTabParamList, RootStackParamList } from '../../navigation/types';
import type { Reservation, SlotAvailabilityItem, VehicleType } from '../../types/api';
import { formatDateTimeVN } from '../../utils/dateTime';
import { formatSlotLabel, formatVehicleType, groupAvailabilityByVehicleType } from '../../utils/dashboard';
import { canCancelReservation, getReservationStatusLabel } from '../../utils/reservationStatus';

const vehicleTypes: VehicleType[] = ['car', 'motorbike'];

type Props = CompositeScreenProps<
  BottomTabScreenProps<DriverTabParamList, 'Reservations'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ReservationsScreen({ navigation }: Props) {
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const availabilityQuery = useSlotAvailabilityQuery();
  const reservationsQuery = useReservationsQuery();
  const createReservation = useCreateReservationMutation();
  const cancelReservation = useCancelReservationMutation();
  const availabilitySummary = useMemo(
    () => summarizeAvailability(availabilityQuery.data ?? []),
    [availabilityQuery.data],
  );
  const sortedReservations = useMemo(
    () => sortReservations(reservationsQuery.data ?? []),
    [reservationsQuery.data],
  );

  useFocusEffect(
    useCallback(() => {
      void reservationsQuery.refetch();
    }, [reservationsQuery.refetch])
  );

  async function handleCreateReservation() {
    try {
      const reservation = await createReservation.mutateAsync(vehicleType);
      if (reservation.id) {
        navigation.navigate('ReservationDetail', { reservationId: reservation.id });
        return;
      }

      Alert.alert(
        'Reservation created',
        'Open your reservation detail to show the Reservation QR at check-in.'
      );
    } catch (error) {
      Alert.alert('Create reservation failed', getErrorMessage(error));
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelReservation.mutateAsync(id);
    } catch (error) {
      Alert.alert('Cancel reservation failed', getErrorMessage(error));
    }
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          refreshing={reservationsQuery.isRefetching && !reservationsQuery.isLoading}
          tintColor={colors.primary}
          onRefresh={() => {
            void reservationsQuery.refetch();
          }}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Driver Reservation</Text>
        <Text style={styles.title}>Make Reservation</Text>
        <Text style={styles.subtitle}>Reserve your parking space before arriving.</Text>
      </View>

      <InfoCard title="Select Vehicle Type" subtitle="PBMS will allocate the slot after you reserve.">
        <View style={styles.vehicleGrid}>
          {vehicleTypes.map((type) => (
            <VehicleOption
              key={type}
              selected={vehicleType === type}
              type={type}
              onPress={() => setVehicleType(type)}
            />
          ))}
        </View>
      </InfoCard>

      <InfoCard title="Available now" subtitle="Summary only. You cannot manually select a slot.">
        <QueryState
          loading={availabilityQuery.isLoading}
          error={availabilityQuery.error}
          empty={!availabilityQuery.data?.length}
          emptyMessage="Availability summary is not available right now."
          loadingMessage="Checking availability..."
          onRetry={() => availabilityQuery.refetch()}
        />
        {availabilityQuery.data?.length ? (
          <View style={styles.availabilityGrid}>
            <AvailabilityItem
              icon="car-outline"
              label="Car"
              value={`${availabilitySummary.car.available} slots available`}
            />
            <AvailabilityItem
              icon="bicycle-outline"
              label="Motorbike"
              value={`${availabilitySummary.motorbike.available} slots available`}
            />
          </View>
        ) : null}
      </InfoCard>

      <View style={styles.smartNote}>
        <View style={styles.smartIcon}>
          <Ionicons name="sparkles-outline" size={22} color="#0b5ed7" />
        </View>
        <View style={styles.smartCopy}>
          <Text style={styles.smartTitle}>Smart slot allocation</Text>
          <Text style={styles.smartText}>
            PBMS will automatically assign the most suitable slot based on availability and vehicle type.
          </Text>
          <Text style={styles.smartText}>You do not need to choose a slot manually.</Text>
        </View>
      </View>

      <InfoCard title="Reservation Summary" subtitle="Review the request before submitting.">
        <View style={styles.summaryRows}>
          <SummaryRow label="Vehicle type" value={formatVehicleType(vehicleType)} />
          <SummaryRow label="Slot assignment" value="Assigned automatically after reservation" />
          <SummaryRow label="QR" value="Available after reservation is created" />
        </View>
        <Button
          disabled={createReservation.isPending}
          loading={createReservation.isPending}
          onPress={handleCreateReservation}
        >
          Reserve Parking Slot
        </Button>
      </InfoCard>

      <InfoCard title="My Reservations" subtitle="Tap a reservation to view staff check-in QR.">
        <QueryState
          loading={reservationsQuery.isLoading}
          error={reservationsQuery.error}
          empty={!reservationsQuery.data?.length}
          emptyMessage="No reservations yet. Create a reservation to receive a QR code for check-in."
          onRetry={() => reservationsQuery.refetch()}
        />

        {sortedReservations.map((reservation) => (
          <ReservationRow
            key={reservation.id}
            canceling={cancelReservation.isPending}
            reservation={reservation}
            onCancel={() => handleCancel(reservation.id)}
            onOpen={() => navigation.navigate('ReservationDetail', { reservationId: reservation.id })}
          />
        ))}
      </InfoCard>
    </Screen>
  );
}

const formatDate = formatDateTimeVN;

function VehicleOption({
  selected,
  type,
  onPress,
}: {
  selected: boolean;
  type: VehicleType;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true } : {}}
      onPress={onPress}
      style={({ pressed }) => [
        styles.vehicleOption,
        selected && styles.vehicleOptionActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.vehicleIcon, selected && styles.vehicleIconActive]}>
        <Ionicons
          name={type === 'car' ? 'car-sport-outline' : 'bicycle-outline'}
          size={26}
          color={selected ? '#ffffff' : '#0b5ed7'}
        />
      </View>
      <Text style={[styles.vehicleLabel, selected && styles.vehicleLabelActive]}>
        {formatVehicleType(type)}
      </Text>
      <Text style={[styles.vehicleHint, selected && styles.vehicleHintActive]}>
        {type === 'car' ? 'Standard car parking' : 'Fast motorbike parking'}
      </Text>
    </Pressable>
  );
}

function AvailabilityItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.availabilityItem}>
      <View style={styles.availabilityIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.availabilityCopy}>
        <Text style={styles.availabilityLabel}>{label}</Text>
        <Text style={styles.availabilityValue}>{value}</Text>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ReservationRow({
  canceling,
  reservation,
  onCancel,
  onOpen,
}: {
  canceling: boolean;
  reservation: Reservation;
  onCancel: () => void;
  onOpen: () => void;
}) {
  const isActive = canCancelReservation(reservation.status);

  return (
    <View style={[styles.row, isActive && styles.rowActive]}>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.rowPressable, pressed && styles.pressed]}
      >
        <View style={styles.rowHeader}>
          <View style={styles.rowIcon}>
            <Ionicons
              name={reservation.vehicleType === 'car' ? 'car-outline' : 'bicycle-outline'}
              size={22}
              color={colors.primary}
            />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{formatVehicleType(reservation.vehicleType)}</Text>
            <Text style={styles.muted}>Expires {formatDate(reservation.expiresAt)}</Text>
          </View>
          <View style={[styles.statusBadge, isActive && styles.statusBadgeActive]}>
            <Text style={[styles.statusText, isActive && styles.statusTextActive]}>
              {getReservationStatusLabel(reservation.status)}
            </Text>
          </View>
        </View>

        <View style={styles.rowMeta}>
          <Text style={styles.metaText}>
            {reservation.reservationCode ? `Code ${reservation.reservationCode}` : 'QR ready in detail'}
          </Text>
          <Text style={styles.metaText}>Slot {formatSlotLabel(reservation.slot)}</Text>
        </View>
      </Pressable>

      {isActive ? (
        <View style={styles.actions}>
          <Button variant="secondary" onPress={onOpen}>
            View QR
          </Button>
          <Button variant="danger" loading={canceling} onPress={onCancel}>
            Cancel
          </Button>
        </View>
      ) : null}
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

function sortReservations(reservations: Reservation[]) {
  return [...reservations].sort((a, b) => {
    const activeDelta = Number(canCancelReservation(b.status)) - Number(canCancelReservation(a.status));
    if (activeDelta !== 0) {
      return activeDelta;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#0b5ed7',
    borderRadius: 26,
    gap: 8,
    padding: 22,
    shadowColor: '#0b5ed7',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
  eyebrow: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  subtitle: {
    color: '#dbeafe',
    fontSize: 15,
    lineHeight: 22,
  },
  vehicleGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  vehicleOption: {
    flex: 1,
    minHeight: 142,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 14,
    gap: 8,
    backgroundColor: '#f8fafc',
  },
  vehicleOptionActive: {
    borderColor: '#0b5ed7',
    backgroundColor: '#eff6ff',
  },
  vehicleIcon: {
    alignItems: 'center',
    backgroundColor: '#eaf2ff',
    borderRadius: 18,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  vehicleIconActive: {
    backgroundColor: '#0b5ed7',
  },
  vehicleLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  vehicleLabelActive: {
    color: '#0b5ed7',
  },
  vehicleHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  vehicleHintActive: {
    color: '#1e40af',
  },
  pressed: {
    opacity: 0.72,
  },
  availabilityGrid: {
    gap: 10,
  },
  availabilityItem: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  availabilityIcon: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 15,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  availabilityCopy: {
    gap: 2,
  },
  availabilityLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  availabilityValue: {
    color: colors.muted,
    fontSize: 13,
  },
  smartNote: {
    alignItems: 'flex-start',
    backgroundColor: '#f8fbff',
    borderColor: '#bfdbfe',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  smartIcon: {
    alignItems: 'center',
    backgroundColor: '#eaf2ff',
    borderRadius: 17,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  smartCopy: {
    flex: 1,
    gap: 4,
  },
  smartTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  smartText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  summaryRows: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  summaryRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 4,
    paddingVertical: 12,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  row: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  rowActive: {
    backgroundColor: '#f8fbff',
    borderColor: '#bfdbfe',
  },
  rowPressable: {
    gap: 12,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  actions: {
    gap: 8,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  muted: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  statusBadge: {
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeActive: {
    backgroundColor: '#dcfce7',
  },
  statusText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  statusTextActive: {
    color: '#15803d',
  },
  rowMeta: {
    gap: 4,
    paddingLeft: 52,
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
  },
});
