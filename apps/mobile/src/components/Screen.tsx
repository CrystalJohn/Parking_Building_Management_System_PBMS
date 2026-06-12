import type { PropsWithChildren, ReactElement } from 'react';
import type { RefreshControlProps } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';

type ScreenProps = PropsWithChildren<{
  refreshControl?: ReactElement<RefreshControlProps>;
  scroll?: boolean;
}>;

export function Screen({ children, refreshControl, scroll = true }: ScreenProps) {
  if (!scroll) {
    return <SafeAreaView style={styles.container}>{children}</SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
  inner: {
    gap: 16,
  },
});
