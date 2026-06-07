import { StyleSheet, Text, View } from 'react-native';

import { InfoCard } from '../../components/InfoCard';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';

const placeholderNotifications = [
  {
    title: 'Reservation confirmed',
    body: 'Your parking reservation has been confirmed.',
  },
  {
    title: 'Reservation expired',
    body: 'A reservation can expire when the vehicle is not checked in on time.',
  },
  {
    title: 'Payment confirmed',
    body: 'Payment confirmation will come from the PBMS backend.',
  },
  {
    title: 'Exit authorized',
    body: 'Staff can authorize exit after checkout validation.',
  },
  {
    title: 'Session completed',
    body: 'The parking session completes after staff confirms the vehicle exited.',
  },
];

export function NotificationCenterScreen() {
  return (
    <Screen>
      <InfoCard title="Notification Center" subtitle="Local demo data until notification APIs are available">
        {placeholderNotifications.map((notification) => (
          <View key={notification.title} style={styles.item}>
            <Text style={styles.title}>{notification.title}</Text>
            <Text style={styles.body}>{notification.body}</Text>
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
});
