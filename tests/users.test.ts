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

describe('Gestión de usuarios', () => {
  test('el super admin da acceso a un administrador de empresa y lo lista por empresa', async () => {
    const a = await createCompany();
    const b = await createCompany({ name: 'Empresa B', nit: '900999888' });

    const created = await call(SUPER, 'POST', '/api/users', {
      email: 'Jefe@Empresa-A.com ',
      role: 'TENANT_ADMIN',
      companyId: a.id,
    });
    await call(SUPER, 'POST', '/api/users', {
      email: 'jefe@empresa-b.com',
      role: 'TENANT_ADMIN',
      companyId: b.id,
    });

    expect(created.status).toBe(201);
    expect(created.json.data.email).toBe('jefe@empresa-a.com');

    const list = await call(SUPER, 'GET', `/api/users?companyId=${a.id}`);

    expect(list.json.data.map((u: any) => u.email)).toEqual(['jefe@empresa-a.com']);
  });

  test('un usuario desactivado se puede volver a activar', async () => {
    const a = await createCompany();
    const first = await call(SUPER, 'POST', '/api/users', {
      email: 'jefe@empresa-a.com',
      role: 'TENANT_ADMIN',
      companyId: a.id,
    });

    await call(SUPER, 'DELETE', `/api/users/${first.json.data.id}`);

    const again = await call(SUPER, 'POST', '/api/users', {
      email: 'jefe@empresa-a.com',
      role: 'TENANT_ADMIN',
      companyId: a.id,
    });

    expect(again.status).toBe(201);
    expect((await call('jefe@empresa-a.com', 'GET', '/api/me')).status).toBe(200);
  });

  test('un usuario activo repetido da 409', async () => {
    const a = await createCompany();
    const body = { email: 'jefe@empresa-a.com', role: 'TENANT_ADMIN', companyId: a.id };

    await call(SUPER, 'POST', '/api/users', body);

    expect((await call(SUPER, 'POST', '/api/users', body)).status).toBe(409);
  });

  test('nadie puede desactivarse a sí mismo', async () => {
    const a = await createCompany();
    insertUser(TENANT_A, 'TENANT_ADMIN', a.id);

    const res = await call(TENANT_A, 'DELETE', `/api/users/USR-${TENANT_A}`);

    expect(res.status).toBe(400);
  });

  test('un usuario EMPLOYEE sólo se enlaza a un empleado de su misma empresa', async () => {
    const a = await createCompany();
    const b = await createCompany({ name: 'Empresa B', nit: '900999888' });
    const empB = await createEmployee(b.id);
    const empA = await createEmployee(a.id, { taxId: '222' });

    const cross = await call(SUPER, 'POST', '/api/users', {
      email: 'ana@correo.com',
      role: 'EMPLOYEE',
      companyId: a.id,
      employeeId: empB.id,
    });
    const missing = await call(SUPER, 'POST', '/api/users', {
      email: 'ana@correo.com',
      role: 'EMPLOYEE',
      companyId: a.id,
    });
    const ok = await call(SUPER, 'POST', '/api/users', {
      email: 'ana@correo.com',
      role: 'EMPLOYEE',
      companyId: a.id,
      employeeId: empA.id,
    });

    expect(cross.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(ok.status).toBe(201);
  });
});
