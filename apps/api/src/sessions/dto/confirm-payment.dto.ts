import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/**
 * 15.4: Confirm payment DTO.
 * Req 2.4, 6.2
 */
export class ConfirmPaymentDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsBoolean()
  isLostTicket?: boolean;
}
