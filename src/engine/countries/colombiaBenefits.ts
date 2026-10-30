/**
 * PRESTACIONES SOCIALES Y LIQUIDACIÓN DEFINITIVA — COLOMBIA 2026
 *
 * Cálculos "en dinero" que el motor mensual sólo provisiona: pago de
 * prima de servicios, cesantías e intereses, compensación de
 * vacaciones e indemnización por despido sin justa causa.
 *
 * Todo se calcula en días comerciales (mes de 30, año de 360), como
 * exige la práctica laboral colombiana.
 */

import { CONSTANTS_2026 } from './constants2026';

export class ColombiaBenefitsError extends Error {}

function parts(iso: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new ColombiaBenefitsError(`Fecha inválida: ${iso}`);
  }
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

function isLastDayOfMonth(y: number, m: number, d: number): boolean {
  return new Date(Date.UTC(y, m, 0)).getUTCDate() === d;
}

/**
 * Días comerciales (año de 360) entre dos fechas, ambas incluidas.
 * El último día de cualquier mes cuenta como día 30 (así febrero
 * completo vale 30 y un año completo vale 360).
 */
export function days360(startIso: string, endIso: string): number {
  const [y1, m1, d1raw] = parts(startIso);
  const [y2, m2, d2raw] = parts(endIso);

  if (endIso < startIso) return 0;

  const d1 = Math.min(d1raw, 30);
  const d2 = isLastDayOfMonth(y2, m2, d2raw) ? 30 : Math.min(d2raw, 30);

  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1) + 1;
}

/** ¿Tiene derecho a auxilio de transporte? (hasta 2 SMMLV) */
export function earnsTransportAid(monthlySalary: number): boolean {
  return monthlySalary <= CONSTANTS_2026.SMMLV_LIMIT_AUX;
}

/**
 * Base mensual de prima y cesantías: salario + auxilio de transporte
 * (si aplica, art. 7 Ley 1 de 1963) + promedio mensual de lo variable
 * (horas extra, recargos, dominicales) del periodo que se liquida.
 */
export function benefitBase(monthlySalary: number, averageVariable = 0): number {
  return (
    monthlySalary +
    (earnsTransportAid(monthlySalary) ? CONSTANTS_2026.AUXILIO_TRANSPORTE : 0) +
    averageVariable
  );
}

/** Prima de servicios (art. 306 CST): un mes de salario por año. */
export function prima(base: number, days: number): number {
  return (base * days) / 360;
}

/** Cesantías (art. 249 CST): un mes de salario por año. */
export function cesantias(base: number, days: number): number {
  return (base * days) / 360;
}

/** Intereses sobre cesantías (Ley 52 de 1975): 12 % anual. */
export function interesesCesantias(cesantiasValue: number, days: number): number {
  return (cesantiasValue * days * 0.12) / 360;
}

/** Días hábiles de vacaciones causados (art. 186 CST): 15 por año. */
export function vacationDaysAccrued(daysWorked360: number): number {
  return (daysWorked360 * 15) / 360;
}

/**
 * Vacaciones en dinero: salario ordinario diario por día hábil
 * (art. 189 y 192 CST; sin extras ni dominicales).
 */
export function vacationPay(monthlySalary: number, businessDays: number): number {
  return (monthlySalary / 30) * businessDays;
}

/**
 * Tipos de contrato con los códigos de la DIAN (nómina electrónica).
 */
export type ContractType = '1' | '2' | '3' | '4' | '5';

export interface IndemnizacionInput {
  contractType: ContractType;
  monthlySalary: number;
  /** Días comerciales de servicio (para término indefinido). */
  serviceDays: number;
  /**
   * Días comerciales que faltaban para terminar el contrato (término
   * fijo u obra o labor).
   */
  remainingDays?: number;
}

/**
 * Indemnización por despido sin justa causa (art. 64 CST, modificado
 * por el art. 28 de la Ley 789 de 2002), en días de salario.
 */
export function indemnizacionDays(input: IndemnizacionInput): number {
  const { contractType, monthlySalary, serviceDays } = input;
  const remaining = Math.max(0, input.remainingDays ?? 0);

  switch (contractType) {
    case '2': {
      const high = monthlySalary >= 10 * CONSTANTS_2026.SMMLV;
      const firstYear = high ? 20 : 30;
      const perYear = high ? 15 : 20;
      const extraDays = Math.max(0, serviceDays - 360);
      return firstYear + (perYear * extraDays) / 360;
    }
    case '1':
      return remaining;
    case '3':
      return Math.max(remaining, 15);
    default:
      // Aprendizaje y prácticas no son contratos de trabajo con
      // indemnización del art. 64.
      return 0;
  }
}

export type TerminationReason =
  | 'RENUNCIA'
  | 'DESPIDO_JUSTA_CAUSA'
  | 'DESPIDO_SIN_JUSTA_CAUSA'
  | 'MUTUO_ACUERDO'
  | 'FIN_CONTRATO';

export const TERMINATION_REASONS: TerminationReason[] = [
  'RENUNCIA',
  'DESPIDO_JUSTA_CAUSA',
  'DESPIDO_SIN_JUSTA_CAUSA',
  'MUTUO_ACUERDO',
  'FIN_CONTRATO',
];

