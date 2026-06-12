import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';
import type { SlotAvailabilityItem } from '../../types/api';
import { formatAvailabilityPercent, formatVehicleType } from '../../utils/dashboard';

type AvailabilityCardProps = {
  item: SlotAvailabilityItem;
};

export function AvailabilityCard({ item }: AvailabilityCardProps) {
  const isCar = item.vehicleType === 'car';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.location}>
          {item.floorName} · Zone {item.zone}
        </Text>
        <Text style={[styles.badge, isCar ? styles.carBadge : styles.motorbikeBadge]}>
          {formatVehicleType(item.vehicleType)}
        </Text>
      </View>

      <Text style={styles.count}>
        {item.available} / {item.total} available
      </Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${item.total > 0 ? Math.max(0, Math.min(100, (item.available / item.total) * 100)) : 0}%` },
          ]}
        />
      </View>
      <Text style={styles.percent}>{formatAvailabilityPercent(item.available, item.total)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  location: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  badge: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  carBadge: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  motorbikeBadge: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
  },
  count: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  barTrack: {
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 8,
  },
  percent: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
});

