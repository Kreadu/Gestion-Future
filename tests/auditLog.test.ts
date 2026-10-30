import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { SUPER, TENANT_A, resetDb, db, call, createCompany, createEmployee, insertUser } from './helpers/api';

// tsconfig no incluye los tipos de Node (igual que tests/helpers/api.ts).
declare const require: (id: string) => any;
declare const __dirname: string;

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

const ADMIN_B = 'admin@empresa-b.com';
const ANA = 'ana@empresa-a.com';

/** Empresa A con un periodo calculado, con XML, cerrado y exportado. */
async function closedPeriod() {
  const a = await createCompany({ arlCode: '14-23' });
  const b = await createCompany({ name: 'Empresa B', nit: '900999888' });
  const ana = await createEmployee(a.id, { hireDate: '2026-01-05' });
  insertUser(TENANT_A, 'TENANT_ADMIN', a.id);
  insertUser(ADMIN_B, 'TENANT_ADMIN', b.id);
  insertUser(ANA, 'EMPLOYEE', a.id, ana.id);

  const period = await call(TENANT_A, 'POST', '/api/payroll-periods', { companyId: a.id, periodStart: '2026-10-01', periodEnd: '2026-10-31' });
  const periodId = period.json.data.id;
  const calc = await call(TENANT_A, 'POST', '/api/payroll-settlements/calculate', { periodId, employeeId: ana.id, daysWorked: 30 });
  const settlementId = calc.json.data.id ?? calc.json.data.settlement?.id;
  expect((await call(TENANT_A, 'POST', `/api/payroll-settlements/${settlementId}/generate-xml`)).status).toBe(200);
  expect((await call(TENANT_A, 'POST', `/api/payroll-periods/${periodId}/close`)).status).toBe(200);
  expect((await call(TENANT_A, 'POST', `/api/payroll-periods/${periodId}/bank-disbursement`)).status).toBe(200);
  // La vista previa no se registra; la descarga (download=1) sí.
  expect((await call(TENANT_A, 'GET', `/api/payroll-periods/${periodId}/pila`)).status).toBe(200);
  expect((await call(TENANT_A, 'GET', `/api/payroll-periods/${periodId}/accounting`)).status).toBe(200);
  expect((await call(TENANT_A, 'GET', `/api/payroll-periods/${periodId}/pila?download=1`)).status).toBe(200);
  expect((await call(TENANT_A, 'GET', `/api/payroll-periods/${periodId}/accounting?download=1`)).status).toBe(200);

  return { a, b, periodId };
}

const log = (as: string, qs: string) => call(as, 'GET', `/api/audit-log?${qs}`);

describe('GET /api/audit-log', () => {
  test('el administrador ve la actividad de su empresa, la más reciente primero, con acciones específicas', async () => {
    const { a, periodId } = await closedPeriod();

    const res = await log(TENANT_A, `companyId=${a.id}`);
    expect(res.status).toBe(200);

    const entries = res.json.data.entries;
    const actions = entries.map((e: any) => `${e.action} ${e.entity}`);

    // Acciones del mismo milisegundo pueden salir en cualquier orden
    // entre sí: se comparan las cinco últimas como conjunto.
    expect([...actions.slice(0, 5)].sort()).toEqual([
      'CLOSE payroll_period',
      'EXPORT accounting',
      'EXPORT bank_file',
      'EXPORT pila',
      'GENERATE_XML payroll_settlement',
    ]);
    expect(actions).toContain('CREATE payroll_period');
    const accounting = entries.find((e: any) => e.entity === 'accounting');
    expect(accounting).toMatchObject({ email: TENANT_A, entityId: periodId, companyId: a.id });
    expect(accounting.description).toBe('Descargó el comprobante contable');
    expect(entries.every((e: any, i: number) => i === 0 || e.at <= entries[i - 1].at)).toBe(true);
  });

  test('filtra por tipo de registro y pagina con nextBefore', async () => {
    const { a } = await closedPeriod();

    const exports = await log(TENANT_A, `companyId=${a.id}&action=EXPORT`);
    expect(exports.json.data.entries).toHaveLength(3);

    const page1 = await log(TENANT_A, `companyId=${a.id}&limit=2`);
    expect(page1.json.data.entries).toHaveLength(2);
    expect(page1.json.data.nextBefore).toBeTruthy();

    const page2 = await log(TENANT_A, `companyId=${a.id}&limit=2&before=${encodeURIComponent(page1.json.data.nextBefore)}`);
    const ids1 = page1.json.data.entries.map((e: any) => e.id);
    const ids2 = page2.json.data.entries.map((e: any) => e.id);
    expect(ids2).toHaveLength(2);
    expect(ids2.some((id: string) => ids1.includes(id))).toBe(false);
  });

  test('los filtros de fecha son días de Colombia (UTC-5)', async () => {
    const { a } = await closedPeriod();
    const insert = (id: string, at: string) => db.prepare(
      `INSERT INTO audit_log (id, at, email, action, entity, entityId, companyId) VALUES (?, ?, 'x@y.co', 'CREATE', 'employee', ?, ?)`
    ).run(id, at, id, a.id);

    // 10-mar-2025 20:00 en Bogotá = 11-mar 01:00 UTC.
    insert('AUD-noche', '2025-03-11T01:00:00.000Z');
    // 11-mar 06:00 en Bogotá = 11-mar 11:00 UTC.
    insert('AUD-manana', '2025-03-11T11:00:00.000Z');

    const day10 = await log(TENANT_A, `companyId=${a.id}&action=CREATE&entity=employee&from=2025-03-10&to=2025-03-10`);
    expect(day10.json.data.entries.map((e: any) => e.id)).toEqual(['AUD-noche']);

    const day11 = await log(TENANT_A, `companyId=${a.id}&action=CREATE&entity=employee&from=2025-03-11&to=2025-03-11`);
    expect(day11.json.data.entries.map((e: any) => e.id)).toEqual(['AUD-manana']);
  });

  test('migración 0014: los cierres viejos (UPDATE payroll_period) pasan a CLOSE', async () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    db.prepare(`INSERT INTO audit_log (id, at, action, entity) VALUES ('AUD-viejo', '2026-01-01', 'UPDATE', 'payroll_period')`).run();
    db.exec(readFileSync(join(__dirname, '..', 'migrations', '0014_audit_log_actions.sql'), 'utf8'));
    expect((db.prepare(`SELECT action FROM audit_log WHERE id = 'AUD-viejo'`).get() as any).action).toBe('CLOSE');
  });

  test('aislamiento: otra empresa y empleados reciben 403; sin companyId sólo el SUPER_ADMIN', async () => {
    const { a } = await closedPeriod();

    expect((await log(ADMIN_B, `companyId=${a.id}`)).status).toBe(403);
    expect((await log(ANA, `companyId=${a.id}`)).status).toBe(403);
    expect((await log(TENANT_A, '')).status).toBe(400);

    const all = await log(SUPER, '');
    expect(all.status).toBe(200);
    // Incluye la creación de ambas empresas, que hizo el SUPER_ADMIN.
    expect(all.json.data.entries.filter((e: any) => e.entity === 'company' && e.action === 'CREATE')).toHaveLength(2);
    expect(all.json.data.entries.find((e: any) => e.companyId === a.id).companyName).toBe('Empresa A S.A.S.');
  });
});