export interface TerminationInput {
  monthlySalary: number;
  /** Promedio mensual variable (extras, recargos) del último año. */
  averageVariable?: number;
  isIntegralSalary?: boolean;
  contractType: ContractType;
  reason: TerminationReason;
  hireDate: string;
  terminationDate: string;
  /** Fin pactado (término fijo u obra) para la indemnización. */
  contractEndDate?: string;
  /** Desde cuándo se deben cesantías (tras la última consignación). */
  cesantiasFrom: string;
  /** Desde cuándo se debe prima (tras el último pago semestral). */
  primaFrom: string;
  /** Días hábiles de vacaciones causados y no disfrutados. */
  vacationDaysPending: number;
}

export interface TerminationLine {
  concept: string;
  base: number;
  days: number;
  amount: number;
}

export interface TerminationResult {
  serviceDays: number;
  lines: TerminationLine[];
  /** Retención en la fuente sobre la indemnización (art. 401-3 ET). */
  retencionIndemnizacion: number;
  total: number;
  notes: string[];
}

function addOneDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Liquidación definitiva del contrato. No incluye el salario de los
 * últimos días trabajados: ese se liquida en la nómina del periodo.
 */
export function liquidacionDefinitiva(input: TerminationInput): TerminationResult {
  const {
    monthlySalary,
    averageVariable = 0,
    isIntegralSalary = false,
    terminationDate,
  } = input;

  if (!(monthlySalary > 0)) {
    throw new ColombiaBenefitsError('El salario debe ser mayor que cero.');
  }

  if (terminationDate < input.hireDate) {
    throw new ColombiaBenefitsError('La fecha de retiro es anterior a la de ingreso.');
  }

  const serviceDays = days360(input.hireDate, terminationDate);
  const lines: TerminationLine[] = [];
  const notes: string[] = [];

  if (!isIntegralSalary) {
    const base = benefitBase(monthlySalary, averageVariable);

    const cesDays = days360(input.cesantiasFrom, terminationDate);
    const ces = cesantias(base, cesDays);
    lines.push({ concept: 'Cesantías', base, days: cesDays, amount: ces });
    lines.push({
      concept: 'Intereses sobre cesantías',
      base: ces,
      days: cesDays,
      amount: interesesCesantias(ces, cesDays),
    });

    const primaDays = days360(input.primaFrom, terminationDate);
    lines.push({ concept: 'Prima de servicios', base, days: primaDays, amount: prima(base, primaDays) });
  } else {
    notes.push('Salario integral: ya incluye cesantías, intereses y prima (art. 132 CST).');
  }

  // Las vacaciones se deben también con salario integral (art. 132 CST).
  const vacDays = Math.max(0, input.vacationDaysPending);
  if (vacDays > 0) {
    lines.push({
      concept: 'Vacaciones compensadas en dinero',
      base: monthlySalary,
      days: round2(vacDays),
      amount: vacationPay(monthlySalary, vacDays),
    });
  }

  let retencionIndemnizacion = 0;

  if (input.reason === 'DESPIDO_SIN_JUSTA_CAUSA') {
    const remainingDays =
      input.contractEndDate && input.contractEndDate > terminationDate
        ? days360(addOneDay(terminationDate), input.contractEndDate)
        : 0;

    if ((input.contractType === '1' || input.contractType === '3') && !input.contractEndDate) {
      notes.push('Falta la fecha de terminación pactada: la indemnización usa el mínimo legal.');
    }

    const days = indemnizacionDays({
      contractType: input.contractType,
      monthlySalary,
      serviceDays,
      remainingDays,
    });

    const amount = (monthlySalary / 30) * days;

    if (amount > 0) {
      lines.push({ concept: 'Indemnización por despido sin justa causa (art. 64 CST)', base: monthlySalary, days: round2(days), amount });

      // Art. 401-3 ET: retención del 20 % si el trabajador devenga
      // más de 204 UVT mensuales.
      if (monthlySalary > 204 * CONSTANTS_2026.UVT) {
        retencionIndemnizacion = amount * 0.2;
      }
    }
  }

  const gross = lines.reduce((sum, l) => sum + l.amount, 0);

  notes.push(
    'El salario de los últimos días trabajados se liquida en la nómina del periodo.',
    'Validar con el contador la retención y los aportes sobre vacaciones compensadas.'
  );

  return {
    serviceDays,
    lines: lines.map(l => ({ ...l, base: round2(l.base), amount: round2(l.amount) })),
    retencionIndemnizacion: round2(retencionIndemnizacion),
    total: round2(gross - retencionIndemnizacion),
    notes,
  };
}

export interface SemesterBounds {
  start: string;
  end: string;
}

/** Semestre de la prima: 1 = enero–junio, 2 = julio–diciembre. */
export function primaSemester(year: number, semester: 1 | 2): SemesterBounds {
  return semester === 1
    ? { start: `${year}-01-01`, end: `${year}-06-30` }
    : { start: `${year}-07-01`, end: `${year}-12-31` };
}
