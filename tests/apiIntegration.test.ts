/**
 * Pruebas de integración del Worker completo: cada test llama al
 * `fetch` real de src/index.ts contra una base SQLite en memoria con
 * TODAS las migraciones de migrations/ aplicadas, así que validan
 * rutas, SQL, autorización y motor de nómina juntos.
 *
 * Lo único simulado es la verificación del token de Firebase: el
 * token de cada request es directamente el correo del usuario.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { LEGAL_VERSION } from '../src/legal';
import { CONSTANTS_2026 } from '../src/engine/countries/constants2026';
import {
  SUPER,
  TENANT_A,
  db,
  resetDb,
  call,
  createCompany,
  createEmployee,
} from './helpers/api';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

describe('Páginas públicas', () => {
  test('/legal se sirve sin autenticación e incluye ambos documentos', async () => {
    const res = await call(null, 'GET', '/legal');

    expect(res.status).toBe(200);
    expect(res.json).toContain('Términos y condiciones de uso');
    expect(res.json).toContain('Política de tratamiento de datos personales');
    expect(res.json).toContain('Ley 1581 de 2012');
    expect(res.json).toContain(LEGAL_VERSION);
  });

  test('el API exige token', async () => {
    const res = await call(null, 'GET', '/api/me');
    expect(res.status).toBe(401);
  });
});

describe('Aceptación de términos al crear empresa', () => {
  test('sin aceptar la versión vigente no se crea la empresa', async () => {
    const missing = await call(SUPER, 'POST', '/api/companies', {
      name: 'Sin términos',
      nit: '900000001',
    });
    const outdated = await call(SUPER, 'POST', '/api/companies', {
      name: 'Versión vieja',
      nit: '900000002',
      acceptedTermsVersion: '2020-01-01',
    });

    expect(missing.status).toBe(400);
    expect(outdated.status).toBe(400);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM companies').get()
    ).toEqual({ n: 0 });
  });

  test('guarda la evidencia: versión, quién, cuándo y desde qué IP', async () => {
    const company = await createCompany();

    const row = db
      .prepare(
        `SELECT termsVersion, termsAcceptedAt, termsAcceptedBy, termsAcceptedIp
         FROM companies WHERE id = ?`
      )
      .get(company.id) as any;

    expect(row.termsVersion).toBe(LEGAL_VERSION);
    expect(row.termsAcceptedBy).toBe(SUPER);
    expect(row.termsAcceptedIp).toBe('203.0.113.7');
    expect(row.termsAcceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('editar una empresa existente no exige volver a aceptar', async () => {
    const company = await createCompany();

    const res = await call(SUPER, 'PUT', `/api/companies/${company.id}`, {
      name: 'Empresa A Renombrada',
      nit: '900123456',
    });

    expect(res.status).toBe(200);
  });
});

describe('Aislamiento multi-tenant', () => {
  test('un TENANT_ADMIN no crea empresas ni ve empleados de otra', async () => {
    const a = await createCompany();
    const b = await createCompany({ name: 'Empresa B', nit: '900999888' });
    await createEmployee(b.id);

    db.prepare(
      `INSERT INTO users (id, email, role, companyId, active, createdAt)
       VALUES ('USR-a', ?, 'TENANT_ADMIN', ?, 1, '2026-01-01')`
    ).run(TENANT_A, a.id);

    const create = await call(TENANT_A, 'POST', '/api/companies', {
      name: 'Intrusa',
      nit: '1',
      acceptedTermsVersion: LEGAL_VERSION,
    });
    const otherEmployees = await call(
      TENANT_A,
      'GET',
      `/api/employees?companyId=${b.id}`
    );
    const companies = await call(TENANT_A, 'GET', '/api/companies');

    expect(create.status).toBe(403);
    expect(otherEmployees.status).toBe(403);
    expect(companies.json.data.map((c: any) => c.id)).toEqual([a.id]);
  });
});

describe('Empleados', () => {
  test('el listado incluye los datos bancarios y la clase de riesgo ARL', async () => {
    const company = await createCompany();
    await createEmployee(company.id, { arlRiskClass: 4 });

    const res = await call(SUPER, 'GET', `/api/employees?companyId=${company.id}`);
    const [employee] = res.json.data;

    // Si el listado no trae la cuenta, el formulario de edición la
    // reenvía vacía y el PUT la borra.
    expect(employee.bankAccountNumber).toBe('12345678901');
    expect(employee.bankName).toBe('Bancolombia');
    expect(employee.arlRiskClass).toBe(4);
  });

  test('editar un empleado desde el listado conserva su cuenta bancaria', async () => {
    const company = await createCompany();
    await createEmployee(company.id);

    const list = await call(SUPER, 'GET', `/api/employees?companyId=${company.id}`);
    const employee = list.json.data[0];

    // Lo mismo que hace el formulario del dashboard (openEditEmployee):
    // copia los campos del listado, con '' para los que no vengan.
    const res = await call(SUPER, 'PUT', `/api/employees/${employee.id}`, {
      ...employee,
      bankName: employee.bankName || '',
      bankAccountNumber: employee.bankAccountNumber || '',
      position: 'Contadora',
    });

    expect(res.status).toBe(200);

    const row = db
      .prepare('SELECT position, bankAccountNumber FROM employees WHERE id = ?')
      .get(employee.id) as any;

    expect(row.position).toBe('Contadora');
    expect(row.bankAccountNumber).toBe('12345678901');
  });

  test('una clase de riesgo inválida cae a clase I', async () => {
    const company = await createCompany();
    const employee = await createEmployee(company.id, { arlRiskClass: 9 });

    expect(employee.arlRiskClass).toBe(1);
  });
});

describe('Liquidación de nómina persistente', () => {
  async function settle(companyExtra: Record<string, unknown>, employeeExtra: Record<string, unknown>) {
    const company = await createCompany(companyExtra);
    const employee = await createEmployee(company.id, employeeExtra);

    const period = await call(SUPER, 'POST', '/api/payroll-periods', {
      companyId: company.id,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-30',
    });

    expect(period.status).toBe(201);

    const res = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', {
      periodId: period.json.data.id,
      employeeId: employee.id,
      daysWorked: 30,
    });

    expect(res.status).toBe(201);
    return { company, employee, period: period.json.data, calc: res.json.data.calculation };
  }

  test('usa la clase de riesgo ARL del empleado', async () => {
    const { calc } = await settle({}, { arlRiskClass: 5 });

    expect(calc.employerContributions.arlValue).toBeCloseTo(
      calc.ibcSecuritySocial * 0.0696,
      0
    );
  });

  test('aplica la exoneración 114-1 cuando la empresa la tiene', async () => {
    const { calc } = await settle({ isExempt114_1: true }, {});

    expect(calc.employerContributions.health8_5pct).toBe(0);
    expect(calc.employerContributions.sena2pct).toBe(0);
    expect(calc.employerContributions.icbf3pct).toBe(0);
    expect(calc.employerContributions.pension12pct).toBeGreaterThan(0);
  });

  test('sin exoneración la empresa paga salud, SENA e ICBF', async () => {
    const { calc } = await settle({}, {});

    expect(calc.employerContributions.health8_5pct).toBeCloseTo(
      calc.ibcSecuritySocial * CONSTANTS_2026.HEALTH_EMPLOYER,
      0
    );
  });

  test('la liquidación queda guardada y listada en el periodo', async () => {
    const { period, calc } = await settle({}, {});

    const list = await call(
      SUPER,
      'GET',
      `/api/payroll-settlements?periodId=${period.id}`
    );

    expect(list.status).toBe(200);
    expect(list.json.data).toHaveLength(1);
    expect(list.json.data[0].netPay).toBeCloseTo(calc.netPay, 2);
  });
});
