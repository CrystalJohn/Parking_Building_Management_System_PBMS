import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import { driverQueryKeys, useActiveSessionsQuery } from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import { formatDateTimeVN } from '../../utils/dateTime';
import { formatDuration, getSessionDurationMs } from '../../utils/session';
import type { DriverTabParamList } from '../../navigation/types';

type Props = BottomTabScreenProps<DriverTabParamList, 'ActiveSessionTab'>;

export function ActiveSessionScreen(_props: Props) {
  const queryClient = useQueryClient();
  const activeSessionsQuery = useActiveSessionsQuery();
  const activeSession = activeSessionsQuery.data?.[0];
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

  if (!activeSession) {
    return (
      <Screen>
        <InfoCard title="No Active Session" subtitle="Your active parking session will appear here after staff check-in.">
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
          <Detail label="Mã phiên gửi xe" value={activeSession.sessionCode ?? 'Chưa có mã phiên'} />
          <Detail label="Assigned slot" value={activeSession.slot?.code ?? 'Assigned'} />
          <Detail label="Floor" value={formatFloor(activeSession.slot)} />
          <Detail label="Zone" value={activeSession.slot?.zone ?? 'N/A'} />
          <Detail label="Check-in time" value={formatDate(activeSession.checkInTime)} />
          <Detail label="Duration" value={formatDuration(durationMs)} />
          <Detail label="Vehicle type" value={activeSession.vehicleType} />
        </View>
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
