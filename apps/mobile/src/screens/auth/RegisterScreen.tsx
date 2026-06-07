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

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const register = useAuthStore((state) => state.register);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister() {
    try {
      setIsSubmitting(true);
      await register({
        fullName: fullName.trim(),
        phone: phone.trim(),
        password,
      });
    } catch (error) {
      Alert.alert('Register failed', getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Register</Text>
        <Text style={styles.subtitle}>Driver self-registration uses phone, password, and full name.</Text>
      </View>

      <TextField
        label="Full name"
        placeholder="Nguyen Van A"
        value={fullName}
        onChangeText={setFullName}
      />
      <TextField
        label="Phone"
        keyboardType="phone-pad"
        placeholder="0xxxxxxxxx"
        value={phone}
        onChangeText={setPhone}
      />
      <TextField
        label="Password"
        placeholder="At least 6 characters"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Button
        loading={isSubmitting}
        disabled={!fullName || !phone || password.length < 6}
        onPress={handleRegister}
      >
        Create account
      </Button>

      <Pressable onPress={() => navigation.navigate('Login')} style={styles.linkWrap}>
        <Text style={styles.link}>Back to login</Text>
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
