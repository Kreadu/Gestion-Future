import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import {
  SUPER,
  TENANT_A,
  resetDb,
  call,
  createCompany,
  createEmployee,
  insertUser,
} from './helpers/api';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

const AFFILIATION = { epsCode: 'EPS037', afpCode: '230301', ccfCode: 'CCF22' };

async function periodWith(employeeExtra: Record<string, unknown> = {}, companyExtra: Record<string, unknown> = { arlCode: '14-23' }) {
  const company = await createCompany(companyExtra);
  const emp = await createEmployee(company.id, { hireDate: '2026-01-05', ...AFFILIATION, ...employeeExtra });

  const period = await call(SUPER, 'POST', '/api/payroll-periods', {
    companyId: company.id,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  });

  return { company, emp, periodId: period.json.data.id as string };
}

async function calculate(periodId: string, employeeId: string) {
  const res = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', { periodId, employeeId, daysWorked: 30 });
  expect(res.status).toBe(201);
  return res.json.data;
}

async function generateXml(settlementId: string) {
  const res = await call(SUPER, 'POST', `/api/payroll-settlements/${settlementId}/generate-xml`);
  expect(res.status).toBeLessThan(300);
}

const review = (periodId: string, as = SUPER) =>
  call(as, 'GET', `/api/payroll-periods/${periodId}/close-review`);

const codes = (items: { code: string }[]) => items.map(i => i.code);

