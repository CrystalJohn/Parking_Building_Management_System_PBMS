/**
 * Bảo mật — Kiểm soát truy cập (Access Control) e2e
 * -------------------------------------------------------------
 * Mục tiêu: đảm bảo MỘT USER KHÔNG TRUY CẬP ĐƯỢC DỮ LIỆU CỦA USER KHÁC.
 *
 * Bao phủ 3 lớp kiểm soát truy cập:
 *   A. Horizontal (BOLA / IDOR): driver B không xem/không thao tác được
 *      tài nguyên thuộc sở hữu của driver A. Quy ước dự án: trả 404
 *      (KHÔNG phải 403) để không lộ "ID tồn tại nhưng không phải của bạn".
 *   B. Vertical (RBAC): driver không truy cập được endpoint dành cho admin.
 *   C. Authentication: không có token / token sai bị chặn (401).
 *
 * Chạy: `npm run test -- access-control.security` (trong apps/api)
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Role, VehicleType, SessionStatus } from '@prisma/client';

describe('Bảo mật — Kiểm soát truy cập giữa các user (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Tokens
  let driverAToken: string;
  let driverBToken: string;
  let adminToken: string;

  // IDs của tài nguyên thuộc sở hữu Driver A
  let driverAId: string;
  let sessionAId: string;
  let subscriptionAId: string;

  const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get(JwtService);
    await app.init();

    // --- Tạo Driver A (chủ sở hữu dữ liệu) ---
    const driverA = await prisma.user.create({
      data: {
        email: `ac-driver-a-${uniq()}@pbms.local`,
        username: `ac-driver-a-${uniq()}`,
        phone: `090${Math.random().toString().slice(2, 9)}`,
        passwordHash: 'hash',
        role: Role.driver,
        fullName: 'AC Driver A',
        isActive: true,
      },
    });
    driverAId = driverA.id;

    // --- Tạo Driver B (kẻ tấn công / user khác) ---
    const driverB = await prisma.user.create({
      data: {
        email: `ac-driver-b-${uniq()}@pbms.local`,
        username: `ac-driver-b-${uniq()}`,
        phone: `091${Math.random().toString().slice(2, 9)}`,
        passwordHash: 'hash',
        role: Role.driver,
        fullName: 'AC Driver B',
        isActive: true,
      },
    });

    // --- Tạo Admin ---
    const admin = await prisma.user.create({
      data: {
        email: `ac-admin-${uniq()}@pbms.local`,
        username: `ac-admin-${uniq()}`,
        phone: `092${Math.random().toString().slice(2, 9)}`,
        passwordHash: 'hash',
        role: Role.admin,
        fullName: 'AC Admin',
        isActive: true,
      },
    });

    driverAToken = jwtService.sign({ sub: driverA.id, role: Role.driver });
    driverBToken = jwtService.sign({ sub: driverB.id, role: Role.driver });
    adminToken = jwtService.sign({ sub: admin.id, role: Role.admin });

    // --- Xe của Driver A ---
    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber: `51A${Date.now().toString().slice(-6)}`,
        vehicleType: VehicleType.car,
      },
    });
    await prisma.vehicleUser.create({
      data: { vehicleId: vehicle.id, userId: driverA.id, role: 'driver' },
    });

    // --- Parking session thuộc Driver A ---
    const slot = await prisma.slot.findFirst();
    const staff = await prisma.user.findFirst({ where: { role: Role.staff } });
    const sessionA = await prisma.parkingSession.create({
      data: {
        sessionCode: `ACSEC${uniq()}`,
        licensePlate: vehicle.plateNumber,
        plateNumberOcr: vehicle.plateNumber,
        plateNumberConfirmed: vehicle.plateNumber,
        vehicleType: VehicleType.car,
        driverId: driverA.id,
        vehicleId: vehicle.id,
        slotId: slot.id,
        status: SessionStatus.active,
        checkInTime: new Date(),
        checkedInById: staff.id,
        allocationStrategy: 'nearest_free',
      },
    });
    sessionAId = sessionA.id;

    // --- Subscription thuộc Driver A (gắn với xe của A) ---
    const subscriptionA = await prisma.subscription.create({
      data: {
        vehicleId: vehicle.id,
        planType: 'monthly',
        status: 'pending',
        createdById: driverA.id,
      },
    });
    subscriptionAId = subscriptionA.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // A. HORIZONTAL ACCESS CONTROL (BOLA / IDOR)
  //    Driver B không được chạm vào dữ liệu của Driver A.
  // ============================================================
  describe('A. Horizontal — Driver B không truy cập được dữ liệu của Driver A', () => {
    it('A1a: Driver A xem session của chính mình → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', sessionAId);
    });

    it('A1b: Driver B xem session của Driver A → 404 (KHÔNG phải 403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('A1c: Driver B lấy QR session của Driver A → 404', async () => {
      await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}/qr`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(404);
    });

    it('A2a: Driver A xem payment-status subscription của mình → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/subscriptions/${subscriptionAId}/payment-status`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', subscriptionAId);
    });

    it('A2b: Driver B xem payment-status subscription của Driver A → 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/subscriptions/${subscriptionAId}/payment-status`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('A3: GET /subscriptions/my của Driver B KHÔNG chứa subscription của Driver A', async () => {
      const res = await request(app.getHttpServer())
        .get('/subscriptions/my')
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((s: any) => s.id);
      expect(ids).not.toContain(subscriptionAId);
    });

    it('A4: GET /sessions/my-active của Driver B KHÔNG chứa session của Driver A', async () => {
      const res = await request(app.getHttpServer())
        .get('/sessions/my-active')
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((s: any) => s.id);
      expect(ids).not.toContain(sessionAId);
      // và mọi bản ghi trả về đều không thuộc Driver A
      res.body.forEach((s: any) => {
        if (s.driverId) expect(s.driverId).not.toEqual(driverAId);
      });
    });
  });

  // ============================================================
  // B. VERTICAL ACCESS CONTROL (RBAC)
  //    Driver không được dùng endpoint quản trị (admin-only).
  // ============================================================
  describe('B. Vertical — Driver không truy cập được endpoint admin', () => {
    it('B1: Driver GET /users (admin-only) → 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${driverAToken}`)
        .expect(403);
    });

    it('B2: Driver POST /users (admin-only) → 403', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${driverAToken}`)
        .send({
          username: `hacker-${uniq()}`,
          phone: `097${Math.random().toString().slice(2, 9)}`,
          password: 'Password123!',
          fullName: 'Should Not Be Created',
          role: Role.admin,
        })
        .expect(403);
    });

    it('B3: Driver DELETE /users/:id (deactivate user khác) → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${driverAId}`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(403);
    });

    it('B4 (control): Admin GET /users → 200 (không bị chặn nhầm)', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ============================================================
  // C. AUTHENTICATION
  //    Không token / token sai không được truy cập tài nguyên user.
  // ============================================================
  describe('C. Authentication — chặn truy cập ẩn danh / token không hợp lệ', () => {
    it('C1: Không có token → GET /sessions/:id → 401', async () => {
      await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}`)
        .expect(401);
    });

    it('C2: Token không hợp lệ → GET /sessions/:id → 401', async () => {
      await request(app.getHttpServer())
        .get(`/sessions/${sessionAId}`)
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });

    it('C3: Không có token → GET /subscriptions/my → 401', async () => {
      await request(app.getHttpServer())
        .get('/subscriptions/my')
        .expect(401);
    });
  });
});
