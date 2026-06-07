import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { getErrorMessage } from '../../api/client';
import { Button } from '../../components/Button';
import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import {
  useCancelReservationMutation,
  useReservationDetailQuery,
} from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReservationDetail'>;

export function ReservationDetailScreen({ navigation, route }: Props) {
  const reservationQuery = useReservationDetailQuery(route.params.reservationId);
  const cancelReservation = useCancelReservationMutation();
  const reservation = reservationQuery.data;

  async function handleCancel() {
    if (!reservation) {
      return;
    }

    try {
      await cancelReservation.mutateAsync(reservation.id);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Cancel reservation failed', getErrorMessage(error));
    }
  }

  return (
    <Screen>
      <InfoCard title="Reservation Detail" subtitle="Loaded from the reservations list until a detail endpoint exists">
        <QueryState
          loading={reservationQuery.isLoading}
          error={reservationQuery.error}
          empty={!reservation}
          emptyMessage="Reservation not found."
          onRetry={() => reservationQuery.refetch()}
        />

        {reservation ? (
          <View style={styles.details}>
            <Detail label="Status" value={reservation.status} />
            <Detail label="Vehicle type" value={reservation.vehicleType} />
            <Detail label="License plate" value={reservation.licensePlate ?? 'Not assigned'} />
            <Detail label="Assigned slot" value={reservation.slot?.code ?? 'Not assigned'} />
            <Detail label="Floor" value={formatFloor(reservation.slot)} />
            <Detail label="Zone" value={reservation.slot?.zone ?? 'N/A'} />
            <Detail label="Created time" value={formatDate(reservation.createdAt)} />
            <Detail label="Expires time" value={formatDate(reservation.expiresAt)} />

            {reservation.status === 'active' ? (
              <Button
                variant="danger"
                loading={cancelReservation.isPending}
                onPress={handleCancel}
              >
                Cancel reservation
              </Button>
            ) : null}
          </View>
        ) : null}
      </InfoCard>
    </Screen>
  );
}

type SlotLike = {
  floorId?: number;
  floor?: {
    floorNumber: number;
    name: string;
  };
};

function formatFloor(slot?: SlotLike) {
  if (!slot) {
    return 'N/A';
  }

  if (slot.floor) {
    return `${slot.floor.name} (${slot.floor.floorNumber})`;
  }

  return `Floor ID ${slot.floorId ?? 'N/A'}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  details: {
    gap: 12,
  },
  detailRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 10,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
});
