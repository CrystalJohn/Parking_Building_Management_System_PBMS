import { IsEnum } from 'class-validator';
import { SlotStatus } from '@prisma/client';

const ALLOWED_STATUSES = [SlotStatus.maintenance, SlotStatus.available] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export class UpdateSlotStatusDto {
  @IsEnum(ALLOWED_STATUSES, {
    message: 'Status must be maintenance or available',
  })
  status: AllowedStatus;
}
