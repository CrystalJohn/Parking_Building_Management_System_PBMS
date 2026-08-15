import { useMutation } from '@tanstack/react-query'
import { checkIn, type CheckInRequest, type CheckInResponse } from '../../../lib/sessions-api'

export type CheckInParams = {
  plate: string
  reservationId?: string
  vehicleType?: 'car' | 'motorbike'
}

export function useCheckIn() {
  return useMutation({
    mutationFn: async (data: CheckInParams): Promise<CheckInResponse> => {
      const request: CheckInRequest = {
        licensePlate: data.plate,
        vehicleType: data.vehicleType ?? 'car',
        reservationId: data.reservationId,
      }
      return checkIn(request)
    },
  })
}
