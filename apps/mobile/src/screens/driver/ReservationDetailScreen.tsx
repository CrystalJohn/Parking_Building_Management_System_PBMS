import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

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
import { formatDateTimeVN } from '../../utils/dateTime';
import { canCancelReservation, getReservationStatusLabel } from '../../utils/reservationStatus';

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
            <Detail label="Status" value={getReservationStatusLabel(reservation.status)} />
            <Detail label="Vehicle type" value={reservation.vehicleType} />
            <Detail label="License plate" value={reservation.licensePlate ?? 'Not assigned'} />
            <Detail label="Assigned slot" value={reservation.slot?.code ?? 'Not assigned'} />
            <Detail label="Floor" value={formatFloor(reservation.slot)} />
            <Detail label="Zone" value={reservation.slot?.zone ?? 'N/A'} />
            <Detail label="Created time" value={formatDate(reservation.createdAt)} />
            <Detail label="Expires time" value={formatDate(reservation.expiresAt)} />

            {canCancelReservation(reservation.status) ? (
              <>
                <View style={styles.reservationCodeCard}>
                  <Text style={styles.codeTitle}>Reservation QR</Text>
                  <Text style={styles.codeHelp}>
                    Show this Reservation QR to staff at the check-in gate.
                  </Text>
                  <View style={styles.qrWrap}>
                    <QRCode value={reservation.id} size={210} />
                  </View>
                  <Text style={styles.codeLabel}>Text fallback: reservation ID</Text>
                  <Text selectable style={styles.codeValue}>
                    {reservation.id}
                  </Text>
                  <Text style={styles.codeNote}>
                    QR payload: reservation ID. This is separate from the Session QR used for checkout.
                  </Text>
                </View>

                <Button
                  variant="danger"
                  loading={cancelReservation.isPending}
                  onPress={handleCancel}
                >
                  Cancel reservation
                </Button>
              </>
            ) : (
              <View style={styles.inactiveCard}>
                <Text style={styles.inactiveTitle}>
                  This reservation is no longer valid for check-in
                </Text>
                <Text style={styles.inactiveText}>
                  Reservation QR/code is only available while the reservation status is active.
                </Text>
              </View>
            )}
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

const formatDate = formatDateTimeVN;

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
  reservationCodeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  codeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  codeHelp: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  qrWrap: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  codeLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  codeValue: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    padding: 12,
  },
  codeNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  inactiveCard: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  inactiveTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  inactiveText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
