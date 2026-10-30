import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { SUPER, TENANT_A, resetDb, db, call, createCompany, createEmployee, insertUser } from './helpers/api';
import { currentMonthBounds } from '../src/routes/overview';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

const ANA = 'ana@empresa-a.com';

/**
 * A: periodo del mes en curso con 1 de 2 empleados liquidado, sin XML,
 *    un periodo viejo abierto y una solicitud pendiente.
 * B: periodo del mes en curso calculado, con XML y cerrado.
 * C: sin periodo del mes.
 */
async function scenario() {
  const { start, end } = currentMonthBounds(new Date());
  const a = await createCompany({ name: 'A Panadería' });
  const b = await createCompany({ name: 'B Ferretería', nit: '900999888' });
  const c = await createCompany({ name: 'C Taller', nit: '900777666' });
  insertUser(TENANT_A, 'TENANT_ADMIN', a.id);

  const ana = await createEmployee(a.id, { hireDate: '2025-01-01' });
  await createEmployee(a.id, { firstName: 'Luis', lastName: 'Pérez', taxId: '1061000222', hireDate: '2025-01-01' });
  const beto = await createEmployee(b.id, { firstName: 'Beto', lastName: 'Ruiz', taxId: '2000222', hireDate: '2025-01-01' });
  await createEmployee(c.id, { firstName: 'Carla', lastName: 'Díaz', taxId: '3000333', hireDate: '2025-01-01' });
  insertUser(ANA, 'EMPLOYEE', a.id, ana.id);

  const old = await call(SUPER, 'POST', '/api/payroll-periods', { companyId: a.id, periodStart: '2025-01-01', periodEnd: '2025-01-31' });
  expect(old.status).toBe(201);

  const pa = await call(SUPER, 'POST', '/api/payroll-periods', { companyId: a.id, periodStart: start, periodEnd: end });
  expect((await call(SUPER, 'POST', '/api/payroll-settlements/calculate', { periodId: pa.json.data.id, employeeId: ana.id, daysWorked: 30 })).status).toBe(201);

  const pb = await call(SUPER, 'POST', '/api/payroll-periods', { companyId: b.id, periodStart: start, periodEnd: end });
  const sb = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', { periodId: pb.json.data.id, employeeId: beto.id, daysWorked: 30 });
  const sbId = sb.json.data.id ?? sb.json.data.settlement?.id;
  expect((await call(SUPER, 'POST', `/api/payroll-settlements/${sbId}/generate-xml`)).status).toBe(200);
  expect((await call(SUPER, 'POST', `/api/payroll-periods/${pb.json.data.id}/close`)).status).toBe(200);

  expect((await call(ANA, 'POST', '/api/portal/requests', {
    requestType: 'PERMISSION', startDate: '2099-04-01', endDate: '2099-04-01', reason: 'Cita médica',
  })).status).toBe(201);

  return { a, b, c, start };
}

const codes = (row: any) => row.alerts.map((x: any) => x.code).sort();

describe('GET /api/overview', () => {
  test('una fila por empresa con el estado del mes y sus alertas', async () => {
    const { a, b, c, start } = await scenario();

    const res = await call(SUPER, 'GET', '/api/overview');
    expect(res.status).toBe(200);

    const rows = res.json.data.companies;
    expect(rows.map((r: any) => r.name)).toEqual(['A Panadería', 'C Taller', 'B Ferretería']); // más alertas primero

    const ra = rows.find((r: any) => r.companyId === a.id);
    expect(ra).toMatchObject({
      activeEmployees: 2,
      pendingRequests: 1,
      currentPeriod: { periodStart: start, status: 'DRAFT', settlements: 1, pendingXml: 1 },
    });
    expect(ra.openPastPeriods).toBe(1);
    expect(codes(ra)).toEqual(['OLD_PERIOD_OPEN', 'PENDING_REQUESTS', 'PENDING_XML', 'UNSETTLED_EMPLOYEES']);
    expect(ra.alerts.find((x: any) => x.code === 'UNSETTLED_EMPLOYEES').message).toMatch(/1 de 2/);
    expect(ra.lastActivityAt).toBeTruthy();

    const rb = rows.find((r: any) => r.companyId === b.id);
    expect(rb.currentPeriod).toMatchObject({ status: 'CLOSED', settlements: 1, pendingXml: 0 });
    expect(rb.alerts).toEqual([]);

    const rc = rows.find((r: any) => r.companyId === c.id);
    expect(rc.currentPeriod).toBeNull();
    expect(codes(rc)).toEqual(['NO_CURRENT_PERIOD']);

    expect(res.json.data.summary).toMatchObject({ companies: 3, withAlerts: 2, closedThisMonth: 1, activeEmployees: 4, pendingRequests: 1 });
  });

  test('el administrador de empresa sólo ve la suya; el empleado no entra', async () => {
    const { a } = await scenario();

    const mine = await call(TENANT_A, 'GET', '/api/overview');
    expect(mine.status).toBe(200);
    expect(mine.json.data.companies.map((r: any) => r.companyId)).toEqual([a.id]);

    expect((await call(ANA, 'GET', '/api/overview')).status).toBe(403);
  });

  test('alerta una quincena abierta aunque la última del mes esté cerrada, y un periodo vacío', async () => {
    const { start } = currentMonthBounds(new Date());
    const q1End = start.slice(0, 8) + '15';
    const q2Start = start.slice(0, 8) + '16';
    const company = await createCompany({ name: 'Q Quincenal' });
    const emp = await createEmployee(company.id, { hireDate: '2025-01-01' });

    const q1 = await call(SUPER, 'POST', '/api/payroll-periods', { companyId: company.id, periodStart: start, periodEnd: q1End });
    expect(q1.status).toBe(201);
    const q2 = await call(SUPER, 'POST', '/api/payroll-periods', { companyId: company.id, periodStart: q2Start, periodEnd: currentMonthBounds(new Date()).end });
    const s2 = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', { periodId: q2.json.data.id, employeeId: emp.id, daysWorked: 15 });
    await call(SUPER, 'POST', `/api/payroll-settlements/${s2.json.data.id ?? s2.json.data.settlement?.id}/generate-xml`);
    expect((await call(SUPER, 'POST', `/api/payroll-periods/${q2.json.data.id}/close`)).status).toBe(200);

    const row = (await call(SUPER, 'GET', '/api/overview')).json.data.companies[0];
    expect(row.currentPeriod.status).toBe('DRAFT');
    expect(codes(row)).toEqual(['PERIOD_WITHOUT_SETTLEMENTS']);
  });

  test('un administrador sin empresa asignada no ve nada', async () => {
    await scenario();
    insertUser('suelto@x.co', 'TENANT_ADMIN', null);
    expect((await call('suelto@x.co', 'GET', '/api/overview')).status).toBe(403);
  });

  test('una empresa inactiva no aparece', async () => {
    const { c } = await scenario();
    db.prepare(`UPDATE companies SET active = 0 WHERE id = ?`).run(c.id);

    const res = await call(SUPER, 'GET', '/api/overview');
    expect(res.json.data.companies.map((r: any) => r.companyId)).not.toContain(c.id);
  });
});

describe('currentMonthBounds', () => {
  test('usa el mes de Colombia (UTC-5)', () => {
    // 1-nov 02:00 UTC = 31-oct 21:00 en Bogotá.
    expect(currentMonthBounds(new Date('2026-11-01T02:00:00Z'))).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(currentMonthBounds(new Date('2028-02-15T12:00:00Z'))).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
});
