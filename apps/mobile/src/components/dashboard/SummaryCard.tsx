import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

type SummaryCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  tone?: 'default' | 'empty' | 'success' | 'warning';
}>;

export function SummaryCard({
  title,
  subtitle,
  tone = 'default',
  children,
}: SummaryCardProps) {
  return (
    <View style={[styles.card, styles[tone]]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  default: {
    backgroundColor: '#f8fafc',
  },
  empty: {
    backgroundColor: '#f9fafb',
    borderStyle: 'dashed',
  },
  success: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  warning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fed7aa',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  body: {
    gap: 10,
    marginTop: 12,
  },
});

