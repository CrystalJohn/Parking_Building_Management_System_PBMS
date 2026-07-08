import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

interface UserShape {
  id: string;
  phone: string;
  username: string | null;
  role: Role;
  fullName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const makeUser = (overrides: Partial<UserShape> = {}): UserShape => ({
  id: 'uuid-1',
  phone: '0912345678',
  username: null,
  role: Role.driver,
  fullName: 'Test User',
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findAll', () => {
    it('returns all users without password_hash', async () => {
      const users = [makeUser(), makeUser({ id: 'uuid-2', phone: '0987654321' })];
      prisma.user.findMany.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toEqual(users);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.not.objectContaining({ passwordHash: true }) }),
      );
    });
  });

  describe('findOne', () => {
    it('returns user when found', async () => {
      const user = makeUser();
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne('uuid-1');

      expect(result).toEqual(user);
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto = {
      phone: '0912345678',
      password: 'secret123',
      fullName: 'New User',
      role: Role.staff,
    };

    it('creates user and hashes password', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no conflict
      const created = makeUser({ role: Role.staff });
      prisma.user.create.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(result).toEqual(created);
      const createCall = prisma.user.create.mock.calls[0][0];
      // password_hash should be set, not the raw password
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash).not.toBe(dto.password);
      // password_hash should not be in select
      expect(createCall.select).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when phone already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates user fields', async () => {
      const existing = makeUser();
      prisma.user.findUnique.mockResolvedValue(existing);
      const updated = makeUser({ fullName: 'Updated Name' });
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.update('uuid-1', { fullName: 'Updated Name' }, 'admin-actor');

      expect(result).toEqual(updated);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'uuid-1' } }),
      );
    });

    it('re-hashes password when password is provided', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());

      await service.update('uuid-1', { password: 'newpassword' }, 'admin-actor');

      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.passwordHash).toBeDefined();
      expect(updateCall.data.passwordHash).not.toBe('newpassword');
      // raw password field should not be passed to Prisma
      expect(updateCall.data.password).toBeUndefined();
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', { fullName: 'X' }, 'admin-actor')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects self-deactivation', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'admin-self', role: Role.admin }));

      await expect(
        service.update('admin-self', { isActive: false }, 'admin-self'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects self-role downgrade from admin', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'admin-self', role: Role.admin }));

      await expect(
        service.update('admin-self', { role: Role.manager }, 'admin-self'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects demoting the last active admin', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'admin-1', role: Role.admin, isActive: true }));
      prisma.user.count.mockResolvedValue(1);

      await expect(
        service.update('admin-1', { role: Role.manager }, 'another-admin'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows demoting an admin when another active admin exists', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'admin-1', role: Role.admin, isActive: true }));
      prisma.user.count.mockResolvedValue(2);
      const updated = makeUser({ id: 'admin-1', role: Role.manager });
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.update('admin-1', { role: Role.manager }, 'admin-2');

      expect(result.role).toBe(Role.manager);
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false (soft delete)', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      const deactivated = makeUser({ isActive: false });
      prisma.user.update.mockResolvedValue(deactivated);

      const result = await service.deactivate('uuid-1', 'admin-actor');

      expect(result.isActive).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'uuid-1' },
          data: { isActive: false },
        }),
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('non-existent', 'admin-actor')).rejects.toThrow(NotFoundException);
    });

    it('rejects deactivating your own account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'admin-self', role: Role.admin }));

      await expect(service.deactivate('admin-self', 'admin-self')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects deactivating the last active admin', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'admin-1', role: Role.admin, isActive: true }));
      prisma.user.count.mockResolvedValue(1);

      await expect(service.deactivate('admin-1', 'admin-2')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
