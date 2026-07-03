import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';

export class DriverSessionPaymentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['bank_qr'])
  method!: 'bank_qr';
}
