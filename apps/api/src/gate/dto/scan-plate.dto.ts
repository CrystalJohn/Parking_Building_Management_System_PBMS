import { IsOptional, IsString } from 'class-validator';

export class ScanPlateDto {
  @IsOptional()
  @IsString()
  cameraId?: string;

  @IsOptional()
  @IsString()
  buildingName?: string;

  @IsOptional()
  @IsString()
  gateName?: string;
}
