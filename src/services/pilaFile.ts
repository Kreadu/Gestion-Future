/**
 * Archivo plano PILA (Planilla Integrada de Liquidación de Aportes)
 * para la planilla tipo E (empleados), según el Anexo Técnico 2 de la
 * Resolución 2388 de 2016 del Ministerio de Salud y sus
 * modificaciones.
 *
 * Lógica pura (sin base de datos): recibe los datos ya liquidados del
 * periodo y devuelve el texto de longitud fija listo para cargar en el
 * operador (SOI, Aportes en Línea, Mi Planilla...).
 *
 *   - Registro tipo 1: encabezado del aportante (358 caracteres).
 *   - Registro tipo 2: uno por cotizante y por novedad (693 caracteres).
 *     Cada incapacidad, licencia o vacación del mes va en su propia
 *     línea con sus días, su IBC y sus fechas; la línea "base" lleva
 *     los días efectivamente trabajados y las novedades ING/RET.
 *
 * Reglas de formato: los campos numéricos van alineados a la derecha
 * con ceros; los alfanuméricos a la izquierda con espacios, en
 * mayúsculas y sin tildes ni eñes (un carácter = un byte). El IBC se
 * aproxima al peso superior y los aportes al múltiplo de 100 superior.
 */

import { CONSTANTS_2026 } from '../engine/countries/constants2026';

// ------------------------------------------------------------
// ESTRUCTURA
// ------------------------------------------------------------

type FieldKind = 'A' | 'N';

export interface FieldDef {
  name: string;
  length: number;
  kind: FieldKind;
}

const A = (name: string, length: number): FieldDef => ({ name, length, kind: 'A' });
const N = (name: string, length: number): FieldDef => ({ name, length, kind: 'N' });

/** Registro tipo 1 — encabezado del aportante. */
export const HEADER_FIELDS: FieldDef[] = [
  N('tipoRegistro', 1),
  N('modalidad', 1),
  N('secuencia', 4),
  A('razonSocial', 200),
  A('tipoDocumento', 2),
  A('nit', 16),
  N('dv', 1),
  A('tipoPlanilla', 1),
  A('planillaAsociada', 10),
  A('fechaPlanillaAsociada', 10),
  A('formaPresentacion', 1),
  A('codigoSucursal', 10),
  A('nombreSucursal', 40),
  A('codigoArl', 6),
  A('periodoOtros', 7),
  A('periodoSalud', 7),
  A('numeroRadicacion', 10),
  A('fechaPago', 10),
  N('totalCotizantes', 5),
  N('valorNomina', 12),
  A('tipoAportante', 2),
  A('codigoOperador', 2),
];

/** Registro tipo 2 — liquidación detallada por cotizante. */
export const EMPLOYEE_FIELDS: FieldDef[] = [
  N('tipoRegistro', 2),
  N('secuencia', 5),
  A('tipoDocumento', 2),
  A('numeroDocumento', 16),
  N('tipoCotizante', 2),
  N('subtipoCotizante', 2),
  A('extranjeroNoPension', 1),
  A('colombianoExterior', 1),
  A('departamento', 2),
  A('municipio', 3),
  A('primerApellido', 20),
  A('segundoApellido', 30),
  A('primerNombre', 20),
  A('segundoNombre', 30),
  A('ing', 1),
  A('ret', 1),
  A('tde', 1),
  A('tae', 1),
  A('tdp', 1),
  A('tap', 1),
  A('vsp', 1),
  A('correcciones', 1),
  A('vst', 1),
  A('sln', 1),
  A('ige', 1),
  A('lma', 1),
  A('vac', 1),
  A('avp', 1),
  A('vct', 1),
  N('irl', 2),
  A('codigoAfp', 6),
  A('codigoAfpTraslado', 6),
  A('codigoEps', 6),
  A('codigoEpsTraslado', 6),
  A('codigoCcf', 6),
  N('diasPension', 2),
  N('diasSalud', 2),
  N('diasArl', 2),
  N('diasCcf', 2),
  N('salarioBasico', 9),
  A('salarioIntegral', 1),
  N('ibcPension', 9),
  N('ibcSalud', 9),
  N('ibcArl', 9),
  N('ibcCcf', 9),
  A('tarifaPension', 7),
  N('aportePension', 9),
  N('voluntarioAfiliado', 9),
  N('voluntarioAportante', 9),
  N('totalPension', 9),
  N('fspSolidaridad', 9),
  N('fspSubsistencia', 9),
  N('valorNoRetenido', 9),
  A('tarifaSalud', 7),
  N('aporteSalud', 9),
  N('upcAdicional', 9),
  A('autorizacionIge', 15),
  N('valorIge', 9),
  A('autorizacionLma', 15),
  N('valorLma', 9),
  A('tarifaArl', 9),
  N('centroTrabajo', 9),
  N('aporteArl', 9),
  A('tarifaCcf', 7),
  N('aporteCcf', 9),
  A('tarifaSena', 7),
  N('aporteSena', 9),
  A('tarifaIcbf', 7),
  N('aporteIcbf', 9),
  A('tarifaEsap', 7),
  N('aporteEsap', 9),
  A('tarifaMen', 7),
  N('aporteMen', 9),
  A('tipoDocumentoPrincipal', 2),
  A('documentoPrincipal', 16),
  A('exonerado', 1),
  A('codigoArl', 6),
  A('claseRiesgo', 1),
  A('tarifaEspecialPension', 1),
  A('fechaIngreso', 10),
  A('fechaRetiro', 10),
  A('fechaInicioVsp', 10),
  A('fechaInicioSln', 10),
  A('fechaFinSln', 10),
  A('fechaInicioIge', 10),
  A('fechaFinIge', 10),
  A('fechaInicioLma', 10),
  A('fechaFinLma', 10),
  A('fechaInicioVac', 10),
  A('fechaFinVac', 10),
  A('fechaInicioVct', 10),
  A('fechaFinVct', 10),
  A('fechaInicioIrl', 10),
  A('fechaFinIrl', 10),
  N('ibcOtrosParafiscales', 9),
  N('horasLaboradas', 3),
  A('fechaRadicacionExterior', 10),
  A('actividadEconomicaArl', 7),
];

