import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGateDto, UpdateGateDto } from './dto';
import { GateType } from '@prisma/client';

const gateSelect = {
  id: true,
  code: true,
  name: true,
  gateType: true,
  floorId: true,
  floor: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  lanes: {
    select: {
      id: true,
      code: true,
      name: true,
      vehicleType: true,
      floorId: true,
      isActive: true,
    },
  },
} as const;

@Injectable()
export class GatesService {
  constructor(private readonly prisma: PrismaService) {}

  async listGates() {
    return this.prisma.gate.findMany({
      orderBy: [{ gateType: 'asc' }, { floorId: 'asc' }, { code: 'asc' }],
      select: gateSelect,
    });
  }

  async getGate(id: string) {
    const gate = await this.prisma.gate.findUnique({ where: { id }, select: gateSelect });
    if (!gate) throw new NotFoundException('Gate not found.');
    return gate;
  }

  async createGate(dto: CreateGateDto) {
    const prefix = dto.gateType === GateType.CHECK_IN ? 'IN' : 'OUT';
    const existingCount = await this.prisma.gate.count({ where: { gateType: dto.gateType } });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `${prefix}-${String(existingCount + attempt + 1).padStart(3, '0')}`;
      try {
        return await this.prisma.gate.create({ data: { ...dto, code }, select: gateSelect });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Unique constraint')) continue;
        throw error;
      }
    }
    throw new Error('Unable to allocate a unique gate code. Please try again.');
  }

  async updateGate(id: string, dto: UpdateGateDto) {
    try {
      return await this.prisma.gate.update({ where: { id }, data: dto, select: gateSelect });
    } catch {
      throw new NotFoundException('Gate not found.');
    }
  }

  async deleteGate(id: string) {
    try {
      await this.prisma.gate.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Gate not found.');
    }
  }
}
