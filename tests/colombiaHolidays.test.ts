import { describe, test, expect } from '@jest/globals';

import {
  colombianHolidays,
  businessDaysBetween,
} from '../src/services/colombiaHolidays';

describe('Festivos de Colombia', () => {
  test('2026 coincide con el calendario oficial (18 festivos)', () => {
    expect([...colombianHolidays(2026)].sort()).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03',
      '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29',
      '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02',
      '2026-11-16', '2026-12-08', '2026-12-25',
    ]);
  });

  test('2025: Semana Santa y festivos trasladados al lunes', () => {
    const h = colombianHolidays(2025);

    expect(h.has('2025-04-17')).toBe(true); // Jueves Santo
    expect(h.has('2025-04-18')).toBe(true); // Viernes Santo
    expect(h.has('2025-06-02')).toBe(true); // Ascensión
    expect(h.has('2025-01-06')).toBe(true); // Reyes ya cae en lunes
    // San Pedro y Sagrado Corazón coinciden el lunes 30 de junio.
    expect(h.has('2025-06-30')).toBe(true);
    expect(h.size).toBe(17);
  });
});

describe('Días hábiles para vacaciones', () => {
  test('lunes a sábado sin festivos', () => {
    // 2026-12-14 (lunes) a 2026-12-31: 18 días, 2 domingos, 1 festivo (25).
    expect(businessDaysBetween('2026-12-14', '2026-12-31')).toBe(15);
  });

  test('lunes a viernes cuando el sábado no es hábil', () => {
    expect(businessDaysBetween('2026-12-14', '2026-12-31', false)).toBe(13);
  });
});