const totalLength = (layout: FieldDef[]) => layout.reduce((sum, f) => sum + f.length, 0);

export const HEADER_LENGTH = totalLength(HEADER_FIELDS);
export const EMPLOYEE_LENGTH = totalLength(EMPLOYEE_FIELDS);

/** Posición inicial (base 1, como en la resolución) y longitud de un campo. */
export function fieldSpan(layout: FieldDef[], name: string): { start: number; length: number } {
  let start = 1;

  for (const field of layout) {
    if (field.name === name) return { start, length: field.length };
    start += field.length;
  }

  throw new Error(`Campo PILA desconocido: ${name}`);
}

// ------------------------------------------------------------
// FORMATO
// ------------------------------------------------------------

/** Mayúsculas ASCII: sin tildes, Ñ → N, sin caracteres de control. */
export function toPilaText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^\x20-\x7e]/g, ' ');
}

function formatField(field: FieldDef, value: unknown): string {
  if (field.kind === 'N') {
    if (value === undefined || value === null || value === '') {
      return '0'.repeat(field.length);
    }

    const digits = typeof value === 'number'
      ? String(Math.max(0, Math.round(value)))
      : String(value).replace(/\D/g, '');

    if (digits.length > field.length) {
      throw new Error(`El valor ${digits} no cabe en el campo PILA ${field.name} (${field.length}).`);
    }

    return digits.padStart(field.length, '0');
  }

  return toPilaText(value).slice(0, field.length).padEnd(field.length, ' ');
}

function buildLine(layout: FieldDef[], values: Record<string, unknown>): string {
  return layout.map(field => formatField(field, values[field.name])).join('');
}

/** Aproxima al múltiplo de 100 superior (aportes, Decreto 1990 de 2016). */
export function ceil100(value: number): number {
  const cents = Math.round(value * 100) / 100;
  return Math.ceil(cents / 100) * 100;
}

/** Aproxima al peso superior (IBC). */
function ceilPeso(value: number): number {
  return Math.ceil(Math.round(value * 100) / 100);
}

const rate = (value: number, decimals: number) => value.toFixed(decimals);

// ------------------------------------------------------------
// ENTRADA
// ------------------------------------------------------------

export type PilaLeaveType =
  | 'GENERAL_INCAPACITY'
  | 'WORK_INCAPACITY'
  | 'MATERNITY_LEAVE'
  | 'PATERNITY_LEAVE'
  | 'VACATION';

export interface PilaLeaveInput {
  type: PilaLeaveType | string;
  startDate: string;
  endDate: string;
  /** Días de la novedad dentro del periodo. */
  days: number;
  /** Valor pagado por la novedad en el periodo (base de su IBC). */
  value: number;
}

