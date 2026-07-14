import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

const USER_SELECT = {
  id: true,
  phone: true,
  username: true,
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
   * Find a single user by phone number, excluding password_hash.
   * Throws NotFoundException if not found.
   */
  async findOneByPhone(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User with phone number "${phone}" not found`);
    }

    return user;
  }

  /**
   * Create a new user account (admin-initiated).
   * Req 12.2
   */
  async create(dto: CreateUserDto) {
    const username = this.normalizeUsername(dto.username);
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    if (username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username },
      });

      if (existingUsername) {
        throw new ConflictException('Username already registered');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        phone: dto.phone,
        username,
        passwordHash,
        role: dto.role,
        fullName: this.normalizeNullableText(dto.fullName),
      },
      select: USER_SELECT,
    });
  }

  /**
   * Update user fields. If password is provided, re-hash it.
   * Req 12.2
   */
  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const existingUser = await this.findOne(id);
    await this.assertSafeAdminMutation(existingUser, dto, actorId);

    const { password, username, fullName, ...rest } = dto;

    const data: Record<string, unknown> = { ...rest };

    if (username !== undefined) {
      const normalizedUsername = this.normalizeUsername(username);

      if (normalizedUsername) {
        const existingUsername = await this.prisma.user.findUnique({
          where: { username: normalizedUsername },
        });

        if (existingUsername && existingUsername.id !== id) {
          throw new ConflictException('Username already registered');
        }
      }

      data.username = normalizedUsername;
    }

    if (fullName !== undefined) {
      data.fullName = this.normalizeNullableText(fullName);
    }

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
  async deactivate(id: string, actorId: string) {
    const existingUser = await this.findOne(id);
    await this.assertSafeAdminMutation(existingUser, { isActive: false }, actorId);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
  }

  private normalizeUsername(value: string | null | undefined): string | null {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
  }

  private normalizeNullableText(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private async assertSafeAdminMutation(
    existingUser: Awaited<ReturnType<UsersService['findOne']>>,
    dto: Pick<UpdateUserDto, 'role' | 'isActive'>,
    actorId: string,
  ) {
    const isSelf = existingUser.id === actorId;
    const nextRole = dto.role ?? existingUser.role;
    const nextIsActive = dto.isActive ?? existingUser.isActive;
    const roleDowngradedFromAdmin =
      existingUser.role === Role.admin && nextRole !== Role.admin;
    const removingActiveAdmin =
      existingUser.role === Role.admin &&
      existingUser.isActive &&
      (!nextIsActive || nextRole !== Role.admin);

    if (isSelf && !nextIsActive) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    if (isSelf && roleDowngradedFromAdmin) {
      throw new BadRequestException('You cannot change your own admin role');
    }

    if (removingActiveAdmin) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: Role.admin,
          isActive: true,
        },
      });

      if (activeAdminCount <= 1) {
        throw new ConflictException('You cannot remove the last active admin');
      }
    }
  }
}
