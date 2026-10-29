import { describe, test, expect } from '@jest/globals';

import {
  days360,
  benefitBase,
  prima,
  cesantias,
  interesesCesantias,
  vacationDaysAccrued,
  indemnizacionDays,
  liquidacionDefinitiva,
} from '../src/engine/countries/colombiaBenefits';
import { CONSTANTS_2026 } from '../src/engine/countries/constants2026';

const SMMLV = CONSTANTS_2026.SMMLV;
const AUX = CONSTANTS_2026.AUXILIO_TRANSPORTE;

describe('Días comerciales (360)', () => {
  test.each([
    ['2026-01-01', '2026-12-31', 360],
    ['2026-01-01', '2026-06-30', 180],
    ['2026-02-01', '2026-02-28', 30],
    ['2026-03-16', '2026-03-31', 15],
    ['2025-02-01', '2026-01-31', 360],
    ['2026-07-10', '2026-07-10', 1],
  ])('%s a %s = %i días', (a, b, expected) => {
    expect(days360(a, b)).toBe(expected);
  });
});

describe('Prima, cesantías e intereses', () => {
  test('base con auxilio de transporte hasta 2 SMMLV y promedio variable', () => {
    expect(benefitBase(2_000_000, 50_000)).toBe(2_000_000 + AUX + 50_000);
    expect(benefitBase(4_000_000)).toBe(4_000_000);
  });

  test('semestre completo = medio salario base; año completo de cesantías = un mes', () => {
    const base = benefitBase(SMMLV);
    expect(prima(base, 180)).toBeCloseTo(base / 2, 6);
    expect(cesantias(base, 360)).toBeCloseTo(base, 6);
    expect(interesesCesantias(base, 360)).toBeCloseTo(base * 0.12, 6);
  });

  test('15 días hábiles de vacaciones por año', () => {
    expect(vacationDaysAccrued(360)).toBe(15);
    expect(vacationDaysAccrued(180)).toBe(7.5);
  });
});

describe('Indemnización (art. 64 CST)', () => {
  test('término indefinido < 10 SMMLV: 30 días el primer año y 20 por cada año siguiente', () => {
    expect(indemnizacionDays({ contractType: '2', monthlySalary: SMMLV, serviceDays: 200 })).toBe(30);
    expect(indemnizacionDays({ contractType: '2', monthlySalary: SMMLV, serviceDays: 540 })).toBe(40);
  });

  test('término indefinido >= 10 SMMLV: 20 días y 15 por año siguiente', () => {
    expect(indemnizacionDays({ contractType: '2', monthlySalary: 10 * SMMLV, serviceDays: 720 })).toBe(35);
  });

  test('término fijo: lo que faltaba del contrato; obra o labor: mínimo 15 días', () => {
    expect(indemnizacionDays({ contractType: '1', monthlySalary: SMMLV, serviceDays: 100, remainingDays: 75 })).toBe(75);
    expect(indemnizacionDays({ contractType: '3', monthlySalary: SMMLV, serviceDays: 100, remainingDays: 5 })).toBe(15);
    expect(indemnizacionDays({ contractType: '4', monthlySalary: SMMLV, serviceDays: 100 })).toBe(0);
  });
});

describe('Liquidación definitiva', () => {
  test('renuncia: cesantías, intereses, prima y vacaciones pendientes; sin indemnización', () => {
    const r = liquidacionDefinitiva({
      monthlySalary: 2_000_000,
      contractType: '2',
      reason: 'RENUNCIA',
      hireDate: '2025-02-01',
      terminationDate: '2026-03-31',
      cesantiasFrom: '2026-01-01',
      primaFrom: '2026-01-01',
      vacationDaysPending: 10,
    });

    const base = 2_000_000 + AUX;
    const byConcept = Object.fromEntries(r.lines.map(l => [l.concept, l]));

    expect(r.serviceDays).toBe(420);
    expect(byConcept['Cesantías'].days).toBe(90);
    expect(byConcept['Cesantías'].amount).toBeCloseTo(base / 4, 1);
    expect(byConcept['Intereses sobre cesantías'].amount).toBeCloseTo((base / 4) * 0.03, 1);
    expect(byConcept['Prima de servicios'].amount).toBeCloseTo(base / 4, 1);
    expect(byConcept['Vacaciones compensadas en dinero'].amount).toBeCloseTo((2_000_000 / 30) * 10, 1);
    expect(r.lines.some(l => l.concept.startsWith('Indemnización'))).toBe(false);
  });

  test('despido sin justa causa con término indefinido suma indemnización', () => {
    const r = liquidacionDefinitiva({
      monthlySalary: SMMLV,
      contractType: '2',
      reason: 'DESPIDO_SIN_JUSTA_CAUSA',
      hireDate: '2024-07-01',
      terminationDate: '2026-06-30',
      cesantiasFrom: '2026-01-01',
      primaFrom: '2026-01-01',
      vacationDaysPending: 0,
    });

    const ind = r.lines.find(l => l.concept.startsWith('Indemnización'))!;

    expect(ind.days).toBe(50); // 30 + 20 por el segundo año
    expect(ind.amount).toBeCloseTo((SMMLV / 30) * 50, 1);
    expect(r.retencionIndemnizacion).toBe(0);
  });

  test('salario integral: sin prestaciones pero sí vacaciones; indemnización con retención del 20 %', () => {
    const salary = 15 * SMMLV;
    const r = liquidacionDefinitiva({
      monthlySalary: salary,
      isIntegralSalary: true,
      contractType: '2',
      reason: 'DESPIDO_SIN_JUSTA_CAUSA',
      hireDate: '2026-01-01',
      terminationDate: '2026-06-30',
      cesantiasFrom: '2026-01-01',
      primaFrom: '2026-01-01',
      vacationDaysPending: 7.5,
    });

    expect(r.lines.map(l => l.concept)).toEqual([
      'Vacaciones compensadas en dinero',
      'Indemnización por despido sin justa causa (art. 64 CST)',
    ]);

    const ind = r.lines[1].amount;
    expect(r.retencionIndemnizacion).toBeCloseTo(ind * 0.2, 1);
  });

  test('término fijo despedido antes del plazo: salarios del tiempo faltante', () => {
    const r = liquidacionDefinitiva({
      monthlySalary: 3_000_000,
      contractType: '1',
      reason: 'DESPIDO_SIN_JUSTA_CAUSA',
      hireDate: '2026-01-01',
      terminationDate: '2026-03-31',
      contractEndDate: '2026-06-30',
      cesantiasFrom: '2026-01-01',
      primaFrom: '2026-01-01',
      vacationDaysPending: 0,
    });

    const ind = r.lines.find(l => l.concept.startsWith('Indemnización'))!;
    expect(ind.days).toBe(90);
    expect(ind.amount).toBeCloseTo(9_000_000, 1);
  });
});
