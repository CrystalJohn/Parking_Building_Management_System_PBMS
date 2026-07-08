import { NotFoundException } from '@nestjs/common';
import {
  OperationIssueSeverity,
  OperationIssueStatus,
  OperationIssueType,
} from '@prisma/client';
import { OperationIssuesService } from './operation-issues.service';
import { PrismaService } from '../prisma/prisma.service';

const makeIssue = (overrides: Record<string, unknown> = {}) => ({
  id: 'issue-1',
  type: OperationIssueType.payment_issue,
  severity: OperationIssueSeverity.warning,
  status: OperationIssueStatus.open,
  source: 'staff',
  note: 'Payment terminal failed.',
  plateNumber: '90B245230',
  sessionId: 'session-1',
  reservationId: null,
  paymentId: 'payment-1',
  slotId: 1,
  createdById: 'staff-1',
  reviewedById: null,
  reviewedAt: null,
  resolvedAt: null,
  resolutionNote: null,
  createdAt: new Date('2026-07-04T02:00:00.000Z'),
  updatedAt: new Date('2026-07-04T02:00:00.000Z'),
  ...overrides,
});

describe('OperationIssuesService', () => {
  let service: OperationIssuesService;
  let prisma: {
    operationIssue: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      operationIssue: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new OperationIssuesService(prisma as unknown as PrismaService);
  });

  it('creates a staff operation issue and publishes issue.created', async () => {
    const stream = { write: jest.fn() };
    service.addStreamClient(stream as any);

    prisma.operationIssue.findFirst.mockResolvedValue(null);
    prisma.operationIssue.create.mockResolvedValue({ id: 'issue-1' });
    prisma.operationIssue.findUnique.mockResolvedValue(makeIssue());

    const result = await service.create(
      {
        type: OperationIssueType.payment_issue,
        severity: OperationIssueSeverity.warning,
        note: 'Payment terminal failed.',
        sessionId: 'session-1',
        paymentId: 'payment-1',
        plateNumber: '90b2-452.30',
      },
      'staff-1',
    );

    expect(prisma.operationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 'staff-1',
          plateNumber: '90B245230',
          source: 'staff',
        }),
      }),
    );
    expect(result.id).toBe('issue-1');
    expect(stream.write).toHaveBeenCalledWith(expect.stringContaining('event: issue.created'));
  });

  it('returns an existing open issue instead of creating a duplicate for the same context', async () => {
    prisma.operationIssue.findFirst.mockResolvedValue(makeIssue({ id: 'existing-issue' }));
    prisma.operationIssue.findUnique.mockResolvedValue(makeIssue({ id: 'existing-issue' }));

    const result = await service.create(
      {
        type: OperationIssueType.payment_issue,
        severity: OperationIssueSeverity.critical,
        note: 'Double click submit.',
        sessionId: 'session-1',
      },
      'staff-1',
    );

    expect(prisma.operationIssue.create).not.toHaveBeenCalled();
    expect(result.id).toBe('existing-issue');
  });

  it('summarizes open and in-review issues by severity', async () => {
    prisma.operationIssue.findMany.mockResolvedValue([
      { severity: OperationIssueSeverity.critical },
      { severity: OperationIssueSeverity.warning },
      { severity: OperationIssueSeverity.warning },
      { severity: OperationIssueSeverity.info },
    ]);

    await expect(service.getSummary()).resolves.toEqual({
      openTotal: 4,
      critical: 1,
      warning: 2,
      info: 1,
    });
  });

  it('lets a manager update issue status and publishes issue.updated', async () => {
    const stream = { write: jest.fn() };
    service.addStreamClient(stream as any);

    prisma.operationIssue.findUnique.mockResolvedValue(makeIssue());
    prisma.operationIssue.update.mockResolvedValue(
      makeIssue({
        status: OperationIssueStatus.in_review,
        reviewedById: 'manager-1',
      }),
    );

    const result = await service.update(
      'issue-1',
      { status: OperationIssueStatus.in_review },
      'manager-1',
    );

    expect(result.status).toBe(OperationIssueStatus.in_review);
    expect(prisma.operationIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewedById: 'manager-1',
          status: OperationIssueStatus.in_review,
        }),
      }),
    );
    expect(stream.write).toHaveBeenCalledWith(expect.stringContaining('event: issue.updated'));
  });

  it('throws NotFoundException when updating a missing issue', async () => {
    prisma.operationIssue.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', { status: OperationIssueStatus.resolved }, 'manager-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
