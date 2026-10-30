import { describe, test, expect } from '@jest/globals';
import { daysInclusive, intersectDateRanges } from '../src/services/dateRanges';

describe('daysInclusive', () => {
  test('un solo día es 1, no 0', () => {
    expect(daysInclusive('2026-03-10', '2026-03-10')).toBe(1);
  });

  test('cuenta ambos extremos', () => {
    expect(daysInclusive('2026-03-01', '2026-03-10')).toBe(10);
  });

  test('cruza fin de mes correctamente', () => {
    expect(daysInclusive('2026-01-28', '2026-02-02')).toBe(6);
  });
});

describe('intersectDateRanges', () => {
  test('null cuando no se solapan', () => {
    expect(
      intersectDateRanges('2026-01-01', '2026-01-10', '2026-01-11', '2026-01-20')
    ).toBeNull();
  });

  test('licencia totalmente contenida en el periodo', () => {
    const result = intersectDateRanges(
      '2026-03-05',
      '2026-03-10',
      '2026-03-01',
      '2026-03-31'
    );

    expect(result).toEqual({ start: '2026-03-05', end: '2026-03-10', days: 6 });
  });

  test('periodo totalmente contenido en la licencia (mes intermedio de una incapacidad larga)', () => {
    const result = intersectDateRanges(
      '2026-01-01',
      '2026-06-30',
      '2026-03-01',
      '2026-03-31'
    );

    expect(result).toEqual({ start: '2026-03-01', end: '2026-03-31', days: 31 });
  });

  test('la licencia empieza antes del periodo y termina dentro', () => {
    const result = intersectDateRanges(
      '2026-02-20',
      '2026-03-10',
      '2026-03-01',
      '2026-03-31'
    );

    expect(result).toEqual({ start: '2026-03-01', end: '2026-03-10', days: 10 });
  });

  test('la licencia empieza dentro del periodo y termina después', () => {
    const result = intersectDateRanges(
      '2026-03-20',
      '2026-04-15',
      '2026-03-01',
      '2026-03-31'
    );

    expect(result).toEqual({ start: '2026-03-20', end: '2026-03-31', days: 12 });
  });

  test('bordes que sólo se tocan en un día cuentan como solape', () => {
    const result = intersectDateRanges(
      '2026-02-01',
      '2026-03-01',
      '2026-03-01',
      '2026-03-31'
    );

    expect(result).toEqual({ start: '2026-03-01', end: '2026-03-01', days: 1 });
  });
});
