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
  env,
} from './helpers/api';
import { buildIncomeCertificate, buildEmploymentCertificate } from '../src/routes/certificates';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

const AUX = CONSTANTS_2026.AUXILIO_TRANSPORTE;
const box = (data: any, key: string) => data.certificate.boxes.find((b: any) => b.key === key).value;

async function liquidate(companyId: string, employeeId: string, start: string, end: string) {
  const period = await call(SUPER, 'POST', '/api/payroll-periods', {
    companyId,
    periodStart: start,
    periodEnd: end,
  });
  expect(period.status).toBe(201);

  const calc = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', {
    periodId: period.json.data.id,
    employeeId,
    daysWorked: 30,
  });
  expect(calc.status).toBe(201);
}

describe('Certificado de ingresos y retenciones (formulario 220)', () => {
  test('suma nóminas, prima y liquidación definitiva del año', async () => {
    const a = await createCompany({ address: 'Calle 1 # 2-3', city: 'Popayán', legalRepresentative: 'Laura Pérez' });
    const emp = await createEmployee(a.id, { hireDate: '2025-01-01', salary: 2_000_000, position: 'Panadera' });

    await liquidate(a.id, emp.id, '2026-01-01', '2026-01-31');
    await liquidate(a.id, emp.id, '2026-02-01', '2026-02-28');
    await liquidate(a.id, emp.id, '2025-12-01', '2025-12-31');

    await call(SUPER, 'POST', '/api/benefits/calculate', {
      companyId: a.id, benefitType: 'PRIMA', year: 2026, semester: 1, save: true,
    });

    const term = await call(SUPER, 'POST', `/api/employees/${emp.id}/termination`, {
      terminationDate: '2026-06-30',
      reason: 'RENUNCIA',
    });
    expect(term.status).toBe(201);

    const res = await call(SUPER, 'GET', `/api/employees/${emp.id}/income-certificate?year=2026`);
    expect(res.status).toBe(200);

    const data = res.json.data;
    expect(data.company).toMatchObject({
      name: 'Empresa A S.A.S.',
      nit: '900123456',
      dv: '7',
      city: 'Popayán',
      legalRepresentative: 'Laura Pérez',
    });
    expect(data.employee).toMatchObject({ taxId: '1061000111', fullName: 'Ana Gómez', documentType: '13' });
    expect(data.period).toEqual({ from: '2026-01-01', to: '2026-06-30' });
    expect(data.certificate.settlementsCount).toBe(2);

    expect(box(data, 'salarios')).toBe(4_000_000 + term.json.data.result.lines
      .filter((l: any) => l.concept.startsWith('Vacaciones'))
      .reduce((s: number, l: any) => s + Math.round(l.amount), 0));
    expect(box(data, 'otrosPagos')).toBe(Math.round(AUX) * 2);
    expect(data.certificate.detail.prima).toBeGreaterThan((2_000_000 + AUX) / 2 - 1);
    expect(box(data, 'aportesSalud')).toBe(160_000);
    expect(box(data, 'aportesPensionFsp')).toBe(160_000);
    expect(box(data, 'totalIngresosBrutos')).toBe(data.certificate.totals.ingresosBrutos);
  });

  test('año inválido → 400; empleado inexistente → 404', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id);

    const bad = await call(SUPER, 'GET', `/api/employees/${emp.id}/income-certificate?year=abc`);
    const missing = await call(SUPER, 'GET', `/api/employees/NOPE/income-certificate?year=2026`);

    expect(bad.status).toBe(400);
    expect(missing.status).toBe(404);
  });

  test('otra empresa no puede ver el certificado; un empleado tampoco por esta ruta', async () => {
    const a = await createCompany();
    const b = await createCompany({ name: 'B', nit: '900999888' });
    const empB = await createEmployee(b.id);
    insertUser(TENANT_A, 'TENANT_ADMIN', a.id);
    insertUser('ana@b.com', 'EMPLOYEE', b.id, empB.id);

    const other = await call(TENANT_A, 'GET', `/api/employees/${empB.id}/income-certificate?year=2026`);
    const self = await call('ana@b.com', 'GET', `/api/employees/${empB.id}/income-certificate?year=2026`);
    const otherLab = await call(TENANT_A, 'GET', `/api/employees/${empB.id}/employment-certificate`);

    expect(other.status).toBe(403);
    expect(self.status).toBe(403);
    expect(otherLab.status).toBe(403);
  });

  test('el administrador de la empresa sí puede', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id);
    insertUser(TENANT_A, 'TENANT_ADMIN', a.id);

    const res = await call(TENANT_A, 'GET', `/api/employees/${emp.id}/income-certificate?year=2026`);
    expect(res.status).toBe(200);
  });

  test('buildIncomeCertificate se puede usar sin pasar por la ruta', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id, { hireDate: '2026-03-01' });

    const data = await buildIncomeCertificate(env as any, emp.id, 2026);
    expect(data.period).toEqual({ from: '2026-03-01', to: '2026-12-31' });
    expect(data.year).toBe(2026);
  });
});

describe('Certificado laboral', () => {
  test('devuelve cargo, salario, ingreso y tipo de contrato', async () => {
    const a = await createCompany({ city: 'Cali' });
    const emp = await createEmployee(a.id, {
      hireDate: '2024-05-02',
      salary: 3_500_000,
      position: 'Contadora',
      contractType: '1',
      contractEndDate: '2027-05-01',
    });

    const res = await call(SUPER, 'GET', `/api/employees/${emp.id}/employment-certificate`);
    expect(res.status).toBe(200);
    expect(res.json.data.employee).toMatchObject({
      fullName: 'Ana Gómez',
      taxId: '1061000111',
      position: 'Contadora',
      salary: 3_500_000,
      hireDate: '2024-05-02',
      contractType: '1',
      contractTypeLabel: 'Término fijo',
      active: true,
      terminationDate: null,
    });
    expect(res.json.data.company.city).toBe('Cali');
    expect(res.json.data.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const direct = await buildEmploymentCertificate(env as any, emp.id);
    expect(direct.employee.position).toBe('Contadora');
  });

  test('empleado retirado: indica la fecha de retiro', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id, { hireDate: '2025-01-01' });

    await call(SUPER, 'POST', `/api/employees/${emp.id}/termination`, {
      terminationDate: '2026-03-31',
      reason: 'RENUNCIA',
    });

    const res = await call(SUPER, 'GET', `/api/employees/${emp.id}/employment-certificate`);
    expect(res.json.data.employee.active).toBe(false);
    expect(res.json.data.employee.terminationDate).toBe('2026-03-31');
  });
});
