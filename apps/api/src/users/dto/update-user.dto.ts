import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  Matches,
} from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(/^(0|\+84)(3[2-9]|5[6-9]|7[0|6-9]|8[0-9]|9[0-9])[0-9]{7}$/, {
    message: 'Phone must be a valid Vietnamese phone number',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9._-]{2,31}$/, {
    message: 'Username must start with a letter and contain 3-32 letters, numbers, dots, underscores, or hyphens',
  })
  username?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Role must be one of: admin, manager, staff, driver' })
  role?: Role;
}
