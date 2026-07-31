import api from './api'
import type { ReservationStatus, VehicleType } from './driver-api'

export interface ManagerReservation {
  id: string
  vehicleType: VehicleType
  status: ReservationStatus
  createdAt: string
  expiresAt: string
  licensePlate?: string | null
  plateDisplay?: string | null
  driver: {
    id: string
    fullName: string | null
    phone: string | null
  }
  vehicle?: {
    id: string
    plateNumber: string
    vehicleType: VehicleType
  } | null
  slot: {
    id: number
    code: string
    zone: string
    floor?: {
      id: number
      floorNumber: number
      name: string
    } | null
  } | null
}

export async function getAllReservations(date?: string): Promise<ManagerReservation[]> {
  const { data } = await api.get<ManagerReservation[]>('/reservations/all', {
    params: date ? { date } : {},
  })
  return data
}
