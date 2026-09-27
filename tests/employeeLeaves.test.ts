import { describe, test, expect } from '@jest/globals';

import { ColombiaPayrollEngine } from '../src/engine/countries/colombiaEngine';
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
    baseSalaryMonthly: 3_000_000,
    daysWorked: 20,
    ...overrides,
  };
}

describe('Incapacidad general (enfermedad común)', () => {
  test('dentro de los primeros 90 días: 66.67% del salario diario', () => {
    const dailyRate = 3_000_000 / 30;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 20,
        leave: {
          type: 'GENERAL_INCAPACITY',
          daysInPeriod: 10,
          accumulatedDaysBefore: 0,
        },
      })
    );

    expect(result.leaveValue).toBeCloseTo(10 * dailyRate * 0.6667, 2);
  });

  test('cruza el tramo 90→180 dentro del mismo período: se reparte entre ambas tarifas', () => {
    const dailyRate = 3_000_000 / 30;
    const pisoDiario = CONSTANTS_2026.SMMLV / 30;

    // 85 días acumulados antes + 10 días en este período: 5 días
    // cierran el tramo de 90 (66.67%) y 5 quedan en el de 180 (50%,
    // que aquí activa el piso de 1 SMMLV/día porque el 50% de este
    // salario cae por debajo de él).
    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 5,
        leave: {
          type: 'GENERAL_INCAPACITY',
          daysInPeriod: 10,
          accumulatedDaysBefore: 85,
        },
      })
    );

    const expected =
      5 * dailyRate * 0.6667 + 5 * Math.max(dailyRate * 0.50, pisoDiario);

    expect(dailyRate * 0.50).toBeLessThan(pisoDiario); // confirma que el piso sí aplica en este caso
    expect(result.leaveValue).toBeCloseTo(expected, 2);
  });

  test('los días que superan 180 acumulados no se pagan y generan advertencia', () => {
    const dailyRate = 3_000_000 / 30;
    const pisoDiario = CONSTANTS_2026.SMMLV / 30;

    // 178 días acumulados + 10 en este período: sólo 2 días caben en
    // el tramo de 180 (50%, con piso de 1 SMMLV/día), los 8
    // restantes ya no se pagan.
    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 20,
        leave: {
          type: 'GENERAL_INCAPACITY',
          daysInPeriod: 10,
          accumulatedDaysBefore: 178,
        },
      })
    );

    const expected = 2 * Math.max(dailyRate * 0.50, pisoDiario);
    expect(result.leaveValue).toBeCloseTo(expected, 2);
    expect(
      result.complianceNotes.some(note => note.includes('180 días'))
    ).toBe(true);
  });

  test('nunca paga menos del piso diario de 1 SMMLV', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        baseSalaryMonthly: CONSTANTS_2026.SMMLV,
        daysWorked: 0,
        leave: {
          type: 'GENERAL_INCAPACITY',
          daysInPeriod: 5,
          accumulatedDaysBefore: 0,
        },
      })
    );

    const pisoDiario = CONSTANTS_2026.SMMLV / 30;
    expect(result.leaveValue).toBeCloseTo(5 * pisoDiario, 2);
  });
});

describe('Incapacidad laboral y licencias de maternidad/paternidad', () => {
  test('incapacidad laboral (ARL): 100% del salario diario desde el día 1', () => {
    const dailyRate = 3_000_000 / 30;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 20,
        leave: { type: 'WORK_INCAPACITY', daysInPeriod: 10 },
      })
    );

    expect(result.leaveValue).toBeCloseTo(10 * dailyRate, 2);
  });

  test('licencia de maternidad: 100% del salario diario', () => {
    const dailyRate = 3_000_000 / 30;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 0,
        leave: { type: 'MATERNITY_LEAVE', daysInPeriod: 30 },
      })
    );

    expect(result.leaveValue).toBeCloseTo(30 * dailyRate, 2);
  });

  test('licencia de paternidad: 100% del salario diario', () => {
    const dailyRate = 3_000_000 / 30;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 16,
        leave: { type: 'PATERNITY_LEAVE', daysInPeriod: 14 },
      })
    );

    expect(result.leaveValue).toBeCloseTo(14 * dailyRate, 2);
  });
});

describe('Monto recobrable a EPS/ARL', () => {
  test('incapacidad general: excluye los 2 primeros días absolutos (asume el empleador)', () => {
    const dailyRate = 3_000_000 / 30;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 20,
        leave: {
          type: 'GENERAL_INCAPACITY',
          daysInPeriod: 10,
          accumulatedDaysBefore: 0,
        },
      })
    );

    const totalValue = 10 * dailyRate * 0.6667;
    const nonReimbursable = 2 * dailyRate * 0.6667;

    expect(result.reimbursableAmount).toBeCloseTo(
      totalValue - nonReimbursable,
      2
    );
  });

  test('incapacidad general: si ya superó los 2 días en un período anterior, todo es recobrable', () => {
    const dailyRate = 3_000_000 / 30;

    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 20,
        leave: {
          type: 'GENERAL_INCAPACITY',
          daysInPeriod: 10,
          accumulatedDaysBefore: 5, // ya pasó el día 2 en un período anterior
        },
      })
    );

    expect(result.reimbursableAmount).toBeCloseTo(result.leaveValue, 2);
  });

  test('incapacidad laboral y licencias: 100% recobrable desde el día 1', () => {
    const workResult = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 20,
        leave: { type: 'WORK_INCAPACITY', daysInPeriod: 10 },
      })
    );

    expect(workResult.reimbursableAmount).toBeCloseTo(
      workResult.leaveValue,
      2
    );

    const maternityResult = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 0,
        leave: { type: 'MATERNITY_LEAVE', daysInPeriod: 30 },
      })
    );

    expect(maternityResult.reimbursableAmount).toBeCloseTo(
      maternityResult.leaveValue,
      2
    );
  });
});

describe('Integración con IBC, aportes y provisiones', () => {
  test('el leaveValue entra al devengado, al IBC y se sigue provisionando', () => {
    const withoutLeave = ColombiaPayrollEngine.calculate(
      baseInput({ daysWorked: 20 })
    );

    const withLeave = ColombiaPayrollEngine.calculate(
      baseInput({
        daysWorked: 20,
        leave: { type: 'GENERAL_INCAPACITY', daysInPeriod: 10 },
      })
    );

    expect(withLeave.grossEarnings).toBeGreaterThan(
      withoutLeave.grossEarnings
    );
    expect(withLeave.ibcSecuritySocial).toBeGreaterThan(
      withoutLeave.ibcSecuritySocial
    );
    expect(withLeave.provisions.totalProvisions).toBeGreaterThan(0);
  });

  test('días trabajados + incapacidad cubriendo el mes completo activa el piso de IBC', () => {
    const result = ColombiaPayrollEngine.calculate(
      baseInput({
        baseSalaryMonthly: CONSTANTS_2026.SMMLV,
        daysWorked: 20,
        leave: { type: 'GENERAL_INCAPACITY', daysInPeriod: 10 },
      })
    );

    expect(result.ibcSecuritySocial).toBeGreaterThanOrEqual(
      CONSTANTS_2026.SMMLV
    );
  });
});