describe('GET /api/payroll-periods/:id/close-review', () => {
  test('sin liquidaciones: bloquea el cierre', async () => {
    const { periodId } = await periodWith();

    const res = await review(periodId);
    expect(res.status).toBe(200);
    expect(res.json.data.canClose).toBe(false);
    expect(codes(res.json.data.blockers)).toEqual(['NO_SETTLEMENTS']);
  });

  test('liquidación sin XML DIAN: bloquea; con XML y datos completos: se puede cerrar', async () => {
    const { emp, periodId } = await periodWith();
    const settlement = await calculate(periodId, emp.id);

    const pending = await review(periodId);
    expect(pending.json.data.canClose).toBe(false);
    expect(codes(pending.json.data.blockers)).toEqual(['DIAN_PENDING']);

    await generateXml(settlement.id);

    const ok = await review(periodId);
    expect(ok.json.data).toMatchObject({ canClose: true, blockers: [], warnings: [] });
    expect(ok.json.data.totals.settlements).toBe(1);
    expect(ok.json.data.totals.netPay).toBeGreaterThan(0);
    expect(ok.json.data.totals.grossEarnings).toBeGreaterThan(ok.json.data.totals.netPay);
  });

  test('avisa (sin bloquear) datos bancarios, afiliaciones, ARL y empleados sin liquidar', async () => {
    const { company, emp, periodId } = await periodWith(
      { bankAccountNumber: '', epsCode: '', ccfCode: '' },
      {}
    );
    await createEmployee(company.id, { firstName: 'Luis', lastName: 'Pérez', taxId: '1061000222', hireDate: '2026-02-01', ...AFFILIATION });

    const settlement = await calculate(periodId, emp.id);
    await generateXml(settlement.id);

    const res = await review(periodId);
    expect(res.json.data.canClose).toBe(true);
    expect(codes(res.json.data.warnings).sort()).toEqual(
      ['COMPANY_NO_ARL', 'MISSING_BANK_ACCOUNT', 'MISSING_PILA_AFFILIATION', 'NOT_SETTLED'].sort()
    );

    const affiliation = res.json.data.warnings.find((w: any) => w.code === 'MISSING_PILA_AFFILIATION');
    expect(affiliation.message).toMatch(/EPS/);
    expect(affiliation.message).toMatch(/EPS y caja de compensación/);
    expect(affiliation.message).not.toMatch(/pensiones/);

    const notSettled = res.json.data.warnings.find((w: any) => w.code === 'NOT_SETTLED');
    expect(notSettled.message).toMatch(/Luis/);
  });

  test('avisa una incapacidad registrada entre el cálculo y el XML (ya no se puede recalcular)', async () => {
    const { emp, periodId } = await periodWith();
    const settlement = await calculate(periodId, emp.id);

    const leave = await call(SUPER, 'POST', '/api/employee-leaves', {
      employeeId: emp.id,
      leaveType: 'GENERAL_INCAPACITY',
      startDate: '2026-10-20',
      endDate: '2026-10-22',
    });
    expect(leave.status).toBe(201);

    const beforeXml = await review(periodId);
    const pending = beforeXml.json.data.warnings.find((w: any) => w.code === 'LEAVE_NOT_IN_SETTLEMENT');
    expect(pending.message).toMatch(/recalcula su nómina/);

    await generateXml(settlement.id);

    const res = await review(periodId);
    expect(codes(res.json.data.warnings)).toEqual(['LEAVE_NOT_IN_SETTLEMENT']);
    expect(res.json.data.warnings[0].message).toMatch(/2026-10-20 al 2026-10-22.*ajuste en el próximo periodo/);
  });

  test('una novedad incluida en el cálculo no genera aviso; si se borra después, sí', async () => {
    const { emp, periodId } = await periodWith();
    const leave = await call(SUPER, 'POST', '/api/employee-leaves', {
      employeeId: emp.id,
      leaveType: 'GENERAL_INCAPACITY',
      startDate: '2026-10-05',
      endDate: '2026-10-07',
    });
    expect(leave.status).toBe(201);

    const settlement = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', { periodId, employeeId: emp.id, daysWorked: 27 });
    expect(settlement.status).toBe(201);
    await generateXml(settlement.json.data.id);

    expect((await review(periodId)).json.data.warnings).toEqual([]);

    const removed = await call(SUPER, 'DELETE', `/api/employee-leaves/${leave.json.data.id}`);
    expect(removed.status).toBe(200);

    expect(codes((await review(periodId)).json.data.warnings)).toEqual(['LEAVE_REMOVED_AFTER_SETTLEMENT']);
  });

  test('periodo cerrado: bloquea con PERIOD_CLOSED', async () => {
    const { emp, periodId } = await periodWith();
    const settlement = await calculate(periodId, emp.id);
    await generateXml(settlement.id);

    const close = await call(SUPER, 'POST', `/api/payroll-periods/${periodId}/close`);
    expect(close.status).toBe(200);

    const res = await review(periodId);
    expect(res.json.data.canClose).toBe(false);
    expect(codes(res.json.data.blockers)).toEqual(['PERIOD_CLOSED']);

    const again = await call(SUPER, 'POST', `/api/payroll-periods/${periodId}/close`);
    expect(again.status).toBe(400);
  });

  test('el cierre respeta los mismos bloqueos', async () => {
    const { emp, periodId } = await periodWith();

    const empty = await call(SUPER, 'POST', `/api/payroll-periods/${periodId}/close`);
    expect(empty.status).toBe(400);
    expect(empty.json.error).toMatch(/no tiene liquidaciones/);

    await calculate(periodId, emp.id);
    const pending = await call(SUPER, 'POST', `/api/payroll-periods/${periodId}/close`);
    expect(pending.status).toBe(400);
    expect(pending.json.error).toMatch(/XML DIAN/);
  });

  test('aislamiento: un administrador de otra empresa recibe 403', async () => {
    const { periodId } = await periodWith();
    const other = await createCompany({ name: 'Empresa B', nit: '900999888' });
    insertUser(TENANT_A, 'TENANT_ADMIN', other.id);

    const res = await review(periodId, TENANT_A);
    expect(res.status).toBe(403);
  });

  test('periodo inexistente: 404', async () => {
    const res = await review('NO-EXISTE');
    expect(res.status).toBe(404);
  });
});
