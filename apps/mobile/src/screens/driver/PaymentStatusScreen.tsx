import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import { useActiveSessionQuery } from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import { getEstimatedFee } from '../../utils/session';
import type { ExitAuthorizationStatus, PaymentMethod, PaymentStatus } from '../../types/api';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentStatus'>;

export function PaymentStatusScreen({ route }: Props) {
  const sessionQuery = useActiveSessionQuery(route.params?.sessionId);
  const session = sessionQuery.data;
  const fee = session ? getEstimatedFee(session) : null;
  const paymentStatus: PaymentStatus = session?.isPaid ? 'paid' : 'pending';
  const paymentMethod: PaymentMethod = session?.isPaid ? 'cash' : 'bank_qr';
  const exitStatus: ExitAuthorizationStatus = session?.isPaid ? 'AUTHORIZED' : 'NOT_READY';

  return (
    <Screen>
      <InfoCard title="Payment Status" subtitle={session ? `Session ${session.id}` : 'No active session selected'}>
        <QueryState
          loading={sessionQuery.isLoading}
          error={sessionQuery.error}
          empty={!session}
          emptyMessage="No active session data available."
          onRetry={() => sessionQuery.refetch()}
        />

        {session ? (
          <View style={styles.details}>
            <Detail label="Base fee" value={`${session.feeAmount.toLocaleString()} VND`} />
            <Detail label="Penalty" value={`${session.penaltyAmount.toLocaleString()} VND`} />
            <Detail
              label="Total / estimate"
              value={`${fee?.amount.toLocaleString()} VND (${fee?.source})`}
            />
            <Detail label="Payment status" value={paymentStatus} />
            <Detail label="Payment method" value={paymentMethod} />
            <Detail label="Exit authorization" value={exitStatus} />
            <Text style={styles.note}>
              Bank/QR payment will be handled through PBMS backend APIs when the payment module is available.
            </Text>
          </View>
        ) : null}
      </InfoCard>
    </Screen>
  );
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
  note: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
