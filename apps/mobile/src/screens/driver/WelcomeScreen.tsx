import {
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';

const welcomeParkingImage = require('../../../assets/images/welcome-parking-1.png');

export function WelcomeScreen() {
  const completeWelcome = useAuthStore((state) => state.completeWelcome);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.phoneFrame}>
          <ImageBackground
            source={welcomeParkingImage}
            resizeMode="cover"
            style={styles.hero}
            imageStyle={styles.heroImage}
            accessibilityIgnoresInvertColors
          >
            <View style={styles.heroOverlay} />
          </ImageBackground>

          <View style={styles.panel}>
            <View style={styles.logoBadge} accessibilityRole="image" accessibilityLabel="PBMS logo">
              <Text style={styles.logoMark}>P</Text>
            </View>
            <Text style={styles.brand}>PBMS</Text>
            <Text style={styles.brandSub}>Parking Management</Text>

            <Text style={styles.title}>WELCOME</Text>
            <Text style={styles.subtitle}>Your parking space is ready</Text>
            <Text style={styles.description}>
              Reserve, check in, and manage your parking with ease.
            </Text>

            <View style={styles.actions}>
              <WelcomeButton label="Get Started" onPress={completeWelcome} variant="primary" />
              <WelcomeButton label="Explore App" onPress={completeWelcome} variant="secondary" />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WelcomeButton({
  label,
  onPress,
  variant,
}: {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#edf3fb',
  },
  phoneFrame: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
  },
  hero: {
    flex: 0.9,
    justifyContent: 'flex-end',
    minHeight: 300,
  },
  heroImage: {
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 22, 44, 0.12)',
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },
  panel: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 42,
    borderTopRightRadius: 42,
    justifyContent: 'center',
    marginTop: -54,
    paddingHorizontal: 30,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 14,
  },
  logoBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: '#eef5ff',
    borderColor: '#d5e6ff',
    borderWidth: 1,
  },
  logoMark: {
    color: '#0b5ed7',
    fontSize: 28,
    fontWeight: '900',
  },
  brand: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 10,
  },
  brandSub: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 14,
  },
  subtitle: {
    color: '#0b5ed7',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 280,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 18,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: 18,
  },
  primaryButton: {
    backgroundColor: '#0b5ed7',
    shadowColor: '#0b5ed7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: '#d7e2f1',
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
});
