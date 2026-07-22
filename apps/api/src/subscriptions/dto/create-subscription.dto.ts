import { IsString, IsIn } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  vehicleId!: string;

  @IsIn(['monthly', 'yearly'])
  planType!: 'monthly' | 'yearly';
}
