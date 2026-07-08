import { OperationIssueStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOperationIssueDto {
  @IsEnum(OperationIssueStatus)
  status!: OperationIssueStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
