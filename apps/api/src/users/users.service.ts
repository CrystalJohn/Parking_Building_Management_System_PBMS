import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

const USER_SELECT = {
  id: true,
  phone: true,
  role: true,
  fullName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return all users, excluding password_hash.
   * Req 12.1
   */
  async findAll() {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Return a single user by id, excluding password_hash.
   * Throws NotFoundException if not found.
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    return user;
  }

  /**
   * Create a new user account (admin-initiated).
   * Req 12.2
   */
  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        fullName: dto.fullName,
      },
      select: USER_SELECT,
    });
  }

  /**
   * Update user fields. If password is provided, re-hash it.
   * Req 12.2
   */
  async update(id: string, dto: UpdateUserDto) {
    // Ensure user exists
    await this.findOne(id);

    const { password, ...rest } = dto;

    const data: Record<string, unknown> = { ...rest };

    if (password) {
      data.passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  /**
   * Soft-deactivate a user account (set is_active = false).
   * The JwtStrategy checks isActive on every request, so this immediately
   * revokes all active sessions for that account (Req 12.4).
   */
  async deactivate(id: string) {
    // Ensure user exists
    await this.findOne(id);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
  }
}
