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
import { validateEmployeeInput, excelSerialToIso } from '../src/services/employeeValidation';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

function row(extra: Record<string, unknown> = {}) {
  return {
    firstName: 'Carlos',
    lastName: 'Pérez',
    taxId: '1020304050',
    position: 'Operario',
    contractType: '2',
    salary: 1_750_905,
    hireDate: '2026-02-01',
    bankName: 'Bancolombia',
    bankAccountType: 'AHORROS',
    bankAccountNumber: '00123456789',
    ...extra,
  };
}

describe('Validación compartida de empleados', () => {
  test('el modo básico conserva las reglas del POST /api/employees', () => {
    expect(validateEmployeeInput({ firstName: 'A', lastName: 'B', taxId: '1', salary: 100 }).ok).toBe(true);
    expect(validateEmployeeInput({ firstName: 'A', lastName: 'B', taxId: '1', salary: 0 })).toEqual({
      ok: false,
      error: 'El salario debe ser mayor que cero.',
    });
  });

  test('el modo estricto exige salario mínimo salvo aprendices y fechas válidas', () => {
    const strict = { strict: true };
    expect(validateEmployeeInput(row({ salary: 1_000_000 }), strict).ok).toBe(false);
    expect(validateEmployeeInput(row({ salary: 1_000_000, contractType: '4' }), strict).ok).toBe(true);
    expect(validateEmployeeInput(row({ hireDate: '2026-02-30' }), strict).ok).toBe(false);
    expect(validateEmployeeInput(row({ contractType: '9' }), strict).ok).toBe(false);
    expect(validateEmployeeInput(row({ contractType: 'Indefinido' }), strict)).toMatchObject({
      ok: true,
      value: { contractType: '2' },
    });
    // Contrato a término fijo sin fecha de terminación.
    expect(validateEmployeeInput(row({ contractType: '1' }), strict).ok).toBe(false);
    // Salario integral por debajo de 13 SMMLV.
    expect(validateEmployeeInput(row({ isIntegralSalary: 'Sí', salary: 5_000_000 }), strict).ok).toBe(false);
  });

  test('acepta fechas en formato serial de Excel', () => {
    expect(excelSerialToIso(46054)).toBe('2026-02-01');
    expect(validateEmployeeInput(row({ hireDate: 46054 }), { strict: true })).toMatchObject({
      ok: true,
      value: { hireDate: '2026-02-01' },
    });
  });
});

describe('POST /api/employees/import', () => {
  test('crea las filas válidas y reporta las inválidas', async () => {
    const a = await createCompany();

    const res = await call(SUPER, 'POST', '/api/employees/import', {
      companyId: a.id,
      rows: [
        row(),
        row({ taxId: '2030405060', firstName: '', rowNumber: 7 }),
        row({ taxId: '3040506070', salary: 900_000 }),
        row({ taxId: '4050607080', contractType: '4', salary: 900_000, hireDate: 46054 }),
      ],
    });

    expect(res.status).toBe(200);
    expect(res.json.created).toBe(2);
    expect(res.json.errors).toEqual([
      { row: 7, error: expect.stringMatching(/obligatorio/i) },
      { row: 3, error: expect.stringMatching(/salario mínimo/i) },
    ]);

    const list = await call(SUPER, 'GET', `/api/employees?companyId=${a.id}`);
    expect(list.json.data.map((e: any) => e.taxId).sort()).toEqual(['1020304050', '4050607080']);

    const apprentice = db.prepare(`SELECT * FROM employees WHERE taxId = '4050607080'`).get();
    expect(apprentice.hireDate).toBe('2026-02-01');
    expect(apprentice.contractType).toBe('4');
    expect(apprentice.bankAccountNumber).toBe('00123456789');
  });

  test('detecta documentos duplicados en el archivo y contra empleados existentes', async () => {
    const a = await createCompany();
    await createEmployee(a.id, { taxId: '1061000111' });

    const res = await call(SUPER, 'POST', '/api/employees/import', {
      companyId: a.id,
      rows: [
        row({ taxId: '1.061.000.111' }),
        row({ taxId: '5555' }),
        row({ taxId: '5555' }),
      ],
    });

    expect(res.status).toBe(200);
    expect(res.json.created).toBe(1);
    expect(res.json.errors).toEqual([
      { row: 1, error: expect.stringMatching(/ya existe/i) },
      { row: 3, error: expect.stringMatching(/repetido/i) },
    ]);
  });

  test('rechaza importar en una empresa ajena (403)', async () => {
    const a = await createCompany();
    const b = await createCompany({ name: 'Empresa B', nit: '900999888' });
    insertUser(TENANT_A, 'TENANT_ADMIN', a.id);

    const res = await call(TENANT_A, 'POST', '/api/employees/import', {
      companyId: b.id,
      rows: [row()],
    });

    expect(res.status).toBe(403);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM employees`).get().n).toBe(0);

    const own = await call(TENANT_A, 'POST', '/api/employees/import', {
      companyId: a.id,
      rows: [row()],
    });
    expect(own.status).toBe(200);
    expect(own.json.created).toBe(1);
  });

  test('valida el cuerpo: filas vacías y tope de 500', async () => {
    const a = await createCompany();

    const empty = await call(SUPER, 'POST', '/api/employees/import', { companyId: a.id, rows: [] });
    expect(empty.status).toBe(400);

    const many = Array.from({ length: 501 }, (_, i) => row({ taxId: String(1000 + i) }));
    const tooMany = await call(SUPER, 'POST', '/api/employees/import', { companyId: a.id, rows: many });
    expect(tooMany.status).toBe(400);
    expect(tooMany.json.error).toMatch(/500/);

    const noCompany = await call(SUPER, 'POST', '/api/employees/import', { rows: [row()] });
    expect(noCompany.status).toBe(400);
  });

  test('un empleado no puede importar', async () => {
    const a = await createCompany();
    const emp = await createEmployee(a.id);
    insertUser('ana@empresa-a.com', 'EMPLOYEE', a.id, emp.id);

    const res = await call('ana@empresa-a.com', 'POST', '/api/employees/import', {
      companyId: a.id,
      rows: [row()],
    });

    expect(res.status).toBe(403);
  });
});
