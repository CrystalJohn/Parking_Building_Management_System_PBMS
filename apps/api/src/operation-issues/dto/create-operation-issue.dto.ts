import {
  OperationIssueSeverity,
  OperationIssueType,
} from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOperationIssueDto {
  @IsEnum(OperationIssueType)
  type!: OperationIssueType;

  @IsEnum(OperationIssueSeverity)
  severity!: OperationIssueSeverity;

  @IsString()
  @MaxLength(2000)
  note!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  reservationId?: string;

  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsOptional()
  @IsInt()
  slotId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  plateNumber?: string;
}
