import { describe, test, expect } from '@jest/globals';
import { PartTimeEmployeeEngine, PartTimeEmployeeEngineError } from '../src/engine/hourly/partTimeEmployeeEngine';
import { CONSTANTS_2026 } from '../src/engine/countries/constants2026';
import type { PartTimeEmployeeInput } from '../src/types/hourly';

const RATE = 10_000;

function input(overrides: Partial<PartTimeEmployeeInput> = {}): PartTimeEmployeeInput {
  return {
    companyId: 'C1', engagementId: 'E1', professionalId: 'P1',
    firstName: 'Luz', lastName: 'Mesa', taxId: '1',
    hourlyRate: RATE, weeklyHours: 42, hoursWorked: 0,
    ...overrides,
  };
}

describe('pago por horas con recargos (camareros, aseo, temporales)', () => {
  test('cada tipo de hora se paga con su recargo', () => {
    const r = PartTimeEmployeeEngine.calculate(input({
      hours: {
        ordinary: 20, night: 10, sunday: 8, sundayNight: 4,
        extraDay: 2, extraNight: 3, extraSundayDay: 1, extraSundayNight: 1,
      },
    }));

    const N = CONSTANTS_2026.RECARGO_NOCTURNO_FACTOR; // 0.35
    const D = CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE; // 0.90

    // Toda hora ordinaria (diurna, nocturna, dominical) paga la tarifa base.
    expect(r.baseSalaryEarned).toBeCloseTo(RATE * 42, 2);
    expect(r.recargoNocturnoValue).toBeCloseTo(RATE * N * (10 + 4), 2);
    expect(r.extraDiurnaValue).toBeCloseTo(RATE * 1.25 * 2, 2);
    expect(r.extraNocturnaValue).toBeCloseTo(RATE * 1.75 * 3, 2);
    expect(r.dominicalFestivoValue).toBeCloseTo(
      RATE * D * (8 + 4) + RATE * (1.25 + D) * 1 + RATE * (1.75 + D) * 1,
      2
    );

    const surcharges = r.recargoNocturnoValue + r.extraDiurnaValue + r.extraNocturnaValue + r.dominicalFestivoValue;
    expect(r.ibcSecuritySocial).toBeCloseTo(r.baseSalaryEarned + surcharges, 2);
    expect(r.grossEarnings).toBeCloseTo(r.baseSalaryEarned + surcharges + r.earnedAuxTransporte, 2);
    expect(r.hoursBreakdown).toMatchObject({ ordinary: 20, night: 10, extraSundayNight: 1 });
  });

  test('las vacaciones se provisionan sólo sobre el salario ordinario (art. 192 CST)', () => {
    const r = PartTimeEmployeeEngine.calculate(input({ hours: { ordinary: 40, extraNight: 10 } }));
    expect(r.provisions.vacaciones).toBeCloseTo(RATE * 40 * CONSTANTS_2026.VACACIONES_RATE, 2);
  });

  test('el auxilio de transporte es proporcional a las horas ordinarias, no a las extra', () => {
    const withExtras = PartTimeEmployeeEngine.calculate(input({ hours: { ordinary: 40, extraDay: 10 } }));
    const without = PartTimeEmployeeEngine.calculate(input({ hours: { ordinary: 40 } }));
    expect(withExtras.earnedAuxTransporte).toBeCloseTo(without.earnedAuxTransporte, 2);
    expect(without.earnedAuxTransporte).toBeGreaterThan(0);
  });

  test('sin desglose, hoursWorked son horas ordinarias diurnas (compatibilidad)', () => {
    const legacy = PartTimeEmployeeEngine.calculate(input({ hoursWorked: 30 }));
    const explicit = PartTimeEmployeeEngine.calculate(input({ hours: { ordinary: 30 } }));
    expect(legacy.grossEarnings).toBeCloseTo(explicit.grossEarnings, 2);
    expect(legacy.recargoNocturnoValue).toBe(0);
  });

  test('rechaza horas negativas en cualquier tipo', () => {
    expect(() => PartTimeEmployeeEngine.calculate(input({ hours: { ordinary: 10, night: -1 } })))
      .toThrow(PartTimeEmployeeEngineError);
  });
});
