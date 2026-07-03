import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Image, Linking, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { getErrorMessage } from '../../api/client';
import { Button } from '../../components/Button';
import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import {
  driverQueryKeys,
  useActiveSessionsQuery,
  useCreateSessionPaymentMutation,
  useSessionPaymentStatusQuery,
} from '../../hooks/useDriverQueries';
import type { DriverTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { formatDateTimeVN } from '../../utils/dateTime';
import { formatDuration, getSessionDurationMs } from '../../utils/session';

type Props = BottomTabScreenProps<DriverTabParamList, 'ActiveSessionTab'>;

export function ActiveSessionScreen(_props: Props) {
  const queryClient = useQueryClient();
  const activeSessionsQuery = useActiveSessionsQuery();
  const activeSession = activeSessionsQuery.data?.[0];
  const createSessionPayment = useCreateSessionPaymentMutation();
  const paymentStatusQuery = useSessionPaymentStatusQuery(
    activeSession?.id,
    activeSession?.status === 'checkout_pending' || activeSession?.status === 'exit_authorized',
  );
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => {
    if (activeSessionsQuery.isSuccess && activeSessionsQuery.data?.length) {
      void queryClient.invalidateQueries({ queryKey: driverQueryKeys.reservations.all });
    }
  }, [activeSessionsQuery.data?.length, activeSessionsQuery.isSuccess, queryClient]);

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

  async function handleCreatePayment() {
    if (!activeSession) {
      return;
    }

    try {
      await createSessionPayment.mutateAsync(activeSession.id);
    } catch (error) {
      Alert.alert('Khong the tao thanh toan', getErrorMessage(error));
    }
  }

  async function handleOpenPaymentPage() {
    const checkoutUrl = paymentStatusQuery.data?.payment?.checkoutUrl;
    if (!checkoutUrl) {
      return;
    }

    try {
      await Linking.openURL(checkoutUrl);
    } catch (error) {
      Alert.alert('Khong the mo VNPAY', getErrorMessage(error));
    }
  }

  if (!activeSession) {
    return (
      <Screen>
        <InfoCard
          title="No Active Session"
          subtitle="Your current parking session will appear here after staff check-in."
        >
          <QueryState
            loading={activeSessionsQuery.isLoading}
            error={activeSessionsQuery.error}
            empty={!activeSessionsQuery.isLoading && !activeSessionsQuery.data?.length}
            emptyMessage="No active session."
            onRetry={() => activeSessionsQuery.refetch()}
          />
        </InfoCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <InfoCard title={activeSession.licensePlate} subtitle={`Status: ${activeSession.status}`}>
        <View style={styles.details}>
          <Detail label="Session code" value={activeSession.sessionCode ?? 'Not available'} />
          <Detail label="Assigned slot" value={activeSession.slot?.code ?? 'Assigned'} />
          <Detail label="Floor" value={formatFloor(activeSession.slot)} />
          <Detail label="Zone" value={activeSession.slot?.zone ?? 'N/A'} />
          <Detail label="Check-in time" value={formatDate(activeSession.checkInTime)} />
          <Detail label="Duration" value={formatDuration(durationMs)} />
          <Detail label="Vehicle type" value={activeSession.vehicleType} />
        </View>

        {activeSession.sessionCode ? (
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Checkout QR</Text>
            <Text style={styles.qrHelp}>Show this session code to staff when you leave the building.</Text>
            <View style={styles.qrWrap}>
              <QRCode value={activeSession.sessionCode} size={180} />
            </View>
          </View>
        ) : null}

        {activeSession.status === 'checkout_pending' ? (
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Thanh toan ngay</Text>
            <Text style={styles.paymentHelp}>
              Staff da bat dau checkout. Ban co the tu thanh toan bang VNPAY truoc khi ra bai.
            </Text>
            <Button loading={createSessionPayment.isPending} onPress={handleCreatePayment}>
              Thanh toan ngay
            </Button>
            <QueryState
              loading={paymentStatusQuery.isLoading && !paymentStatusQuery.data}
              error={paymentStatusQuery.error}
              empty={!paymentStatusQuery.data?.payment}
              emptyMessage="QR thanh toan se xuat hien tai day."
              onRetry={() => paymentStatusQuery.refetch()}
            />
            {paymentStatusQuery.data?.payment ? (
              <View style={styles.paymentDetails}>
                <Detail label="Payment status" value={paymentStatusQuery.data.payment.status} />
                <Detail label="Amount" value={String(paymentStatusQuery.data.payment.amount)} />
                {paymentStatusQuery.data.payment.qrCode?.startsWith('data:image') ? (
                  <Image
                    source={{ uri: paymentStatusQuery.data.payment.qrCode }}
                    style={styles.paymentQrImage}
                    resizeMode="contain"
                  />
                ) : null}
                {paymentStatusQuery.data.payment.checkoutUrl ? (
                  <Button variant="secondary" onPress={handleOpenPaymentPage}>
                    Open VNPAY payment page
                  </Button>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {activeSession.status === 'exit_authorized' ? (
          <View style={styles.authorizedCard}>
            <Text style={styles.authorizedTitle}>Payment confirmed</Text>
            <Text style={styles.authorizedText}>
              Staff can now confirm vehicle exit without collecting payment again.
            </Text>
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

  return slot.floorId ? `Floor ${slot.floorId}` : 'N/A';
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
  qrCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginTop: 16,
    padding: 16,
  },
  qrTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  qrHelp: {
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
  paymentCard: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 16,
  },
  paymentTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  paymentHelp: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  paymentDetails: {
    gap: 10,
    marginTop: 8,
  },
  paymentQrImage: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 220,
    width: 220,
  },
  authorizedCard: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    marginTop: 16,
    padding: 16,
  },
  authorizedTitle: {
    color: '#065f46',
    fontSize: 16,
    fontWeight: '900',
  },
  authorizedText: {
    color: '#047857',
    fontSize: 13,
    lineHeight: 18,
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
