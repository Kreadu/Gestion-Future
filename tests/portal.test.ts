import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import {
  SUPER,
  TENANT_A,
  db,
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

const ANA = 'ana@empresa-a.com';
const BETO = 'beto@empresa-a.com';
const CARLA = 'carla@empresa-b.com';

/**
 * Empresa A con Ana y Beto (ambos con nómina, vacaciones y prima) y
 * empresa B con Carla. Cada uno tiene su usuario EMPLOYEE.
 */
async function scenario() {
  const a = await createCompany();
  const b = await createCompany({ name: 'Empresa B', nit: '900999888' });

  const ana = await createEmployee(a.id, {
    hireDate: '2025-01-01',
    position: 'Analista contable',
    salary: 3_000_000,
  });
  const beto = await createEmployee(a.id, {
    firstName: 'Beto',
    lastName: 'Ruiz',
    taxId: '2000222',
    hireDate: '2025-06-01',
    salary: 2_500_000,
    bankAccountNumber: '99988877766',
  });
  const carla = await createEmployee(b.id, {
    firstName: 'Carla',
    lastName: 'Díaz',
    taxId: '3000333',
    hireDate: '2024-01-01',
  });

  insertUser(ANA, 'EMPLOYEE', a.id, ana.id);
  insertUser(BETO, 'EMPLOYEE', a.id, beto.id);
  insertUser(CARLA, 'EMPLOYEE', b.id, carla.id);

  for (const emp of [ana, beto]) {
    const leave = await call(SUPER, 'POST', '/api/employee-leaves', {
      employeeId: emp.id,
      leaveType: 'VACATION',
      startDate: '2026-03-02',
      endDate: '2026-03-06',
    });
    expect(leave.status).toBe(201);
  }

  const period = await call(SUPER, 'POST', '/api/payroll-periods', {
    companyId: a.id,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  });
  expect(period.status).toBe(201);

  const settlements: Record<string, string> = {};

  for (const emp of [ana, beto]) {
    const calc = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', {
      periodId: period.json.data.id,
      employeeId: emp.id,
      daysWorked: 30,
    });
    expect(calc.status).toBe(201);
    settlements[emp.id] = calc.json.data.id ?? calc.json.data.settlement?.id;
  }

  const prima = await call(SUPER, 'POST', '/api/benefits/calculate', {
    companyId: a.id, benefitType: 'PRIMA', year: 2026, semester: 1, save: true,
  });
  expect(prima.json.data.saved).toBe(2);

  return { a, b, ana, beto, carla, periodId: period.json.data.id as string, settlements };
}

describe('Portal del empleado — sus datos', () => {
  test('ve su ficha, su saldo de vacaciones y sólo sus licencias; la cuenta va enmascarada', async () => {
    const { ana } = await scenario();

    const me = await call(ANA, 'GET', '/api/portal/me');

    expect(me.status).toBe(200);
    const { employee, company, vacationBalance, leaves } = me.json.data;

    expect(employee).toMatchObject({
      id: ana.id,
      fullName: 'Ana Gómez',
      taxId: '1061000111',
      position: 'Analista contable',
      hireDate: '2025-01-01',
      bankName: 'Bancolombia',
      bankAccountNumber: '*******8901',
    });
    expect(company.name).toBe('Empresa A S.A.S.');
    expect(JSON.stringify(me.json)).not.toContain('12345678901');

    expect(vacationBalance.takenDays).toBe(5);
    expect(vacationBalance.accruedDays).toBeGreaterThan(0);

    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ leaveType: 'VACATION', startDate: '2026-03-02' });
  });

  test('el saldo de vacaciones usa la misma lógica que el administrador', async () => {
    const { ana } = await scenario();

    const portal = await call(ANA, 'GET', '/api/portal/me');
    const admin = await call(SUPER, 'GET', `/api/employees/${ana.id}/vacation-balance`);

    expect(portal.json.data.vacationBalance).toEqual(admin.json.data);
  });
});

