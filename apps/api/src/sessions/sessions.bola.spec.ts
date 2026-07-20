/**
 * Section 7 — Bảo mật: Ownership Check (BOLA fix)
 * Verifies that drivers requesting another driver's resource get 404 (not 403).
 * This prevents ID enumeration: a 403 would reveal "exists but not yours",
 * while 404 hides whether the ID exists.
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { Role, VehicleType, SessionStatus } from '@prisma/client';

import { JwtService } from '@nestjs/jwt';

describe('Section 7 — BOLA: Ownership Check (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let driverAToken: string;
  let driverBToken: string;
  let sessionAId: string;
  let sessionACode: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get(JwtService);
    await app.init();

    // Create Driver A
    const driverA = await prisma.user.create({
      data: {
        email: `driver-a-${Date.now()}@pbms.local`,
        username: `driver-a-${Date.now()}`,
        phone: `090${Math.random().toString().slice(2, 9)}`,
        passwordHash: 'hash',
        role: Role.driver,
        fullName: 'Driver A',
        isActive: true,
      },
    });

    // Create Driver B
    const driverB = await prisma.user.create({
      data: {
        email: `driver-b-${Date.now()}@pbms.local`,
        username: `driver-b-${Date.now()}`,
        phone: `091${Math.random().toString().slice(2, 9)}`,
        passwordHash: 'hash',
        role: Role.driver,
        fullName: 'Driver B',
        isActive: true,
      },
    });

    // Mock JWT tokens (simplified — in real e2e you'd call auth endpoint)
    driverAToken = jwtService.sign({ sub: driverA.id, role: Role.driver });
    driverBToken = jwtService.sign({ sub: driverB.id, role: Role.driver });

    // Create a session for Driver A
    const floor = await prisma.floor.findFirst();
    const slot = await prisma.slot.findFirst();
    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber: `99X${Date.now().toString().slice(-6)}`,
        vehicleType: VehicleType.car,
      },
    });

    const sessionA = await prisma.parkingSession.create({
      data: {
        sessionCode: `TEST${Date.now()}`,
        licensePlate: vehicle.plateNumber,
        plateNumberOcr: vehicle.plateNumber,
        plateNumberConfirmed: vehicle.plateNumber,
        vehicleType: VehicleType.car,
        driverId: driverA.id,
        vehicleId: vehicle.id,
        slotId: slot.id,
        status: SessionStatus.active,
        checkInTime: new Date(),
        checkedInById: (await prisma.user.findFirst({ where: { role: Role.staff } })).id,
        allocationStrategy: 'nearest_free',
      },
    });

    sessionAId = sessionA.id;
    sessionACode = sessionA.sessionCode;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('7.2 — GET /sessions/:id ownership check', () => {
    it('7.2.1: Driver A retrieves own session → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', sessionAId);
      expect(res.body.driverId).toEqual(expect.any(String)); // should have driverId
    });

    it('7.2.2: Driver B requests Driver A session → 404 (not 403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(404); // ← KEY: must be 404, not 403

      expect(res.body.message).toMatch(/not found/i);
    });

    it('7.2.3: Invalid session ID → 404', async () => {
      const invalidId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/sessions/${invalidId}`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .expect(404);
    });
  });

  describe('7.3 — GET /sessions/:id/qr ownership check', () => {
    it('7.3.1: Driver A retrieves own session QR → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}/qr`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('sessionId', sessionAId);
      expect(res.body).toHaveProperty('qrCode');
    });

    it('7.3.2: Driver B requests Driver A session QR → 404 (not 403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}/qr`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(404); // ← KEY: must be 404, not 403

      expect(res.body.message).toMatch(/not found/i);
    });
  });

  describe('7.5 — Staff checkout-lookup still works (no breakage)', () => {
    it('7.5.1: Staff can lookup session for checkout', async () => {
      const staff = await prisma.user.findFirst({ where: { role: Role.staff } });
      const staffToken = jwtService.sign({
        sub: staff.id,
        role: Role.staff,
      });

      const res = await request(app.getHttpServer())
        .get(`/sessions/checkout-lookup?sessionCode=${sessionACode}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });
});
