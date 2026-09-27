import { describe, test, expect } from '@jest/globals';

import {
  ColombiaPayrollEngine,
  ColombiaPayrollEngineError,
} from '../src/engine/countries/colombiaEngine';

import { CONSTANTS_2026 } from '../src/engine/countries/constants2026';

import type { ColombiaPayrollInput } from '../src/types/payroll';

function baseInput(
  overrides: Partial<ColombiaPayrollInput> = {}
): ColombiaPayrollInput {
  return {
    employeeId: 'EMP-1',
    firstName: 'Ana',
    lastName: 'Gómez',
    taxId: '123456789',
    baseSalaryMonthly: CONSTANTS_2026.SMMLV,
    daysWorked: 30,
    ...overrides,
  };
}

describe('Recargo dominical/festivo (Ley 2466 de 2025)', () => {
  test('horas ordinarias en domingo/festivo se recargan al 90% vigente', () => {
    const baseSalary = 3_000_000;
    const hourlyRate = baseSalary / CONSTANTS_2026.MONTHLY_ORDINARY_HOURS;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        baseSalaryMonthly: baseSalary,
        horasDominicalFestivo: 8,
      })
    );

    expect(CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE).toBe(0.90);

    const expected = 8 * hourlyRate * CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE;
    expect(result.dominicalFestivoValue).toBeCloseTo(expected, 2);
  });

  test('horas extra en domingo/festivo suman el recargo de extra diurna y el dominical', () => {
    const baseSalary = 3_000_000;
    const hourlyRate = baseSalary / CONSTANTS_2026.MONTHLY_ORDINARY_HOURS;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        baseSalaryMonthly: baseSalary,
        horasExtraDominicalFestivo: 4,
      })
    );

    const combinedSurcharge =
      (CONSTANTS_2026.EXTRA_DIURNA_MULTIPLIER - 1) +
      CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE;

    expect(combinedSurcharge).toBeCloseTo(1.15, 5);

    const expected = 4 * hourlyRate * combinedSurcharge;
    expect(result.dominicalFestivoValue).toBeCloseTo(expected, 2);
  });

  test('el recargo dominical/festivo entra al devengado y al IBC', () => {
    const withoutDominical = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: 3_000_000 })
    );

    const withDominical = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: 3_000_000, horasDominicalFestivo: 8 })
    );

    expect(withDominical.grossEarnings).toBeGreaterThan(
      withoutDominical.grossEarnings
    );
    expect(withDominical.ibcSecuritySocial).toBeGreaterThan(
      withoutDominical.ibcSecuritySocial
    );
  });
});

describe('Tope de IBC (25 SMMLV)', () => {
  test('un salario de 30 SMMLV cotiza sobre 25 SMMLV, no sobre 30', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: CONSTANTS_2026.SMMLV * 30 })
    );

    const ibcMax = CONSTANTS_2026.SMMLV * CONSTANTS_2026.IBC_MAX_SMMLV_MULTIPLE;
    expect(result.ibcSecuritySocial).toBeCloseTo(ibcMax, 2);
  });

  test('con período completo, el IBC nunca baja de 1 SMMLV', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: CONSTANTS_2026.SMMLV, daysWorked: 30 })
    );

    expect(result.ibcSecuritySocial).toBeGreaterThanOrEqual(
      CONSTANTS_2026.SMMLV
    );
  });

  test('con novedades (menos de 30 días), el IBC sí puede ser menor a 1 SMMLV', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: CONSTANTS_2026.SMMLV, daysWorked: 10 })
    );

    expect(result.ibcSecuritySocial).toBeLessThan(CONSTANTS_2026.SMMLV);
  });
});

describe('Salario integral', () => {
  test('rechaza un salario integral por debajo de 13 SMMLV', () => {
    expect(() =>
      ColombiaPayrollEngine.calculate(
        baseInput({
          baseSalaryMonthly: CONSTANTS_2026.SMMLV * 12,
          isIntegralSalary: true,
        })
      )
    ).toThrow(ColombiaPayrollEngineError);
  });

  test('con 13 SMMLV, el IBC es el 70% del devengado y las provisiones son 0', () => {
    const integralSalary = CONSTANTS_2026.SMMLV * 13;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        baseSalaryMonthly: integralSalary,
        isIntegralSalary: true,
      })
    );

    expect(result.ibcSecuritySocial).toBeCloseTo(
      integralSalary * CONSTANTS_2026.INTEGRAL_SALARY_IBC_FACTOR,
      2
    );

    expect(result.provisions.cesantias).toBe(0);
    expect(result.provisions.interesesCesantias).toBe(0);
    expect(result.provisions.primaServicios).toBe(0);
    expect(result.provisions.vacaciones).toBe(0);
    expect(result.provisions.totalProvisions).toBe(0);
  });
});

describe('Retención en la fuente de empleados (procedimiento 1, simplificado)', () => {
  test('por debajo de 95 UVT no retiene', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: CONSTANTS_2026.SMMLV })
    );

    expect(result.employeeDeductions.retencionFuente).toBe(0);
    expect(result.complianceNotes).toEqual([]);
  });

  test('calcula la retención según la tabla del art. 383 ET para un caso conocido', () => {
    // $8.000.000, 30 días, sin aux. transporte (supera el umbral),
    // sin horas extra: caso limpio para verificar la fórmula.
    const baseSalary = 8_000_000;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: baseSalary })
    );

    const mandatoryDeductions =
      result.employeeDeductions.health4pct +
      result.employeeDeductions.pension4pct +
      result.employeeDeductions.fspValue;

    const ingresoGravable =
      result.grossEarnings - result.earnedAuxTransporte - mandatoryDeductions;

    const rentaExenta =
      ingresoGravable * CONSTANTS_2026.RETENCION_EMPLEADOS_RENTA_EXENTA_PCT;

    const baseGravable = ingresoGravable - rentaExenta;
    const baseGravableUVT = baseGravable / CONSTANTS_2026.UVT;

    const tramo = CONSTANTS_2026.RETENCION_EMPLEADOS_TABLE.find(
      t => baseGravableUVT <= t.hastaUVT
    )!;

    const expectedRetention =
      ((baseGravableUVT - tramo.desdeUVT) * tramo.tarifa + tramo.uvtBase) *
      CONSTANTS_2026.UVT;

    expect(baseGravableUVT).toBeGreaterThan(95);
    expect(result.employeeDeductions.retencionFuente).toBeCloseTo(
      expectedRetention,
      1
    );
    expect(result.employeeDeductions.retencionFuente).toBeGreaterThan(0);
    expect(result.complianceNotes.length).toBeGreaterThan(0);
  });

  test('nunca es negativa', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: CONSTANTS_2026.SMMLV, daysWorked: 1 })
    );

    expect(result.employeeDeductions.retencionFuente).toBeGreaterThanOrEqual(0);
  });

  test('reduce el neto a pagar', () => {
    const baseSalary = 8_000_000;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: baseSalary })
    );

    expect(result.employeeDeductions.retencionFuente).toBeGreaterThan(0);
    expect(result.netPay).toBeCloseTo(
      result.grossEarnings - result.employeeDeductions.totalDeductions,
      2
    );
  });
});
