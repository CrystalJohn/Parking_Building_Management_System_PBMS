import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, StyleSheet, Text } from 'react-native';

import { Button } from '../../components/Button';
import { InfoCard } from '../../components/InfoCard';
import { Screen } from '../../components/Screen';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import type { DriverTabParamList, RootStackParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<DriverTabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ProfileScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  async function handleLogout() {
    await logout();
  }

  return (
    <Screen>
      <InfoCard title="Profile" subtitle="Authenticated driver account">
        <Text style={styles.line}>Name: {user?.fullName ?? 'N/A'}</Text>
        <Text style={styles.line}>Phone: {user?.phone ?? 'N/A'}</Text>
        <Text style={styles.line}>Role: {user?.role ?? 'driver'}</Text>
        <Button variant="secondary" onPress={() => navigation.navigate('NotificationCenter')}>
          Notification center
        </Button>
        <Button
          variant="danger"
          onPress={() => {
            Alert.alert('Logout', 'Do you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Logout', style: 'destructive', onPress: handleLogout },
            ]);
          }}
        >
          Logout
        </Button>
      </InfoCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: {
    color: colors.text,
    fontSize: 15,
  },
});
