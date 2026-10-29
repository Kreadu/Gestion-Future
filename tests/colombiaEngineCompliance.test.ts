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

  test('horas extra en domingo/festivo pagan la hora completa más ambos recargos (factor 2.15)', () => {
    const baseSalary = 3_000_000;
    const hourlyRate = baseSalary / CONSTANTS_2026.MONTHLY_ORDINARY_HOURS;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        baseSalaryMonthly: baseSalary,
        horasExtraDominicalFestivo: 4,
      })
    );

    // La hora extra no está cubierta por el salario: se paga la hora
    // (100%) + 25% de extra diurna + 90% dominical = 2.15.
    const factor =
      CONSTANTS_2026.EXTRA_DIURNA_MULTIPLIER +
      CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE;

    expect(factor).toBeCloseTo(2.15, 5);

    const expected = 4 * hourlyRate * factor;
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

describe('Retención en la fuente: tope de la renta exenta (Ley 2277 de 2022)', () => {
  test('la renta exenta del 25% no supera 790 UVT anuales (790/12 UVT al mes)', () => {
    const baseSalary = 30_000_000;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: baseSalary })
    );

    const ibc = result.ibcSecuritySocial;
    const mandatory = ibc * 0.08 + result.employeeDeductions.fspValue;
    const ingresoGravable = baseSalary - mandatory;
    const rentaExenta = Math.min(
      ingresoGravable * 0.25,
      (790 / 12) * CONSTANTS_2026.UVT
    );
    const baseUVT = (ingresoGravable - rentaExenta) / CONSTANTS_2026.UVT;

    // 360 < baseUVT < 640 → tramo del 33% con 69 UVT acumulados.
    expect(baseUVT).toBeGreaterThan(360);
    expect(baseUVT).toBeLessThan(640);

    const expected = ((baseUVT - 360) * 0.33 + 69) * CONSTANTS_2026.UVT;

    expect(result.employeeDeductions.retencionFuente).toBeCloseTo(expected, 0);
  });
});

describe('Exoneración art. 114-1 ET', () => {
  test('aplica a quien devenga menos de 10 SMMLV', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: 5_000_000, isExempt114_1: true })
    );

    expect(result.employerContributions.health8_5pct).toBe(0);
    expect(result.employerContributions.sena2pct).toBe(0);
    expect(result.employerContributions.icbf3pct).toBe(0);
  });

  test('no aplica a quien devenga 10 SMMLV o más, aunque la empresa sea exonerada', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        baseSalaryMonthly: CONSTANTS_2026.SMMLV * 10,
        isExempt114_1: true,
      })
    );

    expect(result.employerContributions.health8_5pct).toBeGreaterThan(0);
    expect(result.employerContributions.sena2pct).toBeGreaterThan(0);
    expect(result.employerContributions.icbf3pct).toBeGreaterThan(0);
  });
});

describe('Provisión de vacaciones (art. 192 CST)', () => {
  test('excluye horas extra y trabajo dominical/festivo de la base', () => {
    const baseSalary = 2_000_000;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        baseSalaryMonthly: baseSalary,
        extraDiurna: 4,
        horasDominicalFestivo: 8,
        horasExtraDominicalFestivo: 2,
      })
    );

    expect(result.provisions.vacaciones).toBeCloseTo(
      baseSalary * CONSTANTS_2026.VACACIONES_RATE,
      2
    );
  });

  test('incluye el recargo nocturno ordinario', () => {
    const baseSalary = 2_000_000;
    const hourlyRate = baseSalary / CONSTANTS_2026.MONTHLY_ORDINARY_HOURS;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({ baseSalaryMonthly: baseSalary, recargoNocturno: 10 })
    );

    const recargo = 10 * hourlyRate * CONSTANTS_2026.RECARGO_NOCTURNO_FACTOR;

    expect(result.provisions.vacaciones).toBeCloseTo(
      (baseSalary + recargo) * CONSTANTS_2026.VACACIONES_RATE,
      2
    );
  });
});
