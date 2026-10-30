import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  authenticate,
  canAccessCompany,
  requireRole,
  requireCompanyAccess,
  audit,
  HttpError,
  type AuthUser,
  type AuthEnv,
} from '../src/auth/authz';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';

jest.mock('../src/auth/firebaseToken');

const mockVerify = jest.mocked(verifyFirebaseIdToken);

interface FakeUserRow {
  id: string;
  email: string;
  firebaseUid: string | null;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'EMPLOYEE';
  companyId: string | null;
  employeeId: string | null;
  active: number;
}

/**
 * D1 falso mínimo: sólo entiende las consultas que emite authz.ts,
 * despachando por el texto del SQL. Suficiente para probar la lógica
 * de autenticación sin levantar una base real.
 */
function createFakeDb(users: FakeUserRow[]) {
  const updates: Array<{ firebaseUid: string; id: string }> = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (sql.includes('WHERE firebaseUid')) {
                const row = users.find((u) => u.firebaseUid === args[0]);
                return (row as unknown as T) ?? null;
              }

              if (sql.includes('WHERE email')) {
                const row = users.find((u) => u.email === args[0]);
                return (row as unknown as T) ?? null;
              }

              return null;
            },

            async run() {
              if (sql.includes('UPDATE users SET firebaseUid')) {
                const [firebaseUid, id] = args as [string, string];
                updates.push({ firebaseUid, id });

                const row = users.find((u) => u.id === id);
                if (row) row.firebaseUid = firebaseUid;
              }

              if (sql.includes('INSERT INTO audit_log')) {
                // no-op: no necesitamos inspeccionar auditoría aquí.
              }

              return { success: true } as unknown;
            },
          };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, updates };
}

function buildEnv(users: FakeUserRow[]): {
  env: AuthEnv;
  updates: Array<{ firebaseUid: string; id: string }>;
} {
  const { db, updates } = createFakeDb(users);
  return {
    env: { DB: db, FIREBASE_PROJECT_ID: 'gestion-future-test' },
    updates,
  };
}

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/companies', { headers });
}

const TENANT_ADMIN: AuthUser = {
  id: 'USR-1',
  email: 'admin@a.com',
  role: 'TENANT_ADMIN',
  companyId: 'COMP-A',
  employeeId: null,
};

const SUPER_ADMIN: AuthUser = {
  id: 'USR-0',
  email: 'root@kreadu.com',
  role: 'SUPER_ADMIN',
  companyId: null,
  employeeId: null,
};

describe('canAccessCompany', () => {
  test('SUPER_ADMIN accede a cualquier empresa', () => {
    expect(canAccessCompany(SUPER_ADMIN, 'COMP-A')).toBe(true);
    expect(canAccessCompany(SUPER_ADMIN, 'COMP-B')).toBe(true);
  });

  test('TENANT_ADMIN sólo accede a su propia empresa', () => {
    expect(canAccessCompany(TENANT_ADMIN, 'COMP-A')).toBe(true);
    expect(canAccessCompany(TENANT_ADMIN, 'COMP-B')).toBe(false);
  });

  test('sin companyId, nunca hay acceso', () => {
    expect(canAccessCompany(TENANT_ADMIN, null)).toBe(false);
    expect(canAccessCompany(TENANT_ADMIN, undefined)).toBe(false);
  });
});

describe('requireRole', () => {
  test('permite el rol autorizado', () => {
    expect(() =>
      requireRole(TENANT_ADMIN, ['TENANT_ADMIN'])
    ).not.toThrow();
  });

  test('rechaza un rol no autorizado con 403', () => {
    expect(() => requireRole(TENANT_ADMIN, ['SUPER_ADMIN'])).toThrow(
      HttpError
    );
  });

  test('SUPER_ADMIN siempre pasa', () => {
    expect(() => requireRole(SUPER_ADMIN, ['EMPLOYEE'])).not.toThrow();
  });
});

describe('requireCompanyAccess', () => {
  test('lanza 403 en acceso cruzado entre empresas', () => {
    expect(() => requireCompanyAccess(TENANT_ADMIN, 'COMP-B')).toThrow(
      HttpError
    );
  });

  test('no lanza cuando la empresa es la propia', () => {
    expect(() =>
      requireCompanyAccess(TENANT_ADMIN, 'COMP-A')
    ).not.toThrow();
  });
});

