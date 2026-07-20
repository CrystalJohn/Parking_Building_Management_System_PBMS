import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Button } from '../../components/Button';
import { InfoCard } from '../../components/InfoCard';
import { colors } from '../../theme/colors';
import { vehicleRegistrationsApi } from '../../api/vehicleRegistrations';
import type { VehicleRegistrationRequest, VehicleType } from '../../types/api';
import { Screen } from '../../components/Screen';

export function RegisterVehicleScreen({ navigation }: any) {
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('motorbike');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<VehicleRegistrationRequest[]>([]);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const data = await vehicleRegistrationsApi.getMyRequests();
      setRequests(data);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Failed to fetch your registration requests.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!plateNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid plate number.');
      return;
    }

    setSubmitting(true);
    try {
      await vehicleRegistrationsApi.createRequest({
        plateNumber: plateNumber.trim(),
        vehicleType,
      });
      Alert.alert('Success', 'Your vehicle registration request has been submitted and is pending review.');
      setPlateNumber('');
      fetchRequests();
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Failed to submit request.';
      Alert.alert('Error', Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    let bgColor = colors.surface;
    let textColor = colors.muted;
    switch (status) {
      case 'pending':
        bgColor = '#FEF3C7';
        textColor = '#92400E';
        break;
      case 'approved':
        bgColor = '#D1FAE5';
        textColor = '#065F46';
        break;
      case 'rejected':
        bgColor = '#FEE2E2';
        textColor = '#991B1B';
        break;
      case 'expired':
        bgColor = '#F3F4F6';
        textColor = '#374151';
        break;
    }
    return (
      <View style={[styles.badge, { backgroundColor: bgColor }]}>
        <Text style={[styles.badgeText, { color: textColor }]}>{status.toUpperCase()}</Text>
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <InfoCard title="Submit New Request" subtitle="Register a vehicle">
          <Text style={styles.label}>Plate Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 59A12345"
            placeholderTextColor={colors.muted}
            value={plateNumber}
            onChangeText={setPlateNumber}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Vehicle Type</Text>
          <View style={styles.typeContainer}>
            <Button
              variant={vehicleType === 'motorbike' ? 'primary' : 'secondary'}
              onPress={() => setVehicleType('motorbike')}
            >
              Motorbike
            </Button>
            <View style={{ width: 10 }} />
            <Button
              variant={vehicleType === 'car' ? 'primary' : 'secondary'}
              onPress={() => setVehicleType('car')}
            >
              Car
            </Button>
          </View>

          <View style={{ marginTop: 16 }}>
            <Button
              variant="primary"
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Registration'}
            </Button>
          </View>
        </InfoCard>

        <Text style={styles.sectionTitle}>Your Requests</Text>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
        ) : requests.length === 0 ? (
          <Text style={styles.noDataText}>You have no registration requests.</Text>
        ) : (
          requests.map((req) => (
            <InfoCard key={req.id} title={req.plateNumber} subtitle={`Type: ${req.vehicleType.toUpperCase()}`}>
              <View style={styles.requestHeader}>
                {renderStatusBadge(req.status)}
              </View>
              <Text style={styles.requestDate}>
                Submitted: {new Date(req.createdAt).toLocaleDateString()}
              </Text>
              {req.status === 'rejected' && req.rejectReason && (
                <Text style={styles.rejectReason}>Reason: {req.rejectReason}</Text>
              )}
            </InfoCard>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 16,
  },
  label: {
    color: colors.text,
    marginBottom: 8,
    fontWeight: '600',
    fontSize: 14,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    color: colors.text,
    fontSize: 16,
  },
  typeContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  noDataText: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  requestHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  requestDate: {
    fontSize: 12,
    color: colors.muted,
  },
  rejectReason: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
