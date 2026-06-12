import { StyleSheet, Text, View } from 'react-native';

import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import { useParkingHistoryQuery } from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import { formatDateTimeVN } from '../../utils/dateTime';

export function HistoryScreen() {
  const historyQuery = useParkingHistoryQuery();

  return (
    <Screen>
      <InfoCard title="Parking History" subtitle="Completed sessions from backend">
        <QueryState
          loading={historyQuery.isLoading}
          error={historyQuery.error}
          empty={!historyQuery.data?.length}
          emptyMessage="No completed parking sessions yet."
          onRetry={() => historyQuery.refetch()}
        />

        {historyQuery.data?.map((session) => (
          <View key={session.id} style={styles.row}>
            <Text style={styles.title}>{session.licensePlate}</Text>
            <Text style={styles.muted}>
              {formatDate(session.checkInTime)} - {session.checkOutTime ? formatDate(session.checkOutTime) : 'N/A'}
            </Text>
            <Text style={styles.muted}>
              Fee {(session.feeAmount + session.penaltyAmount).toLocaleString()} VND
            </Text>
          </View>
        ))}
      </InfoCard>
    </Screen>
  );
}

const formatDate = formatDateTimeVN;

const styles = StyleSheet.create({
  row: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  muted: {
    color: colors.muted,
  },
});
