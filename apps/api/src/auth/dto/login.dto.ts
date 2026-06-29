import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
