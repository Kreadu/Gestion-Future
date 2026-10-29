import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import worker from '../src/index';
import * as api from './helpers/api';
import {
  SUPER,
  TENANT_A,
  resetDb,
  call,
  createCompany,
  insertUser,
} from './helpers/api';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

// PNG de 1x1 px.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG_DATA_URL = 'data:image/png;base64,' + PNG_BASE64;

/** GET binario (call() de helpers/api parsea texto/JSON). */
async function getLogo(as: string | null, companyId: string, headers: Record<string, string> = {}) {
  if (as) headers.Authorization = `Bearer ${as}`;

  return worker.fetch(
    new Request(`https://test.local/api/companies/${encodeURIComponent(companyId)}/logo`, { headers }),
    api.env as any
  );
}

describe('Logos de empresa (tabla company_logos)', () => {
  test('el listado trae hasLogo/logoVersion y nunca el data URL', async () => {
    const a = await createCompany({ logo: PNG_DATA_URL });
    await createCompany({ name: 'Sin Logo S.A.S.', nit: '900999888' });

    expect(a.hasLogo).toBe(true);
    expect(a.logo).toBeUndefined();

    const list = await call(SUPER, 'GET', '/api/companies');
    expect(list.status).toBe(200);

    const raw = JSON.stringify(list.json);
    expect(raw).not.toContain('data:image');
    expect(raw).not.toContain(PNG_BASE64);

    const withLogo = list.json.data.find((c: any) => c.id === a.id);
    const without = list.json.data.find((c: any) => c.id !== a.id);

    expect(withLogo).toMatchObject({ hasLogo: true });
    expect(typeof withLogo.logoVersion).toBe('string');
    expect(without).toMatchObject({ hasLogo: false, logoVersion: null });

    // companies.logo ya no guarda la imagen.
    const row = api.db.prepare('SELECT logo FROM companies WHERE id = ?').get(a.id);
    expect(row.logo).toBeNull();
  });

  test('GET /api/companies/:id/logo sirve la imagen binaria con caché privada y ETag', async () => {
    const a = await createCompany({ logo: PNG_DATA_URL });

    const res = await getLogo(SUPER, a.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toMatch(/private/);

    const etag = res.headers.get('ETag');
    expect(etag).toBeTruthy();

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]); // "PNG"

    const again = await getLogo(SUPER, a.id, { 'If-None-Match': etag! });
    expect(again.status).toBe(304);
  });

  test('el logo sólo se sirve a quien tiene acceso a la empresa', async () => {
    const a = await createCompany({ logo: PNG_DATA_URL });
    const b = await createCompany({ name: 'Empresa B', nit: '800111222', logo: PNG_DATA_URL });
    insertUser(TENANT_A, 'TENANT_ADMIN', a.id);

    expect((await getLogo(null, a.id)).status).toBe(401);
    expect((await getLogo(TENANT_A, a.id)).status).toBe(200);
    expect((await getLogo(TENANT_A, b.id)).status).toBe(403);
  });

  test('PUT reemplaza o quita el logo, y sin campo logo lo conserva', async () => {
    const a = await createCompany();
    expect(a.hasLogo).toBe(false);
    expect((await getLogo(SUPER, a.id)).status).toBe(404);

    const set = await call(SUPER, 'PUT', `/api/companies/${a.id}`, {
      name: a.name,
      nit: a.nit,
      logo: PNG_DATA_URL,
    });
    expect(set.status).toBe(200);
    expect(set.json.data.hasLogo).toBe(true);

    const keep = await call(SUPER, 'PUT', `/api/companies/${a.id}`, { name: 'Nuevo nombre', nit: a.nit });
    expect(keep.json.data.hasLogo).toBe(true);
    expect((await getLogo(SUPER, a.id)).status).toBe(200);

    const removed = await call(SUPER, 'PUT', `/api/companies/${a.id}`, { name: 'Nuevo nombre', nit: a.nit, logo: '' });
    expect(removed.json.data).toMatchObject({ hasLogo: false, logoVersion: null });
    expect((await getLogo(SUPER, a.id)).status).toBe(404);
  });

  test('rechaza archivos que no son imagen o demasiado grandes, sin crear la empresa', async () => {
    const notImage = await call(SUPER, 'POST', '/api/companies', {
      name: 'X', nit: '1', acceptedTermsVersion: (await import('../src/legal')).LEGAL_VERSION,
      logo: 'data:text/html;base64,PHNjcmlwdD4=',
    });
    expect(notImage.status).toBe(400);

    const big = 'data:image/png;base64,' + 'A'.repeat(800 * 1024);
    const a = await createCompany();
    const tooBig = await call(SUPER, 'PUT', `/api/companies/${a.id}`, { name: a.name, nit: a.nit, logo: big });
    expect(tooBig.status).toBe(400);

    const list = await call(SUPER, 'GET', '/api/companies');
    expect(list.json.data).toHaveLength(1);
  });

  test('la migración 0012 mueve los logos existentes a company_logos', () => {
    // Simula una base anterior a 0012: un data URL en companies.logo.
    api.db.prepare(
      `INSERT INTO companies (id, name, nit, logo, isExempt114_1, active, createdAt)
       VALUES ('COMP-old', 'Vieja', '1', ?, 0, 1, '2025-01-01')`
    ).run(PNG_DATA_URL);

    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    api.db.exec(readFileSync(join(__dirname, '..', 'migrations', '0012_company_logos.sql'), 'utf8'));

    expect(api.db.prepare(`SELECT logo FROM companies WHERE id = 'COMP-old'`).get().logo).toBeNull();
    expect(api.db.prepare(`SELECT contentType, data FROM company_logos WHERE companyId = 'COMP-old'`).get())
      .toEqual({ contentType: 'image/png', data: PNG_BASE64 });
  });
});

declare const require: (id: string) => any;
declare const __dirname: string;