describe('Portal del empleado — desprendibles de pago', () => {
  test('lista sólo sus liquidaciones y ve el detalle', async () => {
    const { ana, settlements } = await scenario();

    const list = await call(ANA, 'GET', '/api/portal/payslips');

    expect(list.status).toBe(200);
    expect(list.json.data).toHaveLength(1);
    expect(list.json.data[0]).toMatchObject({
      id: settlements[ana.id],
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      periodStatus: 'DRAFT',
    });
    expect(list.json.data[0].netPay).toBeGreaterThan(0);

    const detail = await call(ANA, 'GET', `/api/portal/payslips/${settlements[ana.id]}`);

    expect(detail.status).toBe(200);
    expect(detail.json.data.calculation.employeeId).toBe(ana.id);
    expect(detail.json.data.calculation.employeeDeductions.health4pct).toBeGreaterThan(0);
    expect(detail.json.data).not.toHaveProperty('dianXmlContent');
  });

  test('no puede abrir el desprendible de un compañero', async () => {
    const { beto, settlements } = await scenario();

    const other = await call(ANA, 'GET', `/api/portal/payslips/${settlements[beto.id]}`);

    expect(other.status).toBe(404);
    expect(JSON.stringify(other.json)).not.toContain('Beto');
  });

  test('los parámetros del cliente no cambian de quién son los datos', async () => {
    const { beto, carla } = await scenario();

    for (const qs of [`employeeId=${beto.id}`, `employeeId=${carla.id}&companyId=${carla.companyId}`]) {
      const me = await call(ANA, 'GET', `/api/portal/me?${qs}`);
      const slips = await call(ANA, 'GET', `/api/portal/payslips?${qs}`);
      expect(me.json.data.employee.fullName).toBe('Ana Gómez');
      expect(slips.json.data).toHaveLength(1);
      expect(slips.json.data.every((s: any) => s.employeeId === me.json.data.employee.id)).toBe(true);
    }
  });

  test('un empleado de otra empresa no ve nada de la empresa A', async () => {
    await scenario();

    const slips = await call(CARLA, 'GET', '/api/portal/payslips');
    const benefits = await call(CARLA, 'GET', '/api/portal/benefits');
    const me = await call(CARLA, 'GET', '/api/portal/me');

    expect(slips.json.data).toEqual([]);
    expect(benefits.json.data.payments).toEqual([]);
    expect(me.json.data.company.name).toBe('Empresa B');
    expect(me.json.data.leaves).toEqual([]);
  });
});

