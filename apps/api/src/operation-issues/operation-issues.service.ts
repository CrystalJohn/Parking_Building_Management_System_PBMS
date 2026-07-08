import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OperationIssue,
  OperationIssueStatus,
  OperationIssueType,
} from '@prisma/client';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOperationIssueDto } from './dto/create-operation-issue.dto';
import { UpdateOperationIssueDto } from './dto/update-operation-issue.dto';

type OperationIssueEventName = 'issue.created' | 'issue.updated' | 'issue.resolved';

const OPEN_STATUSES = [OperationIssueStatus.open, OperationIssueStatus.in_review];

@Injectable()
export class OperationIssuesService {
  private readonly clients = new Set<Response>();

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOperationIssueDto, staffId: string) {
    const existing = await this.findExistingOpenIssue(dto);
    if (existing) return this.findOne(existing.id);

    const issue = await this.prisma.operationIssue.create({
      data: {
        type: dto.type,
        severity: dto.severity,
        note: dto.note,
        plateNumber: dto.plateNumber ? normalizePlate(dto.plateNumber) : null,
        sessionId: dto.sessionId,
        reservationId: dto.reservationId,
        paymentId: dto.paymentId,
        slotId: dto.slotId,
        createdById: staffId,
        source: 'staff',
      },
    });
    const fullIssue = await this.findOne(issue.id);
    this.publish('issue.created', fullIssue);
    return fullIssue;
  }

  findMany(status?: OperationIssueStatus) {
    return this.prisma.operationIssue.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      include: issueInclude,
    });
  }

  async getSummary() {
    const openIssues = await this.prisma.operationIssue.findMany({
      where: { status: { in: OPEN_STATUSES } },
      select: { severity: true },
    });

    return {
      openTotal: openIssues.length,
      critical: openIssues.filter((issue) => issue.severity === 'critical').length,
      warning: openIssues.filter((issue) => issue.severity === 'warning').length,
      info: openIssues.filter((issue) => issue.severity === 'info').length,
    };
  }

  async update(id: string, dto: UpdateOperationIssueDto, managerId: string) {
    const existing = await this.prisma.operationIssue.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Operation issue not found');

    const now = new Date();
    const issue = await this.prisma.operationIssue.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote,
        reviewedById: managerId,
        reviewedAt: dto.status === OperationIssueStatus.in_review ? now : existing.reviewedAt ?? now,
        resolvedAt:
          dto.status === OperationIssueStatus.resolved ||
          dto.status === OperationIssueStatus.dismissed
            ? now
            : null,
      },
      include: issueInclude,
    });
    this.publish(
      dto.status === OperationIssueStatus.resolved ? 'issue.resolved' : 'issue.updated',
      issue,
    );
    return issue;
  }

  async findOne(id: string) {
    const issue = await this.prisma.operationIssue.findUnique({
      where: { id },
      include: issueInclude,
    });
    if (!issue) throw new NotFoundException('Operation issue not found');
    return issue;
  }

  addStreamClient(res: Response) {
    this.clients.add(res);
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    return () => {
      this.clients.delete(res);
    };
  }

  private publish(event: OperationIssueEventName, issue: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(issue)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  private findExistingOpenIssue(dto: CreateOperationIssueDto): Promise<OperationIssue | null> {
    const contextFilters = [
      dto.sessionId ? { sessionId: dto.sessionId } : null,
      dto.paymentId ? { paymentId: dto.paymentId } : null,
      dto.reservationId ? { reservationId: dto.reservationId } : null,
      dto.slotId ? { slotId: dto.slotId } : null,
    ].filter(Boolean) as Array<Record<string, string | number>>;

    if (contextFilters.length === 0) return Promise.resolve(null);

    return this.prisma.operationIssue.findFirst({
      where: {
        type: dto.type,
        status: { in: OPEN_STATUSES },
        OR: contextFilters,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

const issueInclude = {
  createdBy: { select: { id: true, fullName: true, phone: true } },
  reviewedBy: { select: { id: true, fullName: true, phone: true } },
  session: { select: { id: true, sessionCode: true, licensePlate: true, status: true } },
  reservation: { select: { id: true, status: true, expiresAt: true } },
  payment: { select: { id: true, amount: true, method: true, status: true } },
  slot: { select: { id: true, code: true, zone: true, floor: { select: { name: true } } } },
} as const;

function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
