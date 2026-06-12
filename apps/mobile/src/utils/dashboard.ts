import type { ParkingSession, Reservation, SlotAvailabilityItem, VehicleType } from '../types/api';
import { formatDateTimeVN } from './dateTime';

export function formatVehicleType(vehicleType?: VehicleType | string | null) {
  if (vehicleType === 'car') {
    return 'Car';
  }

  if (vehicleType === 'motorbike') {
    return 'Motorbike';
  }

  return 'Vehicle';
}

export function formatAvailabilityPercent(available: number, total: number) {
  if (total <= 0) {
    return '0% available';
  }

  return `${Math.round((available / total) * 100)}% available`;
}

export function formatSlotLabel(
  slot?: Reservation['slot'] | ParkingSession['slot'] | null,
) {
  if (!slot) {
    return 'Not assigned';
  }

  if (slot.code) {
    return slot.code;
  }

  const floorName = slot.floor?.name ?? `F${slot.floorId}`;
  return `${floorName}-${slot.zone}`;
}

export function formatDateTime(value?: string | null) {
  return formatDateTimeVN(value);
}

export function groupAvailabilityByVehicleType(items: SlotAvailabilityItem[] = []) {
  return items.reduce<Record<VehicleType, SlotAvailabilityItem[]>>(
    (groups, item) => {
      groups[item.vehicleType].push(item);
      return groups;
    },
    {
      car: [],
      motorbike: [],
    },
  );
}
