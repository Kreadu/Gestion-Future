import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { SUPER, resetDb, db, call, createCompany, insertUser } from './helpers/api';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

async function partTimeEngagement() {
  const company = await createCompany();
  db.prepare(`INSERT INTO professionals (id, firstName, lastName, taxId, profession) VALUES ('PRO-1', 'Marta', 'Ruiz', '1061000888', 'Contadora')`).run();
  db.prepare(`INSERT INTO engagements (id, professionalId, companyId, vinculationType, hourlyRate, startDate, weeklyHours, contractType)
              VALUES ('ENG-1', 'PRO-1', ?, 'PART_TIME_EMPLOYEE', 20000, '2026-01-01', 20, '2')`).run(company.id);
  db.prepare(`INSERT INTO time_entries (id, engagementId, periodStart, periodEnd, hours, createdAt)
              VALUES ('TE-1', 'ENG-1', '2026-10-01', '2026-10-31', 80, '2026-10-31')`).run();
  return company;
}

const liquidate = (periodStart: string, periodEnd: string) =>
  call(SUPER, 'POST', '/api/hourly/settlements/calculate', { engagementId: 'ENG-1', periodStart, periodEnd });

describe('POST /api/hourly/settlements/calculate · una liquidación por periodo', () => {
  test('rechaza liquidar de nuevo un periodo que se cruza con uno ya liquidado, sin gastar consecutivo DIAN', async () => {
    await partTimeEngagement();

    const first = await liquidate('2026-10-01', '2026-10-31');
    expect(first.status).toBe(201);

    const consecutives = () => (db.prepare(`SELECT COALESCE(SUM(lastConsecutive), 0) AS n FROM dian_counters`).get() as any).n;
    const before = consecutives();

    const again = await liquidate('2026-10-01', '2026-10-31');
    expect(again.status).toBe(409);
    expect(again.json.error).toMatch(/ya tiene una liquidación del 2026-10-01 al 2026-10-31/);

    const overlapping = await liquidate('2026-10-15', '2026-11-15');
    expect(overlapping.status).toBe(409);

    expect(consecutives()).toBe(before);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM settlements`).get() as any).n).toBe(1);
  });

  test('anular una liquidación permite rehacerla; otra empresa no puede anularla', async () => {
    await partTimeEngagement();
    const first = await liquidate('2026-10-01', '2026-10-31');

    insertUser('admin@otra.co', 'TENANT_ADMIN', (await createCompany({ name: 'Otra', nit: '900555444' })).id);
    expect((await call('admin@otra.co', 'DELETE', `/api/hourly/settlements/${first.json.data.id}`)).status).toBe(403);

    expect((await call(SUPER, 'DELETE', `/api/hourly/settlements/${first.json.data.id}`)).status).toBe(200);
    expect((await liquidate('2026-10-01', '2026-10-31')).status).toBe(201);
  });
});
