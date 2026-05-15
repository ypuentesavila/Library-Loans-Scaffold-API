import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

async function cleanDb(ds: DataSource) {
  await ds.query(`DELETE FROM reservations`);
  await ds.query(`DELETE FROM refresh_tokens`);
  await ds.query(`DELETE FROM loans`);
  await ds.query(`DELETE FROM items`);
  await ds.query(`DELETE FROM users`);
}

describe('Library Loans API (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let userId: string;
  let itemId: string;
  let loanId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();

    ds = module.get(DataSource);
    await cleanDb(ds);
  });

  afterAll(async () => {
    await cleanDb(ds);
    await app.close();
  });

  describe('Flow: register → login → items → loans → return', () => {
    it('POST /api/auth/register → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'e2e@test.com',
          password: 'password123',
          firstName: 'E2E',
          lastName: 'User',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      token = res.body.accessToken;
      userId = res.body.user.id;
    });

    it('POST /api/auth/login → 200 with accessToken + refreshToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'e2e@test.com', password: 'password123' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      token = res.body.accessToken;
    });

    it('POST /api/auth/refresh → 200 with new accessToken', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'e2e@test.com', password: 'password123' });

      const refreshToken = loginRes.body.refreshToken;

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it('POST /api/items → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'BK-E2E', title: 'Test Book', type: 'book' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.isAvailable).toBe(true);
      itemId = res.body.id;
    });

    it('POST /api/loans → 201', async () => {
      const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const res = await request(app.getHttpServer())
        .post('/api/loans')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId, itemId, dueAt })
        .expect(201);

      expect(res.body.status).toBe('active');
      loanId = res.body.id;
    });

    it('PATCH /api/loans/:id/return → 200 with fineAmount', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/loans/${loanId}/return`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('returned');
      expect(res.body.fineAmount).toBeDefined();
      expect(Number(res.body.fineAmount)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Loan FSM transitions (parametrized)', () => {
    let activeLoanId: string;
    let activeLoanId2: string;
    let returnedLoanId: string;
    let lostLoanId: string;

    beforeAll(async () => {
      const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

      const makeItem = async (code: string, title: string) => {
        const r = await request(app.getHttpServer())
          .post('/api/items')
          .set('Authorization', `Bearer ${token}`)
          .send({ code, title, type: 'book' });
        return r.body.id;
      };

      const makeLoan = async (itemId: string) => {
        const r = await request(app.getHttpServer())
          .post('/api/loans')
          .set('Authorization', `Bearer ${token}`)
          .send({ userId, itemId, dueAt });
        return r.body.id;
      };

      const fsm1 = await makeItem('BK-FSM1', 'FSM Book 1');
      const fsm2 = await makeItem('BK-FSM2', 'FSM Book 2');
      const fsm3 = await makeItem('BK-FSM3', 'FSM Book 3');
      const fsm4 = await makeItem('BK-FSM4', 'FSM Book 4');

      activeLoanId = await makeLoan(fsm1);
      activeLoanId2 = await makeLoan(fsm2);

      returnedLoanId = await makeLoan(fsm3);
      await request(app.getHttpServer())
        .patch(`/api/loans/${returnedLoanId}/return`)
        .set('Authorization', `Bearer ${token}`);

      lostLoanId = await makeLoan(fsm4);
      await request(app.getHttpServer())
        .patch(`/api/loans/${lostLoanId}/mark-lost`)
        .set('Authorization', `Bearer ${token}`);
    });

    it.each([
      ['active → returned (valid)', () => activeLoanId, 'return', 200, 'returned'],
      ['active → lost (valid)', () => activeLoanId2, 'mark-lost', 200, 'lost'],
    ])('%s', async (_label, getId, action, expectedStatus, expectedState) => {
      const res = await request(app.getHttpServer())
        .patch(`/api/loans/${getId()}/${action}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(expectedStatus);

      expect(res.body.status).toBe(expectedState);
    });

    it.each([
      ['returned → returned (invalid)', () => returnedLoanId, 'return', 400],
      ['returned → lost (invalid)', () => returnedLoanId, 'mark-lost', 400],
      ['lost → returned (invalid)', () => lostLoanId, 'return', 400],
      ['lost → lost (invalid)', () => lostLoanId, 'mark-lost', 400],
    ])('%s', async (_label, getId, action, expectedStatus) => {
      await request(app.getHttpServer())
        .patch(`/api/loans/${getId()}/${action}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(expectedStatus);
    });
  });
});
