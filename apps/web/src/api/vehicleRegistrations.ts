import api from '../lib/api'

export interface VehicleRegistrationRequest {
  id: string
  driverId: string
  plateNumber: string
  plateDisplay?: string | null
  vehicleType: 'car' | 'motorbike'
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  rejectReason: string | null
  evidenceUrlCaVant: string | null
  evidenceUrlOverall: string | null
  evidenceUrlPlate: string | null
  createdAt: string
  reviewedAt: string | null
  driver?: {
    fullName: string | null
    phone: string
  }
  reviewedBy?: {
    fullName: string | null
  }
}

export const getPendingRequests = async () => {
  const { data } = await api.get<VehicleRegistrationRequest[]>('/vehicle-registrations/pending')
  return data
}

export const getRegistrationHistory = async () => {
  const { data } = await api.get<VehicleRegistrationRequest[]>('/vehicle-registrations/history')
  return data
}

export const reviewRequest = async (
  requestId: string,
  review: { status: 'approved' | 'rejected'; rejectReason?: string }
) => {
  const { data } = await api.patch<{ message: string }>(
    `/vehicle-registrations/${requestId}/review`,
    review
  )
  return data
}
