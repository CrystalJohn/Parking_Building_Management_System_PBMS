import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ResolvePlateDto {
  @IsString()
  @IsNotEmpty()
  plate: string;

  @IsOptional()
  @IsString()
  ocrEvidenceId?: string;
}
