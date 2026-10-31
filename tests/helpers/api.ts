/**
 * Arnés compartido de las pruebas de integración del Worker: base
 * SQLite en memoria con todas las migraciones y una función `call`
 * que invoca el `fetch` real de src/index.ts.
 *
 * Cada archivo de prueba debe simular la verificación de Firebase
 * (jest.mock('../src/auth/firebaseToken')) para que el token sea el
 * correo del usuario.
 */

// El proyecto compila con los tipos de Workers, no los de Node: se
// declaran aquí sólo los módulos de Node que usa este archivo.
declare const require: (id: string) => any;
declare const __dirname: string;

const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');

import { expect } from '@jest/globals';
import worker from '../../src/index';
import { LEGAL_VERSION } from '../../src/legal';

type DatabaseSync = any;

export const SUPER = 'super@kreadu.com';
export const TENANT_A = 'admin@empresa-a.com';

/**
 * Adaptador mínimo de la API de D1 sobre node:sqlite. D1 usa
 * parámetros numerados (?1, ?2...), que SQLite entiende de forma
 * nativa al enlazarlos por posición.
 */
export function createD1(db: DatabaseSync) {
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

export function freshEnv() {
  const db = new DatabaseSync(':memory:');
  const dir = join(__dirname, '..', '..', 'migrations');

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

export let db: DatabaseSync;
export let env: ReturnType<typeof freshEnv>['env'];

/** Base nueva; llamarlo en beforeEach. */
export function resetDb() {
  // Cerrar la base anterior: cientos de bases en memoria abiertas hacían que
  // el worker de Jest tardara en salir ("failed to exit gracefully").
  if (db) db.close();
  ({ db, env } = freshEnv());
}


export async function call(
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

export async function createCompany(extra: Record<string, unknown> = {}) {
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

export async function createEmployee(companyId: string, extra: Record<string, unknown> = {}) {
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

/** Da de alta un usuario directamente en la base. */
export function insertUser(email: string, role: string, companyId: string | null, employeeId: string | null = null) {
  db.prepare(
    `INSERT INTO users (id, email, role, companyId, employeeId, active, createdAt)
     VALUES (?, ?, ?, ?, ?, 1, '2026-01-01')`
  ).run('USR-' + email, email, role, companyId, employeeId);
}
