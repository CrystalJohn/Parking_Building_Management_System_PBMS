export type VehicleType = 'car' | 'motorbike'

export type TicketType = 'casual' | 'reservation'

export type UserType = 'guest' | 'registered'

export interface VehicleFormData {
  plateNumber: string
  vehicleType: VehicleType
  ticketType: TicketType
  userType: UserType
  reservationCode?: string
  autoDetectedVehicleType?: VehicleType
  ocrConfidence?: number
}

export interface VehicleFormErrors {
  plateNumber?: string
  vehicleType?: string
  ticketType?: string
  userType?: string
  reservationCode?: string
}