describe('authenticate', () => {
  beforeEach(() => {
    mockVerify.mockReset();
  });

  test('401 sin header Authorization', async () => {
    const { env } = buildEnv([]);
    await expect(authenticate(req(), env)).rejects.toMatchObject({
      status: 401,
    });
  });

  test('401 con formato de header inválido', async () => {
    const { env } = buildEnv([]);
    await expect(
      authenticate(req({ Authorization: 'Token abc' }), env)
    ).rejects.toMatchObject({ status: 401 });
  });

  test('401 si el token no verifica', async () => {
    mockVerify.mockRejectedValue(new Error('bad token'));
    const { env } = buildEnv([]);

    await expect(
      authenticate(req({ Authorization: 'Bearer xyz' }), env)
    ).rejects.toMatchObject({ status: 401 });
  });

  test('403 si el correo no está verificado', async () => {
    mockVerify.mockResolvedValue({
      uid: 'fb-1',
      email: 'admin@a.com',
      emailVerified: false,
    });
    const { env } = buildEnv([]);

    await expect(
      authenticate(req({ Authorization: 'Bearer xyz' }), env)
    ).rejects.toMatchObject({ status: 403 });
  });

  test('403 si no existe un usuario D1 para ese correo/uid', async () => {
    mockVerify.mockResolvedValue({
      uid: 'fb-desconocido',
      email: 'nadie@a.com',
      emailVerified: true,
    });
    const { env } = buildEnv([]);

    await expect(
      authenticate(req({ Authorization: 'Bearer xyz' }), env)
    ).rejects.toMatchObject({ status: 403 });
  });

  test('403 si el usuario existe pero está inactivo', async () => {
    mockVerify.mockResolvedValue({
      uid: 'fb-1',
      email: 'admin@a.com',
      emailVerified: true,
    });
    const { env } = buildEnv([
      {
        id: 'USR-1',
        email: 'admin@a.com',
        firebaseUid: 'fb-1',
        role: 'TENANT_ADMIN',
        companyId: 'COMP-A',
        employeeId: null,
        active: 0,
      },
    ]);

    await expect(
      authenticate(req({ Authorization: 'Bearer xyz' }), env)
    ).rejects.toMatchObject({ status: 403 });
  });

  test('resuelve el usuario por firebaseUid', async () => {
    mockVerify.mockResolvedValue({
      uid: 'fb-1',
      email: 'admin@a.com',
      emailVerified: true,
    });
    const { env } = buildEnv([
      {
        id: 'USR-1',
        email: 'admin@a.com',
        firebaseUid: 'fb-1',
        role: 'TENANT_ADMIN',
        companyId: 'COMP-A',
        employeeId: null,
        active: 1,
      },
    ]);

    const user = await authenticate(
      req({ Authorization: 'Bearer xyz' }),
      env
    );

    expect(user).toEqual({
      id: 'USR-1',
      email: 'admin@a.com',
      role: 'TENANT_ADMIN',
      companyId: 'COMP-A',
      employeeId: null,
    });
  });

  test('en el primer login enlaza la cuenta por email y guarda el firebaseUid', async () => {
    mockVerify.mockResolvedValue({
      uid: 'fb-nuevo',
      email: 'admin@a.com',
      emailVerified: true,
    });

    const { env, updates } = buildEnv([
      {
        id: 'USR-1',
        email: 'admin@a.com',
        firebaseUid: null,
        role: 'TENANT_ADMIN',
        companyId: 'COMP-A',
        employeeId: null,
        active: 1,
      },
    ]);

    const user = await authenticate(
      req({ Authorization: 'Bearer xyz' }),
      env
    );

    expect(user.id).toBe('USR-1');
    expect(updates).toEqual([{ firebaseUid: 'fb-nuevo', id: 'USR-1' }]);
  });

  test('500 si falta FIREBASE_PROJECT_ID en el entorno', async () => {
    const { env } = buildEnv([]);
    (env as { FIREBASE_PROJECT_ID: string }).FIREBASE_PROJECT_ID = '';

    await expect(
      authenticate(req({ Authorization: 'Bearer xyz' }), env)
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe('audit', () => {
  test('no lanza aunque la escritura en D1 falle', async () => {
    const failingDb = {
      prepare() {
        return {
          bind() {
            return {
              async run() {
                throw new Error('D1 caído');
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const env: AuthEnv = {
      DB: failingDb,
      FIREBASE_PROJECT_ID: 'gestion-future-test',
    };

    await expect(
      audit(env, TENANT_ADMIN, 'CREATE', 'employee', 'EMP-1', 'COMP-A')
    ).resolves.toBeUndefined();
  });
});