export interface PilaEmployeeInput {
  documentType: string;
  documentNumber: string;
  contributorType: string;
  contributorSubtype: string;
  firstName: string;
  firstName2?: string | null;
  lastName: string;
  lastName2?: string | null;
  /** Código DIVIPOLA de 5 dígitos (departamento + municipio) del lugar de trabajo. */
  divipolaCode?: string | null;
  epsCode?: string | null;
  afpCode?: string | null;
  ccfCode?: string | null;
  salary: number;
  isIntegralSalary: boolean;
  arlRiskClass: number;
  /** Exonerado de salud del empleador, SENA e ICBF (art. 114-1 ET). */
  isExempt: boolean;
  hireDate?: string | null;
  terminationDate?: string | null;
  /** Días efectivamente trabajados (sin novedades). */
  daysWorked: number;
  /** IBC total de seguridad social liquidado en la nómina del mes. */
  ibc: number;
  /** Tarifa total del Fondo de Solidaridad Pensional (0, 0.01, 0.012...). */
  fspRate: number;
  leaves: PilaLeaveInput[];
  /** Código de actividad económica para ARL (7 dígitos, Decreto 768 de 2022). */
  economicActivityCode?: string | null;
}

export interface PilaCompanyInput {
  name: string;
  nit: string;
  dv?: string | null;
  /** Tipo de aportante: 01 empleador. */
  contributorType?: string | null;
  arlCode?: string | null;
}

export interface PilaFileInput {
  company: PilaCompanyInput;
  /** Periodo de nómina (mes calendario de los aportes a pensión, ARL y CCF). */
  periodStart: string;
  periodEnd: string;
  employees: PilaEmployeeInput[];
}

export interface PilaTotals {
  pension: number;
  fsp: number;
  health: number;
  arl: number;
  ccf: number;
  sena: number;
  icbf: number;
  total: number;
}

export interface PilaFileResult {
  fileName: string;
  content: string;
  lines: string[];
  warnings: string[];
  totals: PilaTotals;
  cotizantes: number;
}

// ------------------------------------------------------------
// TARIFAS
// ------------------------------------------------------------

const PENSION_RATE = CONSTANTS_2026.PENSION_EMPLOYEE + CONSTANTS_2026.PENSION_EMPLOYER;
const HEALTH_RATE = CONSTANTS_2026.HEALTH_EMPLOYEE + CONSTANTS_2026.HEALTH_EMPLOYER;
const HEALTH_RATE_EXEMPT = CONSTANTS_2026.HEALTH_EMPLOYEE;

/** Tarifas ARL por clase de riesgo (Decreto 1772 de 1994, valor inicial). */
export const ARL_RATES: Record<number, number> = {
  1: 0.00522,
  2: 0.01044,
  3: 0.02436,
  4: 0.0435,
  5: 0.0696,
};

const FSP_SOLIDARIDAD = 0.005;

// ------------------------------------------------------------
// CONSTRUCCIÓN
// ------------------------------------------------------------

type Novelty = 'BASE' | 'IGE' | 'IRL' | 'LMA' | 'VAC';

function noveltyOf(type: string): Novelty | null {
  switch (type) {
    case 'GENERAL_INCAPACITY': return 'IGE';
    case 'WORK_INCAPACITY': return 'IRL';
    case 'MATERNITY_LEAVE':
    case 'PATERNITY_LEAVE': return 'LMA';
    case 'VACATION': return 'VAC';
    default: return null;
  }
}

function nextMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

const inPeriod = (date: string | null | undefined, start: string, end: string) =>
  !!date && date >= start && date <= end;

