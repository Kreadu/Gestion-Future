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
// El proyecto compila con los tipos de Workers, no los de Node: se
// declaran aquí sólo los módulos de Node que usa este archivo.
declare const require: (id: string) => any;
declare const __dirname: string;

const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');

type DatabaseSync = any;

import worker from '../src/index';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { LEGAL_VERSION } from '../src/legal';
import { CONSTANTS_2026 } from '../src/engine/countries/constants2026';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

const SUPER = 'super@kreadu.com';
const TENANT_A = 'admin@empresa-a.com';

/**
 * Adaptador mínimo de la API de D1 sobre node:sqlite. D1 usa
 * parámetros numerados (?1, ?2...), que SQLite entiende de forma
 * nativa al enlazarlos por posición.
 */
function createD1(db: DatabaseSync) {
  const toSqlite = (value: unknown) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value as any;
  };

  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    async first<T>(): Promise<T | null> {
      const row = db.prepare(sql).get(...args.map(toSqlite));
      return (row as T) ?? null;
    },
    async all<T>(): Promise<{ results: T[]; success: true }> {
      const rows = db.prepare(sql).all(...args.map(toSqlite));
      return { results: rows as T[], success: true };
    },
    async run() {
      const info = db.prepare(sql).run(...args.map(toSqlite));
      return { success: true, meta: { changes: Number(info.changes) } };
    },
  });

  return { prepare: (sql: string) => statement(sql) };
}

function freshEnv() {
  const db = new DatabaseSync(':memory:');
  const dir = join(__dirname, '..', 'migrations');

  for (const file of readdirSync(dir).filter((f: string) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'));
  }

  db.prepare(
    `INSERT INTO users (id, email, role, active, createdAt)
     VALUES ('USR-super', ?, 'SUPER_ADMIN', 1, '2026-01-01')`
  ).run(SUPER);

  return {
    db,
    env: {
      DB: createD1(db) as unknown as D1Database,
      FIREBASE_PROJECT_ID: 'test-project',
      FIREBASE_API_KEY: 'test-key',
      FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
    },
  };
}

let db: DatabaseSync;
let env: ReturnType<typeof freshEnv>['env'];

beforeEach(() => {
  ({ db, env } = freshEnv());
});

async function call(
  as: string | null,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': '203.0.113.7',
  };

  if (as) headers.Authorization = `Bearer ${as}`;

  const response = await worker.fetch(
    new Request(`https://test.local${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env as any
  );

  const text = await response.text();
  let json: any = text;

  try {
    json = JSON.parse(text);
  } catch {
    // HTML (dashboard, /legal)
  }

  return { status: response.status, json };
}

async function createCompany(extra: Record<string, unknown> = {}) {
  const res = await call(SUPER, 'POST', '/api/companies', {
    name: 'Empresa A S.A.S.',
    nit: '900123456',
    dv: '7',
    acceptedTermsVersion: LEGAL_VERSION,
    ...extra,
  });

  expect(res.status).toBe(201);
  return res.json.data;
}

async function createEmployee(companyId: string, extra: Record<string, unknown> = {}) {
  const res = await call(SUPER, 'POST', '/api/employees', {
    companyId,
    firstName: 'Ana',
    lastName: 'Gómez',
    taxId: '1061000111',
    salary: 2_000_000,
    bankName: 'Bancolombia',
    bankAccountType: 'AHORROS',
    bankAccountNumber: '12345678901',
    ...extra,
  });

  expect(res.status).toBe(201);
  return res.json.data;
}

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
