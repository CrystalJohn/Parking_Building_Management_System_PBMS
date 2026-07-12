import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/guards';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController RBAC', () => {
  let controller: AdminController;
  let guard: RolesGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            getSummary: jest.fn(),
            getReservationAudit: jest.fn(),
            getOperationsFlags: jest.fn(),
            getPendingPayments: jest.fn(),
            getSessionEvidence: jest.fn(),
            getSlotOccupancyMap: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get(AdminController);
    guard = new RolesGuard(module.get(Reflector));
  });

  it.each([Role.admin, Role.manager])('%s can access /admin/summary', (role) => {
    expect(canActivate(role, controller.getSummary, AdminController, guard)).toBe(true);
  });

  it.each([Role.staff, Role.driver])('%s cannot access /admin/summary', (role) => {
    expect(canActivate(role, controller.getSummary, AdminController, guard)).toBe(false);
  });

  it.each([Role.admin, Role.manager])('%s can access /admin/operations/flags', (role) => {
    expect(canActivate(role, controller.getOperationsFlags, AdminController, guard)).toBe(true);
  });

  it.each([Role.admin, Role.manager])('%s can access /admin/reservations/audit', (role) => {
    expect(canActivate(role, controller.getReservationAudit, AdminController, guard)).toBe(true);
  });

  it.each([Role.admin, Role.manager])('%s can access /admin/operations/pending-payments', (role) => {
    expect(canActivate(role, controller.getPendingPayments, AdminController, guard)).toBe(true);
  });

  it.each([Role.admin, Role.manager])('%s can access /admin/sessions/:sessionId/evidence', (role) => {
    expect(canActivate(role, controller.getSessionEvidence, AdminController, guard)).toBe(true);
  });

  it.each([Role.staff, Role.driver])('%s cannot access /admin/operations/pending-payments', (role) => {
    expect(canActivate(role, controller.getPendingPayments, AdminController, guard)).toBe(false);
  });

  it.each([Role.admin, Role.manager])('%s can access /admin/operations/slot-occupancy-map', (role) => {
    expect(canActivate(role, controller.getSlotOccupancyMap, AdminController, guard)).toBe(true);
  });

  it.each([Role.staff, Role.driver])('%s cannot access /admin/operations/slot-occupancy-map', (role) => {
    expect(canActivate(role, controller.getSlotOccupancyMap, AdminController, guard)).toBe(false);
  });

  it('rejects invalid reservation audit date format', () => {
    expect(() => controller.getReservationAudit('2026/07/04')).toThrow(
      'Invalid date format. Expected YYYY-MM-DD',
    );
  });
});

function canActivate(
  role: Role,
  handler: (...args: never[]) => unknown,
  controllerClass: object,
  guard: RolesGuard,
): boolean {
  const context = {
    getHandler: () => handler,
    getClass: () => controllerClass,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;

  return guard.canActivate(context);
}