export function buildPilaFile(input: PilaFileInput): PilaFileResult {
  const { company, periodStart, periodEnd } = input;
  const warnings: string[] = [];
  const totals: PilaTotals = { pension: 0, fsp: 0, health: 0, arl: 0, ccf: 0, sena: 0, icbf: 0, total: 0 };
  const smmlv = CONSTANTS_2026.SMMLV;
  const ibcMax = smmlv * CONSTANTS_2026.IBC_MAX_SMMLV_MULTIPLE;
  const arlCode = String(company.arlCode || '').trim();

  if (!arlCode) {
    warnings.push('La empresa no tiene código de ARL: complétalo en los datos de la empresa.');
  }

  if (!String(company.nit || '').trim()) {
    warnings.push('La empresa no tiene NIT.');
  }

  const employeeLines: string[] = [];
  let payrollTotal = 0;

  for (const emp of input.employees) {
    const who = [emp.firstName, emp.lastName].filter(Boolean).join(' ') + ` (${emp.documentNumber})`;
    const integral = !!emp.isIntegralSalary;
    const factor = integral ? CONSTANTS_2026.INTEGRAL_SALARY_IBC_FACTOR : 1;
    const exempt = !!emp.isExempt;
    const arlRate = ARL_RATES[emp.arlRiskClass] ?? ARL_RATES[1];
    const divipola = String(emp.divipolaCode || '').replace(/\D/g, '');

    if (!String(emp.epsCode || '').trim()) warnings.push(`${who}: falta el código de la EPS.`);
    if (!String(emp.afpCode || '').trim()) warnings.push(`${who}: falta el código del fondo de pensiones (AFP).`);
    if (!String(emp.ccfCode || '').trim()) warnings.push(`${who}: falta el código de la caja de compensación (CCF).`);
    if (divipola.length !== 5) warnings.push(`${who}: falta el código DIVIPOLA (5 dígitos) del municipio de trabajo.`);
    if (emp.contributorType !== '01') {
      warnings.push(`${who}: tipo de cotizante ${emp.contributorType}; verifica tarifas y subsistemas con el operador (sólo el tipo 01 se valida aquí).`);
    }

    // Líneas: una por novedad y una base con los días trabajados.
    const segments: { novelty: Novelty; days: number; ibc: number; leave?: PilaLeaveInput }[] = [];
    let leaveIbcTotal = 0;

    for (const leave of emp.leaves || []) {
      const novelty = noveltyOf(String(leave.type));
      const days = Math.round(Number(leave.days) || 0);

      if (!novelty) {
        warnings.push(`${who}: novedad ${leave.type} no soportada en PILA; se omitió.`);
        continue;
      }

      if (days <= 0) continue;

      const ibc = ceilPeso(Number(leave.value || 0) * factor);
      leaveIbcTotal += ibc;
      segments.push({ novelty, days, ibc, leave });
    }

    const daysWorked = Math.max(0, Math.round(Number(emp.daysWorked) || 0));

    if (daysWorked > 0 || segments.length === 0) {
      const ibc = Math.max(0, ceilPeso(Number(emp.ibc || 0)) - leaveIbcTotal);
      segments.unshift({ novelty: 'BASE', days: daysWorked, ibc });
    }

    const totalDays = segments.reduce((s, x) => s + x.days, 0);
    if (totalDays > 30) {
      warnings.push(`${who}: los días reportados suman ${totalDays} (máximo 30).`);
    }

    const totalIbc = segments.reduce((s, x) => s + x.ibc, 0);
    const ing = inPeriod(emp.hireDate, periodStart, periodEnd);
    const ret = inPeriod(emp.terminationDate, periodStart, periodEnd);

    segments.forEach((seg, index) => {
      // Piso: 1 SMMLV proporcional a los días (no aplica a salario
      // integral, cuyo piso es mayor y ya lo garantiza su salario).
      let ibc = Math.min(seg.ibc, ibcMax);
      const minimum = Math.ceil((smmlv * seg.days) / 30);

      if (!integral && seg.days > 0 && ibc < minimum) {
        warnings.push(
          `${who}: IBC de ${ibc} por ${seg.days} días es inferior al mínimo legal proporcional; se reporta ${minimum}.`
        );
        ibc = minimum;
      }

      const paysArl = seg.novelty === 'BASE';
      const paysCcf = seg.novelty === 'BASE' || seg.novelty === 'VAC';
      const ibcArl = paysArl ? ibc : 0;
      const ibcCcf = paysCcf ? ibc : 0;

      const pension = ceil100(ibc * PENSION_RATE);
      const fspRate = Number(emp.fspRate) || 0;
      const fspSolidaridad = fspRate > 0 ? ceil100(ibc * FSP_SOLIDARIDAD) : 0;
      const fspSubsistencia = fspRate > FSP_SOLIDARIDAD ? ceil100(ibc * (fspRate - FSP_SOLIDARIDAD)) : 0;
      const healthRate = exempt ? HEALTH_RATE_EXEMPT : HEALTH_RATE;
      const health = ceil100(ibc * healthRate);
      const arl = ceil100(ibcArl * arlRate);
      const ccf = ceil100(ibcCcf * CONSTANTS_2026.CCF);
      const senaRate = exempt ? 0 : CONSTANTS_2026.SENA;
      const icbfRate = exempt ? 0 : CONSTANTS_2026.ICBF;
      const sena = ceil100(ibcCcf * senaRate);
      const icbf = ceil100(ibcCcf * icbfRate);

      totals.pension += pension;
      totals.fsp += fspSolidaridad + fspSubsistencia;
      totals.health += health;
      totals.arl += arl;
      totals.ccf += ccf;
      totals.sena += sena;
      totals.icbf += icbf;
      payrollTotal += ibcCcf;

      const isFirst = index === 0;
      const leave = seg.leave;

      const values: Record<string, unknown> = {
        tipoRegistro: '02',
        secuencia: employeeLines.length + 1,
        tipoDocumento: emp.documentType || 'CC',
        numeroDocumento: emp.documentNumber,
        tipoCotizante: emp.contributorType || '01',
        subtipoCotizante: emp.contributorSubtype || '00',
        departamento: divipola.slice(0, 2),
        municipio: divipola.slice(2, 5),
        primerApellido: emp.lastName,
        segundoApellido: emp.lastName2,
        primerNombre: emp.firstName,
        segundoNombre: emp.firstName2,
        ing: isFirst && ing ? 'X' : '',
        ret: isFirst && ret ? 'X' : '',
        ige: seg.novelty === 'IGE' ? 'X' : '',
        lma: seg.novelty === 'LMA' ? 'X' : '',
        vac: seg.novelty === 'VAC' ? 'X' : '',
        irl: seg.novelty === 'IRL' ? seg.days : 0,
        codigoAfp: emp.afpCode,
        codigoEps: emp.epsCode,
        codigoCcf: emp.ccfCode,
        diasPension: seg.days,
        diasSalud: seg.days,
        diasArl: paysArl ? seg.days : 0,
        diasCcf: paysCcf ? seg.days : 0,
        salarioBasico: Math.round(Number(emp.salary) || 0),
        salarioIntegral: integral ? 'X' : 'F',
        ibcPension: ibc,
        ibcSalud: ibc,
        ibcArl,
        ibcCcf,
        tarifaPension: rate(PENSION_RATE, 5),
        aportePension: pension,
        totalPension: pension,
        fspSolidaridad,
        fspSubsistencia,
        tarifaSalud: rate(healthRate, 5),
        aporteSalud: health,
        tarifaArl: rate(paysArl ? arlRate : 0, 7),
        aporteArl: arl,
        tarifaCcf: rate(paysCcf ? CONSTANTS_2026.CCF : 0, 5),
        aporteCcf: ccf,
        tarifaSena: rate(paysCcf ? senaRate : 0, 5),
        aporteSena: sena,
        tarifaIcbf: rate(paysCcf ? icbfRate : 0, 5),
        aporteIcbf: icbf,
        tarifaEsap: rate(0, 5),
        tarifaMen: rate(0, 5),
        exonerado: exempt ? 'S' : 'N',
        codigoArl: arlCode,
        claseRiesgo: String(emp.arlRiskClass || 1),
        fechaIngreso: isFirst && ing ? emp.hireDate : '',
        fechaRetiro: isFirst && ret ? emp.terminationDate : '',
        ibcOtrosParafiscales: exempt ? 0 : ibcCcf,
        horasLaboradas: 0,
        actividadEconomicaArl: /^\d{7}$/.test(String(emp.economicActivityCode || ''))
          ? emp.economicActivityCode
          : '',
      };

      if (leave) {
        const key = { IGE: 'Ige', IRL: 'Irl', LMA: 'Lma', VAC: 'Vac' }[seg.novelty as Exclude<Novelty, 'BASE'>];
        values[`fechaInicio${key}`] = leave.startDate;
        values[`fechaFin${key}`] = leave.endDate;
      }

      employeeLines.push(buildLine(EMPLOYEE_FIELDS, values));
    });

    if (totalIbc <= 0) {
      warnings.push(`${who}: IBC en cero.`);
    }
  }

  totals.total = totals.pension + totals.fsp + totals.health + totals.arl + totals.ccf + totals.sena + totals.icbf;

  const periodOther = periodStart.slice(0, 7);

  const header = buildLine(HEADER_FIELDS, {
    tipoRegistro: 1,
    modalidad: 1,
    secuencia: 1,
    razonSocial: company.name,
    tipoDocumento: 'NI',
    nit: String(company.nit || '').replace(/\D/g, ''),
    dv: String(company.dv || '').replace(/\D/g, '').slice(0, 1),
    tipoPlanilla: 'E',
    formaPresentacion: 'U',
    codigoArl: arlCode,
    periodoOtros: periodOther,
    periodoSalud: nextMonth(periodOther),
    totalCotizantes: input.employees.length,
    valorNomina: payrollTotal,
    tipoAportante: company.contributorType || '01',
  });

  const lines = [header, ...employeeLines];
  const nit = String(company.nit || '').replace(/\D/g, '') || 'SIN-NIT';

  return {
    fileName: `PILA_${nit}_${periodOther}.txt`,
    content: lines.join('\r\n'),
    lines,
    warnings,
    totals,
    cotizantes: input.employees.length,
  };
}
