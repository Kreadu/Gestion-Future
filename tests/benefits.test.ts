import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { CONSTANTS_2026 } from '../src/engine/countries/constants2026';
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

const AUX = CONSTANTS_2026.AUXILIO_TRANSPORTE;

describe('Vacaciones disfrutadas', () => {
  test('se registran con días hábiles automáticos y descuentan del saldo', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id, { hireDate: '2025-01-01' });

    const leave = await call(SUPER, 'POST', '/api/employee-leaves', {
      employeeId: emp.id,
      leaveType: 'VACATION',
      startDate: '2026-12-14',
      endDate: '2026-12-31',
    });

    expect(leave.status).toBe(201);
    expect(leave.json.data.businessDays).toBe(15);

    const balance = await call(SUPER, 'GET', `/api/employees/${emp.id}/vacation-balance?asOf=2026-12-31`);

    expect(balance.json.data).toEqual({
      asOf: '2026-12-31',
      accruedDays: 30,
      takenDays: 15,
      pendingDays: 15,
    });
  });

  test('en la nómina se pagan como días no trabajados al 100 % y sin recobro', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id, { hireDate: '2025-01-01', salary: 3_000_000 });

    await call(SUPER, 'POST', '/api/employee-leaves', {
      employeeId: emp.id,
      leaveType: 'VACATION',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
    });

    const period = await call(SUPER, 'POST', '/api/payroll-periods', {
      companyId: a.id,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    const calc = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', {
      periodId: period.json.data.id,
      employeeId: emp.id,
      daysWorked: 20,
    });

    expect(calc.status).toBe(201);
    const r = calc.json.data.calculation ?? calc.json.data;
    expect(r.leaveValue).toBeCloseTo(1_000_000, 0);
    expect(r.reimbursableAmount).toBe(0);
    expect(r.leaveDetails[0]).toMatchObject({
      type: 'VACATION',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
      days: 10,
    });
  });
});

describe('Prima y cesantías', () => {
  test('prima del semestre por empleado, proporcional al ingreso, y no se registra dos veces', async () => {
    const a = await createCompany();
    await createEmployee(a.id, { hireDate: '2025-01-01', salary: 2_000_000 });
    await createEmployee(a.id, { hireDate: '2026-04-01', salary: 2_000_000, taxId: '2', firstName: 'Beto' });

    const preview = await call(SUPER, 'POST', '/api/benefits/calculate', {
      companyId: a.id,
      benefitType: 'PRIMA',
      year: 2026,
      semester: 1,
    });

    const [ana, beto] = preview.json.data.rows;
    expect(ana.days).toBe(180);
    expect(ana.amount).toBeCloseTo((2_000_000 + AUX) / 2, 0);
    expect(beto.days).toBe(90);
    expect(beto.from).toBe('2026-04-01');

    const save = await call(SUPER, 'POST', '/api/benefits/calculate', {
      companyId: a.id, benefitType: 'PRIMA', year: 2026, semester: 1, save: true,
    });
    expect(save.json.data.saved).toBe(2);

    const again = await call(SUPER, 'POST', '/api/benefits/calculate', {
      companyId: a.id, benefitType: 'PRIMA', year: 2026, semester: 1, save: true,
    });
    expect(again.json.data.saved).toBe(0);

    const list = await call(SUPER, 'GET', `/api/benefit-payments?companyId=${a.id}`);
    expect(list.json.data).toHaveLength(2);
  });

  test('cesantías del año registran también los intereses', async () => {
    const a = await createCompany();
    await createEmployee(a.id, { hireDate: '2025-01-01', salary: 2_000_000 });

    const save = await call(SUPER, 'POST', '/api/benefits/calculate', {
      companyId: a.id, benefitType: 'CESANTIAS', year: 2026, save: true,
    });

    const row = save.json.data.rows[0];
    expect(row.amount).toBeCloseTo(2_000_000 + AUX, 0);
    expect(row.interest).toBeCloseTo((2_000_000 + AUX) * 0.12, 0);

    const list = await call(SUPER, 'GET', `/api/benefit-payments?companyId=${a.id}`);
    expect(list.json.data.map((p: any) => p.benefitType).sort()).toEqual(['CESANTIAS', 'INTERESES_CESANTIAS']);
  });

  test('otra empresa no puede calcular ni ver pagos ajenos', async () => {
    const a = await createCompany();
    const b = await createCompany({ name: 'B', nit: '900999888' });
    insertUser(TENANT_A, 'TENANT_ADMIN', a.id);

    const calc = await call(TENANT_A, 'POST', '/api/benefits/calculate', {
      companyId: b.id, benefitType: 'PRIMA', year: 2026, semester: 1,
    });
    const list = await call(TENANT_A, 'GET', `/api/benefit-payments?companyId=${b.id}`);

    expect(calc.status).toBe(403);
    expect(list.status).toBe(403);
  });
});

describe('Liquidación definitiva', () => {
  test('descuenta prima ya pagada, usa el saldo de vacaciones y retira al empleado', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id, { hireDate: '2025-01-01', salary: 2_000_000, contractType: '2' });

    await call(SUPER, 'POST', '/api/benefits/calculate', {
      companyId: a.id, benefitType: 'PRIMA', year: 2026, semester: 1, save: true,
    });

    const preview = await call(SUPER, 'POST', `/api/employees/${emp.id}/termination/preview`, {
      terminationDate: '2026-09-30',
      reason: 'DESPIDO_SIN_JUSTA_CAUSA',
    });

    expect(preview.status).toBe(200);
    const { input, result } = preview.json.data;
    expect(input.primaFrom).toBe('2026-07-01');
    expect(input.cesantiasFrom).toBe('2026-01-01');
    // 2025-01-01 a 2026-09-30: 630 días → 26,25 días hábiles.
    expect(input.vacationDaysPending).toBeCloseTo(26.25, 2);

    const concepts = result.lines.map((l: any) => l.concept);
    expect(concepts).toContain('Indemnización por despido sin justa causa (art. 64 CST)');
    const prima = result.lines.find((l: any) => l.concept === 'Prima de servicios');
    expect(prima.days).toBe(90);

    const save = await call(SUPER, 'POST', `/api/employees/${emp.id}/termination`, {
      terminationDate: '2026-09-30',
      reason: 'DESPIDO_SIN_JUSTA_CAUSA',
    });
    expect(save.status).toBe(201);

    const employees = await call(SUPER, 'GET', `/api/employees?companyId=${a.id}`);
    expect(employees.json.data.find((e: any) => e.id === emp.id)?.active ?? false).toBe(false);

    const stored = await call(SUPER, 'GET', `/api/employees/${emp.id}/termination`);
    expect(stored.json.data.reason).toBe('DESPIDO_SIN_JUSTA_CAUSA');

    const twice = await call(SUPER, 'POST', `/api/employees/${emp.id}/termination`, {
      terminationDate: '2026-09-30',
      reason: 'RENUNCIA',
    });
    expect(twice.status).toBe(400);
  });

  test('valida motivo y fecha', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id, { hireDate: '2025-01-01' });

    const bad = await call(SUPER, 'POST', `/api/employees/${emp.id}/termination/preview`, {
      terminationDate: '2026-09-30',
      reason: 'PORQUE_SI',
    });
    const before = await call(SUPER, 'POST', `/api/employees/${emp.id}/termination/preview`, {
      terminationDate: '2024-01-01',
      reason: 'RENUNCIA',
    });

    expect(bad.status).toBe(400);
    expect(before.status).toBe(400);
  });
});
