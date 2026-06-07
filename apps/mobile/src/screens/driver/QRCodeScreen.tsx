import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, StyleSheet, Text, View } from 'react-native';

import { InfoCard } from '../../components/InfoCard';
import { QueryState } from '../../components/QueryState';
import { Screen } from '../../components/Screen';
import { useQrCodeQuery } from '../../hooks/useDriverQueries';
import { colors } from '../../theme/colors';
import { normalizeQrCodeDataUrl } from '../../utils/qrCode';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'QRCode'>;

export function QRCodeScreen({ route }: Props) {
  const qrCodeQuery = useQrCodeQuery(route.params.sessionId);
  const qrDataUrl = normalizeQrCodeDataUrl(qrCodeQuery.data);

  return (
    <Screen>
      <InfoCard title="Parking Session QR" subtitle="Show this QR code to staff during checkout.">
        <QueryState
          loading={qrCodeQuery.isLoading}
          error={qrCodeQuery.error}
          onRetry={() => qrCodeQuery.refetch()}
        />
        {qrDataUrl ? (
          <View style={styles.qrWrap}>
            <Image source={{ uri: qrDataUrl }} style={styles.qrImage} resizeMode="contain" />
          </View>
        ) : (
          <Text style={styles.muted}>QR code is not available for this session.</Text>
        )}
      </InfoCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: 16,
  },
  qrImage: {
    width: 260,
    height: 260,
  },
  muted: {
    color: colors.muted,
  },
});
