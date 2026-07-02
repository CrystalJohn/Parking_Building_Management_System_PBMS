import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getErrorMessage } from '../../api/client';
import { Button } from '../../components/Button';
import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import {
  useCancelReservationMutation,
  useCreateReservationMutation,
  useMyVehiclesQuery,
  useReservationAvailabilityQuery,
  useReservationsQuery,
} from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import type { DriverTabParamList, RootStackParamList } from '../../navigation/types';
import type { DriverVehicle, Reservation, VehicleType } from '../../types/api';
import { formatDateTimeVN } from '../../utils/dateTime';
import { formatSlotLabel, formatVehicleType } from '../../utils/dashboard';
import { canCancelReservation, getReservationStatusLabel } from '../../utils/reservationStatus';

const arrivalTimes = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

type Props = CompositeScreenProps<
  BottomTabScreenProps<DriverTabParamList, 'Reservations'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ReservationsScreen({ navigation }: Props) {
  const initialBooking = useMemo(() => getInitialBooking(), []);
  const vehiclesQuery = useMyVehiclesQuery();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedDateKey, setSelectedDateKey] = useState(initialBooking.dateKey);
  const [selectedTime, setSelectedTime] = useState(initialBooking.time);
  const [showReservationHistory, setShowReservationHistory] = useState(false);
  const reservationsQuery = useReservationsQuery();
  const createReservation = useCreateReservationMutation();
  const cancelReservation = useCancelReservationMutation();
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const selectedDate = dateOptions.find((option) => option.key === selectedDateKey) ?? dateOptions[0];
  const vehicles = vehiclesQuery.data ?? [];
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? vehicles[0] ?? null;
  const plannedArrivalAt = useMemo(
    () => combineDateAndTime(selectedDate.date, selectedTime),
    [selectedDate.date, selectedTime],
  );
  const plannedArrivalIso = plannedArrivalAt.toISOString();
  const availabilityQuery = useReservationAvailabilityQuery(
    selectedVehicle?.vehicleType ?? 'car',
    plannedArrivalIso,
  );
  const availability = availabilityQuery.data;
  const isReservationUnavailable =
    !selectedVehicle ||
    availabilityQuery.isLoading ||
    availabilityQuery.isFetching ||
    !availability?.isAvailable ||
    availability.availableCount <= 0;
  const sortedReservations = useMemo(
    () => sortReservations(reservationsQuery.data ?? []),
    [reservationsQuery.data],
  );
  const activeReservations = useMemo(
    () => sortedReservations.filter((reservation) => canCancelReservation(reservation.status)).slice(0, 2),
    [sortedReservations],
  );
  const historicalReservations = useMemo(() => {
    const visibleActiveIds = new Set(activeReservations.map((reservation) => reservation.id));
    return sortedReservations.filter((reservation) => !visibleActiveIds.has(reservation.id));
  }, [activeReservations, sortedReservations]);
  const hasReservationHistory = sortedReservations.length > 0;

  useFocusEffect(
    useCallback(() => {
      void vehiclesQuery.refetch();
      void reservationsQuery.refetch();
    }, [reservationsQuery.refetch, vehiclesQuery.refetch])
  );

  useEffect(() => {
    if (!selectedVehicleId && vehicles[0]?.id) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [selectedVehicleId, vehicles]);

  async function handleCreateReservation() {
    if (plannedArrivalAt.getTime() <= Date.now()) {
      Alert.alert('Invalid arrival time', 'Please choose a future arrival time.');
      return;
    }

    if (!selectedVehicle) {
      Alert.alert(
        'Linked vehicle required',
        'Please link a vehicle to your account before creating a reservation.',
      );
      return;
    }

    if (!availability?.isAvailable || availability.availableCount <= 0) {
      Alert.alert(
        'No slots available',
        'No slots available for this time. Please choose another time.',
      );
      return;
    }

    try {
      const reservation = await createReservation.mutateAsync({
        vehicleId: selectedVehicle.id,
        plannedArrivalAt: plannedArrivalIso,
      });
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

  function handleSelectDate(option: DateOption) {
    setSelectedDateKey(option.key);
    setSelectedTime(getFirstAvailableTime(option.date) ?? arrivalTimes[0]);
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
        <Text style={styles.subtitle}>Reserve your parking space with a linked vehicle before arriving.</Text>
      </View>

      <InfoCard title="Select Linked Vehicle" subtitle="Reservation check-in QR is issued for the vehicle linked to your account.">
        <QueryState
          loading={vehiclesQuery.isLoading}
          error={vehiclesQuery.error}
          empty={!vehicles.length}
          emptyMessage="No linked vehicles found. Link a vehicle before reserving a slot."
          loadingMessage="Loading linked vehicles..."
          onRetry={() => vehiclesQuery.refetch()}
        />
        {vehicles.length > 0 ? (
          <View style={styles.vehicleGrid}>
            {vehicles.map((vehicle) => (
              <VehicleOption
                key={vehicle.id}
                selected={selectedVehicle?.id === vehicle.id}
                vehicle={vehicle}
                onPress={() => setSelectedVehicleId(vehicle.id)}
              />
            ))}
          </View>
        ) : null}
      </InfoCard>

      <InfoCard title="Select Arrival Date" subtitle="Choose a planned arrival day within the next 7 days.">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateScroller}
        >
          {dateOptions.map((option) => (
            <DateChip
              key={option.key}
              option={option}
              selected={option.key === selectedDateKey}
              onPress={() => handleSelectDate(option)}
            />
          ))}
        </ScrollView>
      </InfoCard>

      <InfoCard title="Select Arrival Time" subtitle="Pick the time you expect to arrive.">
        <View style={styles.timeGrid}>
          {arrivalTimes.map((time) => {
            const disabled = isTimeDisabled(selectedDate.date, time);

            return (
              <TimeChip
                key={time}
                disabled={disabled}
                selected={time === selectedTime}
                time={time}
                onPress={() => setSelectedTime(time)}
              />
            );
          })}
        </View>
      </InfoCard>

      <InfoCard
        title={`Available at ${selectedTime}`}
        subtitle={`${formatVehicleType(selectedVehicle?.vehicleType ?? 'car')} availability for your selected arrival time.`}
      >
        <QueryState
          loading={availabilityQuery.isLoading || availabilityQuery.isFetching}
          error={availabilityQuery.error}
          empty={!availability && !availabilityQuery.isLoading && !availabilityQuery.error}
          emptyMessage="Availability for this time is not available right now."
          loadingMessage="Checking availability..."
          onRetry={() => availabilityQuery.refetch()}
        />
        {availability ? (
          <View style={styles.availabilityGrid}>
            <AvailabilityItem
              icon={(selectedVehicle?.vehicleType ?? 'car') === 'car' ? 'car-outline' : 'bicycle-outline'}
              label={formatVehicleType(selectedVehicle?.vehicleType ?? 'car')}
              value={`${availability.availableCount} slots available`}
            />
            <View style={styles.availabilityMeta}>
              <Text style={styles.availabilityMetaText}>
                Reserved: {availability.reservedCount}
              </Text>
              <Text style={styles.availabilityMetaText}>
                Occupied: {availability.occupiedCount}
              </Text>
            </View>
            {!availability.isAvailable ? (
              <View style={styles.unavailableNotice}>
                <Ionicons name="alert-circle-outline" size={20} color="#b45309" />
                <Text style={styles.unavailableText}>
                  No slots available for this time. Please choose another time.
                </Text>
              </View>
            ) : null}
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
            PBMS will automatically assign the most suitable slot based on your linked vehicle and availability.
          </Text>
          <Text style={styles.smartText}>You do not need to choose a slot manually.</Text>
        </View>
      </View>

      <InfoCard title="Reservation Summary" subtitle="Review the request before submitting.">
        <View style={styles.summaryRows}>
          <SummaryRow label="Vehicle plate" value={selectedVehicle?.plateNumber ?? 'Link vehicle required'} />
          <SummaryRow label="Vehicle type" value={formatVehicleType(selectedVehicle?.vehicleType ?? 'car')} />
          <SummaryRow
            label="Planned arrival"
            value={formatDateTimeVN(plannedArrivalAt)}
          />
          <SummaryRow label="Slot assignment" value="Assigned automatically after reservation" />
          <SummaryRow label="QR" value="Available after reservation is created" />
        </View>
        <Button
          disabled={createReservation.isPending || isReservationUnavailable}
          loading={createReservation.isPending}
          onPress={handleCreateReservation}
        >
          Reserve Parking Slot
        </Button>
      </InfoCard>

      <InfoCard title="My Reservations" subtitle="Your latest active reservations for staff check-in.">
        <QueryState
          loading={reservationsQuery.isLoading}
          error={reservationsQuery.error}
          empty={!reservationsQuery.data?.length}
          emptyMessage="No reservations yet. Create a reservation to receive a QR code for check-in."
          onRetry={() => reservationsQuery.refetch()}
        />

        {!reservationsQuery.isLoading && !reservationsQuery.error && hasReservationHistory && activeReservations.length === 0 ? (
          <View style={styles.inlineEmptyState}>
            <Text style={styles.inlineEmptyTitle}>No active reservations</Text>
            <Text style={styles.inlineEmptyText}>
              Cancelled, expired, and fulfilled reservations are available in your reservation history.
            </Text>
          </View>
        ) : null}

        {activeReservations.map((reservation) => (
          <ReservationRow
            key={reservation.id}
            canceling={cancelReservation.isPending}
            reservation={reservation}
            onCancel={() => handleCancel(reservation.id)}
            onOpen={() => navigation.navigate('ReservationDetail', { reservationId: reservation.id })}
          />
        ))}

        {hasReservationHistory ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowReservationHistory((value) => !value)}
            style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
          >
            <Ionicons
              name={showReservationHistory ? 'chevron-up-outline' : 'time-outline'}
              size={16}
              color="#0b5ed7"
            />
            <Text style={styles.historyButtonText}>
              {showReservationHistory
                ? 'Ẩn lịch sử đã đặt'
                : 'Xem lại toàn bộ lịch sử đã đặt'}
            </Text>
          </Pressable>
        ) : null}

        {showReservationHistory ? (
          <View style={styles.historyList}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Reservation history</Text>
            <Text style={styles.historyCount}>{historicalReservations.length} items</Text>
          </View>
            {historicalReservations.length > 0 ? (
              historicalReservations.map((reservation) => (
              <ReservationRow
                key={`history-${reservation.id}`}
                canceling={cancelReservation.isPending}
                reservation={reservation}
                onCancel={() => handleCancel(reservation.id)}
                onOpen={() => navigation.navigate('ReservationDetail', { reservationId: reservation.id })}
              />
              ))
            ) : (
              <View style={styles.inlineEmptyState}>
                <Text style={styles.inlineEmptyTitle}>No older reservations</Text>
                <Text style={styles.inlineEmptyText}>
                  Your active reservation is already shown above.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </InfoCard>
    </Screen>
  );
}

const formatDate = formatDateTimeVN;

type DateOption = {
  key: string;
  date: Date;
  label: string;
  day: string;
};

function DateChip({
  option,
  selected,
  onPress,
}: {
  option: DateOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true } : {}}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dateChip,
        selected && styles.dateChipActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.dateChipLabel, selected && styles.dateChipLabelActive]}>
        {option.label}
      </Text>
      <Text style={[styles.dateChipDay, selected && styles.dateChipDayActive]}>
        {option.day}
      </Text>
    </Pressable>
  );
}

function TimeChip({
  disabled,
  selected,
  time,
  onPress,
}: {
  disabled: boolean;
  selected: boolean;
  time: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true, disabled } : { disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.timeChip,
        selected && styles.timeChipActive,
        disabled && styles.timeChipDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.timeChipText,
          selected && styles.timeChipTextActive,
          disabled && styles.timeChipTextDisabled,
        ]}
      >
        {time}
      </Text>
    </Pressable>
  );
}

