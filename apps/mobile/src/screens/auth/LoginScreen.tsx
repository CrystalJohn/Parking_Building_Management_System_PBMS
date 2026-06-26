import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getErrorMessage } from '../../api/client';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const login = useAuthStore((state) => state.login);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin() {
    try {
      setIsSubmitting(true);
      await login({ phone: phone.trim(), password });
    } catch (error) {
      Alert.alert('Login failed', getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>PBMS Driver</Text>
        <Text style={styles.title}>Login</Text>
        <Text style={styles.subtitle}>Access reservations, active sessions, and parking history.</Text>
      </View>

      <TextField
        label="Phone"
        keyboardType="phone-pad"
        placeholder="0xxxxxxxxx"
        value={phone}
        onChangeText={setPhone}
      />
      <TextField
        label="Password"
        placeholder="Your password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Button
        loading={isSubmitting}
        disabled={!phone || !password}
        onPress={handleLogin}
      >
        Login
      </Button>

      <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={styles.linkWrap}>
        <Text style={styles.link}>Forgot password?</Text>
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Register')} style={styles.linkWrap}>
        <Text style={styles.link}>Create a driver account</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 8,
    paddingTop: 40,
    paddingBottom: 12,
  },
  kicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  linkWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  link: {
    color: colors.primary,
    fontWeight: '800',
  },
});
