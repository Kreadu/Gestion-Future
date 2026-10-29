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
import { EMPLOYEE_FIELDS, EMPLOYEE_LENGTH, HEADER_LENGTH, fieldSpan } from '../src/services/pilaFile';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

const AFFILIATION = {
  documentType: 'CC',
  pilaContributorType: '01',
  pilaContributorSubtype: '00',
  epsCode: 'EPS037',
  afpCode: '230301',
  ccfCode: 'CCF22',
};

function field(line: string, name: string) {
  const { start, length } = fieldSpan(EMPLOYEE_FIELDS, name);
  return line.slice(start - 1, start - 1 + length);
}

async function liquidatedPeriod(companyExtra: Record<string, unknown> = {}, employeeExtra: Record<string, unknown> = {}) {
  const company = await createCompany({ arlCode: '14-23', divipolaCode: '19001', ...companyExtra });
  const emp = await createEmployee(company.id, { hireDate: '2026-10-06', ...AFFILIATION, ...employeeExtra });

  const leave = await call(SUPER, 'POST', '/api/employee-leaves', {
    employeeId: emp.id,
    leaveType: 'GENERAL_INCAPACITY',
    startDate: '2026-10-10',
    endDate: '2026-10-14',
  });
  expect(leave.status).toBe(201);

  const period = await call(SUPER, 'POST', '/api/payroll-periods', {
    companyId: company.id,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  });

  const calc = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', {
    periodId: period.json.data.id,
    employeeId: emp.id,
    daysWorked: 20,
  });
  expect(calc.status).toBe(201);

  return { company, emp, periodId: period.json.data.id as string };
}

describe('Datos de afiliación PILA', () => {
  test('la empresa y el empleado guardan y devuelven sus códigos', async () => {
    const company = await createCompany({ arlCode: '14-23', divipolaCode: '19001', pilaContributorType: '01', arlActivityCode: '1749101' });
    expect(company).toMatchObject({ arlCode: '14-23', divipolaCode: '19001', pilaContributorType: '01', arlActivityCode: '1749101' });

    const emp = await createEmployee(company.id, AFFILIATION);
    expect(emp).toMatchObject(AFFILIATION);

    const updated = await call(SUPER, 'PUT', `/api/employees/${emp.id}`, { ...emp, epsCode: 'EPS010', divipolaCode: '05001' });
    expect(updated.status).toBe(200);
    expect(updated.json.data).toMatchObject({ epsCode: 'EPS010', afpCode: '230301', divipolaCode: '05001' });

    const editCompany = await call(SUPER, 'PUT', `/api/companies/${company.id}`, { ...company, arlCode: '14-18' });
    expect(editCompany.json.data.arlCode).toBe('14-18');
  });

  test('valores por defecto: CC, cotizante 01, subtipo 00', async () => {
    const company = await createCompany();
    const emp = await createEmployee(company.id);

    expect(emp).toMatchObject({ documentType: 'CC', pilaContributorType: '01', pilaContributorSubtype: '00', epsCode: null });
  });

  test('rechaza un tipo de documento o un DIVIPOLA inválido sin crear el empleado', async () => {
    const company = await createCompany();

    const badDoc = await call(SUPER, 'POST', '/api/employees', {
      companyId: company.id, firstName: 'Ana', lastName: 'Gómez', taxId: '1', salary: 2_000_000, documentType: 'XX',
    });
    expect(badDoc.status).toBe(400);

    const badCity = await call(SUPER, 'POST', '/api/employees', {
      companyId: company.id, firstName: 'Ana', lastName: 'Gómez', taxId: '1', salary: 2_000_000, divipolaCode: '190',
    });
    expect(badCity.status).toBe(400);

    const list = await call(SUPER, 'GET', `/api/employees?companyId=${company.id}`);
    expect(list.json.data).toHaveLength(0);
  });
});

describe('GET /api/payroll-periods/:id/pila', () => {
  test('genera encabezado y una línea por novedad, con ING e IGE', async () => {
    const { periodId } = await liquidatedPeriod();

    const res = await call(SUPER, 'GET', `/api/payroll-periods/${periodId}/pila`);

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);

    const { fileName, content, warnings, totals } = res.json.data;
    expect(fileName).toBe('PILA_900123456_2026-10.txt');
    expect(warnings).toEqual([]);
    expect(totals.total).toBeGreaterThan(0);

    const lines = content.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveLength(HEADER_LENGTH);
    expect(lines[1]).toHaveLength(EMPLOYEE_LENGTH);
    expect(lines[2]).toHaveLength(EMPLOYEE_LENGTH);

    const [, base, ige] = lines;
    expect(field(base, 'ing')).toBe('X');
    expect(field(base, 'fechaIngreso')).toBe('2026-10-06');
    expect(field(base, 'diasSalud')).toBe('20');
    expect(field(base, 'departamento') + field(base, 'municipio')).toBe('19001');
    expect(field(base, 'codigoEps')).toBe('EPS037');

    expect(field(ige, 'ige')).toBe('X');
    expect(field(ige, 'diasSalud')).toBe('05');
    expect(field(ige, 'fechaInicioIge')).toBe('2026-10-10');
    expect(field(ige, 'fechaFinIge')).toBe('2026-10-14');
  });

  test('advierte datos faltantes y empleados activos sin liquidar', async () => {
    const { company } = await liquidatedPeriod({ arlCode: '' }, { epsCode: '' });
    await createEmployee(company.id, { taxId: '2', firstName: 'Beto' });

    const periods = await call(SUPER, 'GET', `/api/payroll-periods?companyId=${company.id}`);
    const periodId = periods.json.data[0].id;

    const res = await call(SUPER, 'GET', `/api/payroll-periods/${periodId}/pila`);
    const text = res.json.data.warnings.join(' | ');

    expect(text).toMatch(/ARL/);
    expect(text).toMatch(/EPS/);
    expect(text).toMatch(/Beto.*sin liquidación/);
    expect(text).toMatch(/borrador/);
  });

  test('sólo el administrador de la empresa y el SUPER_ADMIN', async () => {
    const { periodId } = await liquidatedPeriod();
    const other = await createCompany({ name: 'Otra', nit: '800000000' });

    insertUser(TENANT_A, 'TENANT_ADMIN', other.id);
    expect((await call(TENANT_A, 'GET', `/api/payroll-periods/${periodId}/pila`)).status).toBe(403);

    insertUser('empleado@a.com', 'EMPLOYEE', other.id);
    expect((await call('empleado@a.com', 'GET', `/api/payroll-periods/${periodId}/pila`)).status).toBe(403);

    expect((await call(null, 'GET', `/api/payroll-periods/${periodId}/pila`)).status).toBe(401);
  });

  test('el administrador de la empresa sí puede descargarlo', async () => {
    const { company, periodId } = await liquidatedPeriod();
    insertUser(TENANT_A, 'TENANT_ADMIN', company.id);

    expect((await call(TENANT_A, 'GET', `/api/payroll-periods/${periodId}/pila`)).status).toBe(200);
  });

  test('periodo inexistente o sin liquidaciones', async () => {
    expect((await call(SUPER, 'GET', '/api/payroll-periods/no-existe/pila')).status).toBe(404);

    const company = await createCompany();
    const period = await call(SUPER, 'POST', '/api/payroll-periods', {
      companyId: company.id, periodStart: '2026-10-01', periodEnd: '2026-10-31',
    });

    const res = await call(SUPER, 'GET', `/api/payroll-periods/${period.json.data.id}/pila`);
    expect(res.status).toBe(400);
  });
});