describe('Portal del empleado — prestaciones, liquidación y certificado', () => {
  test('ve sus pagos de prima y su liquidación definitiva', async () => {
    const { ana } = await scenario();

    const before = await call(ANA, 'GET', '/api/portal/benefits');
    expect(before.status).toBe(200);
    expect(before.json.data.payments).toHaveLength(1);
    expect(before.json.data.payments[0]).toMatchObject({ benefitType: 'PRIMA', periodStart: '2026-01-01' });
    expect(before.json.data.termination).toBeNull();

    const term = await call(SUPER, 'POST', `/api/employees/${ana.id}/termination`, {
      terminationDate: '2026-11-15',
      reason: 'RENUNCIA',
    });
    expect(term.status).toBe(201);

    const after = await call(ANA, 'GET', '/api/portal/benefits');
    expect(after.json.data.termination).toMatchObject({ terminationDate: '2026-11-15', reason: 'RENUNCIA' });
    expect(after.json.data.termination.result.lines.length).toBeGreaterThan(0);

    // Retirado sigue entrando a su portal (sus documentos le pertenecen).
    const me = await call(ANA, 'GET', '/api/portal/me');
    expect(me.status).toBe(200);
    expect(me.json.data.employee.active).toBe(false);
  });

  test('no ve la liquidación definitiva de un compañero', async () => {
    const { beto } = await scenario();

    await call(SUPER, 'POST', `/api/employees/${beto.id}/termination`, {
      terminationDate: '2026-11-15',
      reason: 'RENUNCIA',
    });

    const mine = await call(ANA, 'GET', '/api/portal/benefits');
    expect(mine.json.data.termination).toBeNull();
  });

  test('certificado laboral con sus datos y los de la empresa', async () => {
    const { ana } = await scenario();

    const cert = await call(ANA, 'GET', '/api/portal/employment-certificate');

    expect(cert.status).toBe(200);
    expect(cert.json.data).toMatchObject({
      company: { name: 'Empresa A S.A.S.', nit: '900123456', dv: '7' },
      employee: {
        fullName: 'Ana Gómez',
        taxId: '1061000111',
        position: 'Analista contable',
        hireDate: '2025-01-01',
        salary: 3_000_000,
        active: true,
      },
    });
    expect(cert.json.data.employee.id).toBe(ana.id);
    expect(cert.json.data.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Portal del empleado — control de acceso', () => {
  test('administradores no usan las rutas del portal (ni el super admin)', async () => {
    const { a } = await scenario();
    insertUser(TENANT_A, 'TENANT_ADMIN', a.id);

    for (const who of [SUPER, TENANT_A]) {
      for (const path of ['/api/portal/me', '/api/portal/payslips', '/api/portal/benefits', '/api/portal/employment-certificate']) {
        const res = await call(who, 'GET', path);
        expect([who, path, res.status]).toEqual([who, path, 403]);
      }
    }
  });

  test('un EMPLOYEE sin empleado enlazado, o enlazado a otra empresa, recibe 403', async () => {
    const { a, carla } = await scenario();

    insertUser('suelto@empresa-a.com', 'EMPLOYEE', a.id, null);
    // Inconsistencia en la base: empresa A, pero el empleado es de B.
    insertUser('cruzado@empresa-a.com', 'EMPLOYEE', a.id, carla.id);

    for (const who of ['suelto@empresa-a.com', 'cruzado@empresa-a.com']) {
      const res = await call(who, 'GET', '/api/portal/me');
      expect([who, res.status]).toEqual([who, 403]);
      const slips = await call(who, 'GET', '/api/portal/payslips');
      expect([who, slips.status]).toEqual([who, 403]);
    }
  });

  test('sólo GET: no puede escribir en el portal', async () => {
    await scenario();

    const res = await call(ANA, 'POST', '/api/portal/me', { firstName: 'X' });
    expect([403, 404, 405]).toContain(res.status);
    expect(db.prepare(`SELECT firstName FROM employees WHERE taxId = '1061000111'`).get().firstName).toBe('Ana');
  });

  test('un EMPLOYEE recibe 403 en TODAS las rutas administrativas', async () => {
    const { a, b, ana, beto, periodId, settlements } = await scenario();

    const leaveId = db.prepare(`SELECT id FROM employee_leaves WHERE employeeId = ?`).get(ana.id).id;
    const paymentId = db.prepare(`SELECT id FROM benefit_payments WHERE employeeId = ?`).get(ana.id).id;
    const anaUserId = 'USR-' + ANA;

    const routes: [string, string, unknown?][] = [
      ['GET', '/api/companies'],
      ['POST', '/api/companies', { name: 'X', nit: '1' }],
      ['POST', '/api/companies', {}],
      ['PUT', `/api/companies/${a.id}`, { name: 'Hackeada' }],
      ['PUT', '/api/companies/NO-EXISTE', {}],
      ['DELETE', `/api/companies/${b.id}`],

      ['GET', `/api/employees?companyId=${a.id}`],
      ['GET', '/api/employees'],
      ['POST', '/api/employees', { companyId: a.id, firstName: 'X', lastName: 'Y', taxId: '9', salary: 2_000_000 }],
      ['POST', '/api/employees', {}],
      ['PUT', `/api/employees/${ana.id}`, { salary: 99_000_000 }],
      ['PUT', '/api/employees/NO-EXISTE', {}],
      ['DELETE', `/api/employees/${beto.id}`],
      ['GET', `/api/employees/${ana.id}/vacation-balance`],
      ['GET', `/api/employees/${beto.id}/vacation-balance`],
      ['GET', '/api/employees/NO-EXISTE/vacation-balance'],
      ['GET', `/api/employees/${ana.id}/termination`],
      ['POST', `/api/employees/${ana.id}/termination/preview`, { terminationDate: '2026-11-15', reason: 'RENUNCIA' }],
      ['POST', `/api/employees/${ana.id}/termination`, { terminationDate: '2026-11-15', reason: 'RENUNCIA' }],

      ['GET', `/api/employee-leaves?employeeId=${ana.id}`],
      ['GET', '/api/employee-leaves'],
      ['POST', '/api/employee-leaves', { employeeId: ana.id, leaveType: 'VACATION', startDate: '2026-12-01', endDate: '2026-12-05' }],
      ['POST', '/api/employee-leaves', {}],
      ['PUT', `/api/employee-leaves/${leaveId}`, { endDate: '2026-03-31' }],
      ['DELETE', `/api/employee-leaves/${leaveId}`],
      ['DELETE', '/api/employee-leaves/NO-EXISTE'],

      ['GET', `/api/payroll-periods?companyId=${a.id}`],
      ['GET', '/api/payroll-periods'],
      ['POST', '/api/payroll-periods', { companyId: a.id, periodStart: '2026-11-01', periodEnd: '2026-11-30' }],
      ['POST', '/api/payroll-periods', {}],
      ['POST', `/api/payroll-periods/${periodId}/close`],
      ['POST', '/api/payroll-periods/NO-EXISTE/close'],
      ['POST', `/api/payroll-periods/${periodId}/bank-disbursement`, {}],
      ['GET', `/api/payroll-settlements?periodId=${periodId}`],
      ['GET', '/api/payroll-settlements'],
      ['POST', '/api/payroll-settlements/calculate', { periodId, employeeId: ana.id, daysWorked: 30 }],
      ['POST', '/api/payroll-settlements/calculate', {}],
      ['POST', `/api/payroll-settlements/${settlements[ana.id]}/generate-xml`, {}],
      ['POST', '/api/payroll-settlements/NO-EXISTE/generate-xml', {}],

      ['GET', '/api/professionals'],
      ['POST', '/api/professionals', {}],
      ['PUT', '/api/professionals/NO-EXISTE', {}],
      ['GET', `/api/engagements?companyId=${a.id}`],
      ['GET', '/api/engagements'],
      ['POST', '/api/engagements', {}],
      ['PUT', '/api/engagements/NO-EXISTE', {}],
      ['DELETE', '/api/engagements/NO-EXISTE'],
      ['POST', '/api/time-entries', {}],
      ['POST', '/api/pila-verifications', {}],
      ['POST', '/api/hourly/settlements/calculate', {}],

      ['GET', '/api/users'],
      ['GET', `/api/users?companyId=${a.id}`],
      ['POST', '/api/users', { email: 'x@x.com', role: 'TENANT_ADMIN', companyId: a.id }],
      ['POST', '/api/users', {}],
      ['DELETE', `/api/users/${anaUserId}`],

      ['POST', '/api/benefits/calculate', { companyId: a.id, benefitType: 'PRIMA', year: 2026, semester: 1 }],
      ['POST', '/api/benefits/calculate', {}],
      ['GET', `/api/benefit-payments?companyId=${a.id}`],
      ['GET', '/api/benefit-payments'],
      ['DELETE', `/api/benefit-payments/${paymentId}`],

      ['GET', '/api/ruta-que-no-existe'],
    ];

    const wrong: unknown[] = [];

    for (const [method, path, body] of routes) {
      const res = await call(ANA, method, path, body);
      if (res.status !== 403) wrong.push([method, path, res.status]);
    }

    expect(wrong).toEqual([]);

    // Y nada cambió.
    expect(db.prepare(`SELECT salary FROM employees WHERE id = ?`).get(ana.id).salary).toBe(3_000_000);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM employee_leaves`).get().n).toBe(2);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM benefit_payments`).get().n).toBe(2);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM employee_terminations`).get().n).toBe(0);
    expect(db.prepare(`SELECT active FROM users WHERE id = ?`).get(anaUserId).active).toBe(1);
  });

  test('/api/me sigue disponible para que el dashboard sepa que es EMPLOYEE', async () => {
    const { ana } = await scenario();

    const me = await call(ANA, 'GET', '/api/me');

    expect(me.status).toBe(200);
    expect(me.json.data).toMatchObject({ role: 'EMPLOYEE', employeeId: ana.id });
  });
});
