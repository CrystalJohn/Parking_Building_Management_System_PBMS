import { StyleSheet, Text, View } from 'react-native';

import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import { useNotificationsQuery } from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import { formatDateTimeVN } from '../../utils/dateTime';

export function NotificationCenterScreen() {
  const notificationsQuery = useNotificationsQuery();

  return (
    <Screen>
      <InfoCard title="Notification Center" subtitle="Recent driver notifications from PBMS">
        <QueryState
          loading={notificationsQuery.isLoading}
          error={notificationsQuery.error}
          empty={!notificationsQuery.isLoading && !notificationsQuery.data?.length}
          emptyMessage="No notifications yet."
          onRetry={() => notificationsQuery.refetch()}
        />

        {notificationsQuery.data?.map((notification) => (
          <View key={notification.id} style={styles.item}>
            <Text style={styles.title}>{notification.title}</Text>
            <Text style={styles.body}>{notification.message}</Text>
            <Text style={styles.meta}>{formatDateTimeVN(notification.createdAt)}</Text>
          </View>
        ))}
      </InfoCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    lineHeight: 20,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
});
