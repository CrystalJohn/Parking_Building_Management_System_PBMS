import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../../theme/colors';

type QuickActionCardProps = {
  label: string;
  description: string;
  onPress: () => void;
};

export function QuickActionCard({ label, description, onPress }: QuickActionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.description}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});

