import { describe, test, expect } from '@jest/globals';

import { getNextDianConsecutive } from '../src/services/dianCounters';

/**
 * D1 falso mínimo: sólo entiende el INSERT ... ON CONFLICT DO NOTHING
 * y el UPDATE ... RETURNING que emite getNextDianConsecutive.
 */
function createFakeDb(): D1Database {
  const counters = new Map<string, number>();

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes('INSERT INTO dian_counters')) {
                const [companyId, documentType] = args as [string, string];
                const key = companyId + '|' + documentType;

                if (!counters.has(key)) {
                  counters.set(key, 0);
                }
              }

              return { success: true } as unknown;
            },

            async first<T>(): Promise<T | null> {
              if (sql.includes('UPDATE dian_counters')) {
                const [companyId, documentType] = args as [string, string];
                const key = companyId + '|' + documentType;
                const next = (counters.get(key) ?? 0) + 1;

                counters.set(key, next);

                return { lastConsecutive: next } as unknown as T;
              }

              return null;
            },
          };
        },
      };
    },
  };

  return db as unknown as D1Database;
}

describe('getNextDianConsecutive', () => {
  test('empieza en 1 para una empresa/documento nuevos', async () => {
    const db = createFakeDb();

    const first = await getNextDianConsecutive(db, 'COMP-A', 'NOMINA');

    expect(first).toBe(1);
  });

  test('es consecutivo sin huecos en llamadas sucesivas', async () => {
    const db = createFakeDb();

    const first = await getNextDianConsecutive(db, 'COMP-A', 'NOMINA');
    const second = await getNextDianConsecutive(db, 'COMP-A', 'NOMINA');
    const third = await getNextDianConsecutive(db, 'COMP-A', 'NOMINA');

    expect([first, second, third]).toEqual([1, 2, 3]);
  });

  test('NOMINA y DOCUMENTO_SOPORTE llevan series independientes', async () => {
    const db = createFakeDb();

    const nomina1 = await getNextDianConsecutive(db, 'COMP-A', 'NOMINA');
    const soporte1 = await getNextDianConsecutive(db, 'COMP-A', 'DOCUMENTO_SOPORTE');
    const nomina2 = await getNextDianConsecutive(db, 'COMP-A', 'NOMINA');

    expect(nomina1).toBe(1);
    expect(soporte1).toBe(1);
    expect(nomina2).toBe(2);
  });

  test('cada empresa tiene su propia serie', async () => {
    const db = createFakeDb();

    const companyA1 = await getNextDianConsecutive(db, 'COMP-A', 'NOMINA');
    const companyB1 = await getNextDianConsecutive(db, 'COMP-B', 'NOMINA');
    const companyA2 = await getNextDianConsecutive(db, 'COMP-A', 'NOMINA');

    expect(companyA1).toBe(1);
    expect(companyB1).toBe(1);
    expect(companyA2).toBe(2);
  });
});
