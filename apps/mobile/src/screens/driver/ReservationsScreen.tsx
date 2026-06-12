import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
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
} from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import type { DriverTabParamList, RootStackParamList } from '../../navigation/types';
import type { VehicleType } from '../../types/api';
import { formatDateTimeVN } from '../../utils/dateTime';
import { canCancelReservation, getReservationStatusLabel } from '../../utils/reservationStatus';

const vehicleTypes: VehicleType[] = ['car', 'motorbike'];

type Props = CompositeScreenProps<
  BottomTabScreenProps<DriverTabParamList, 'Reservations'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ReservationsScreen({ navigation }: Props) {
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const reservationsQuery = useReservationsQuery();
  const createReservation = useCreateReservationMutation();
  const cancelReservation = useCancelReservationMutation();

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
      <InfoCard title="Make Reservation" subtitle="Smart slot allocation runs in backend">
        <View style={styles.segment}>
          {vehicleTypes.map((type) => (
            <Pressable
              key={type}
              onPress={() => setVehicleType(type)}
              style={[styles.segmentItem, vehicleType === type && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, vehicleType === type && styles.segmentTextActive]}>
                {type}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button loading={createReservation.isPending} onPress={handleCreateReservation}>
          Reserve {vehicleType}
        </Button>
      </InfoCard>

      <InfoCard title="My Reservations" subtitle="Tap a reservation to view details">
        <QueryState
          loading={reservationsQuery.isLoading}
          error={reservationsQuery.error}
          empty={!reservationsQuery.data?.length}
          emptyMessage="No reservations yet."
          onRetry={() => reservationsQuery.refetch()}
        />

        {reservationsQuery.data?.map((reservation) => (
          <Pressable
            key={reservation.id}
            style={styles.row}
            onPress={() => navigation.navigate('ReservationDetail', { reservationId: reservation.id })}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{reservation.vehicleType}</Text>
              <Text style={styles.muted}>
                {getReservationStatusLabel(reservation.status)} - expires {formatDate(reservation.expiresAt)}
              </Text>
              {reservation.slot?.code ? (
                <Text style={styles.muted}>Slot {reservation.slot.code}</Text>
              ) : null}
            </View>
            {canCancelReservation(reservation.status) ? (
              <View style={styles.actions}>
                <Button
                  variant="secondary"
                  onPress={() => navigation.navigate('ReservationDetail', { reservationId: reservation.id })}
                >
                  View Reservation QR
                </Button>
                <Button
                  variant="danger"
                  loading={cancelReservation.isPending}
                  onPress={() => handleCancel(reservation.id)}
                >
                  Cancel
                </Button>
              </View>
            ) : null}
          </Pressable>
        ))}
      </InfoCard>
    </Screen>
  );
}

const formatDate = formatDateTimeVN;

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentItem: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  segmentItemActive: {
    borderColor: colors.primary,
    backgroundColor: '#e7f5f2',
  },
  segmentText: {
    color: colors.muted,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  segmentTextActive: {
    color: colors.primaryDark,
  },
  row: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  rowText: {
    gap: 4,
  },
  actions: {
    gap: 8,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  muted: {
    color: colors.muted,
  },
});
