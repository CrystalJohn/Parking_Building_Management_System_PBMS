import { IsUUID } from 'class-validator';

export class ConfirmReservationCheckInDto {
  @IsUUID()
  reservationId: string;
}
