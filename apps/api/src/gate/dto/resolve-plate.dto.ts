import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const VIETNAMESE_PLATE_REGEX = /^(?:\d{2}[A-Z]\d{5}|\d{2}[A-Z]\d\d{5})$/;

export class ResolvePlateDto {
  @IsString()
  @IsNotEmpty()
  @Matches(VIETNAMESE_PLATE_REGEX, {
    message: 'License plate must be 7-9 alphanumeric characters: province code (2 digits) + series (1-2 letters/digits) + 5 digits. Example: 30A12345',
  })
  plate: string;

  @IsOptional()
  @IsString()
  ocrEvidenceId?: string;
}