function VehicleOption({
  selected,
  vehicle,
  onPress,
}: {
  selected: boolean;
  vehicle: DriverVehicle;
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
          name={vehicle.vehicleType === 'car' ? 'car-sport-outline' : 'bicycle-outline'}
          size={26}
          color={selected ? '#ffffff' : '#0b5ed7'}
        />
      </View>
      <Text style={[styles.vehicleLabel, selected && styles.vehicleLabelActive]}>
        {vehicle.plateNumber}
      </Text>
      <Text style={[styles.vehicleHint, selected && styles.vehicleHintActive]}>
        {formatVehicleType(vehicle.vehicleType)}
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
            <Text style={styles.rowTitle}>{reservation.licensePlate ?? reservation.vehicle?.plateNumber ?? formatVehicleType(reservation.vehicleType)}</Text>
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
            {formatVehicleType(reservation.vehicleType)}
          </Text>
          {reservation.plannedArrivalAt ? (
            <Text style={styles.metaText}>
              Arrival {formatDate(reservation.plannedArrivalAt)}
            </Text>
          ) : null}
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

function sortReservations(reservations: Reservation[]) {
  return [...reservations].sort((a, b) => {
    const activeDelta = Number(canCancelReservation(b.status)) - Number(canCancelReservation(a.status));
    if (activeDelta !== 0) {
      return activeDelta;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function buildDateOptions(): DateOption[] {
  const today = startOfDay(new Date());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    return {
      key: toDateKey(date),
      date,
      label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatWeekday(date),
      day: new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: 'short',
      }).format(date),
    };
  });
}

function getInitialBooking() {
  const dateOptions = buildDateOptions();

  for (const option of dateOptions) {
    const time = getFirstAvailableTime(option.date);
    if (time) {
      return { dateKey: option.key, time };
    }
  }

  return { dateKey: dateOptions[0].key, time: arrivalTimes[0] };
}

function getFirstAvailableTime(date: Date) {
  return arrivalTimes.find((time) => !isTimeDisabled(date, time));
}

function isTimeDisabled(date: Date, time: string) {
  return combineDateAndTime(date, time).getTime() <= Date.now();
}

function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const planned = new Date(date);
  planned.setHours(hours, minutes, 0, 0);
  return planned;
}

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
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
  dateScroller: {
    gap: 10,
    paddingRight: 4,
  },
  dateChip: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 72,
    minWidth: 104,
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#0b5ed7',
  },
  dateChipLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  dateChipLabelActive: {
    color: '#0b5ed7',
  },
  dateChipDay: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  dateChipDayActive: {
    color: '#1e40af',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeChip: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 74,
    paddingHorizontal: 14,
  },
  timeChipActive: {
    backgroundColor: '#0b5ed7',
    borderColor: '#0b5ed7',
  },
  timeChipDisabled: {
    backgroundColor: '#f1f5f9',
    opacity: 0.45,
  },
  timeChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  timeChipTextActive: {
    color: '#ffffff',
  },
  timeChipTextDisabled: {
    color: colors.muted,
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
  availabilityMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  availabilityMetaText: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  unavailableNotice: {
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  unavailableText: {
    color: '#92400e',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
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
  inlineEmptyState: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  inlineEmptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  inlineEmptyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  historyButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  historyButtonText: {
    color: '#0b5ed7',
    fontSize: 12,
    fontWeight: '900',
  },
  historyList: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    marginTop: 2,
    paddingTop: 12,
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  historyCount: {
    color: colors.muted,
    fontSize: 12,
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
