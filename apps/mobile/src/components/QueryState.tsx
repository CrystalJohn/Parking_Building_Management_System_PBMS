import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { Button } from './Button';

type QueryStateProps = {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
  errorMessage?: string;
  onRetry?: () => void;
};

export function QueryState({
  loading,
  error,
  empty,
  emptyMessage = 'No data available.',
  loadingMessage = 'Loading...',
  errorMessage = 'Unable to load data.',
  onRetry,
}: QueryStateProps) {
  if (loading) {
    return <Text style={styles.muted}>{loadingMessage}</Text>;
  }

  if (error) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.error}>{errorMessage}</Text>
        {onRetry ? (
          <Button variant="secondary" onPress={onRetry}>
            Retry
          </Button>
        ) : null}
      </View>
    );
  }

  if (empty) {
    return <Text style={styles.muted}>{emptyMessage}</Text>;
  }

  return null;
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  muted: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
});
