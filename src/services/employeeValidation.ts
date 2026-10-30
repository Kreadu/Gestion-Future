/**
 * Validación y normalización de los datos de un empleado, compartida
 * por POST /api/employees y POST /api/employees/import.
 *
 * - Modo básico (POST /api/employees): obligatorios y salario > 0.
 * - Modo estricto (importación masiva): además exige fecha de ingreso,
 *   salario ≥ 1 SMMLV (salvo aprendices), contrato con código DIAN
 *   válido, fechas reales, fin de contrato en término fijo, salario
 *   integral ≥ 13 SMMLV, etc. El navegador hace la misma validación
 *   para la vista previa, pero el servidor nunca confía en ella.
 */

import { CONSTANTS_2026 } from '../engine/countries/constants2026';

export interface EmployeeInput {
  firstName: string;
  firstName2: string | null;
  lastName: string;
  lastName2: string | null;
  taxId: string;
  position: string | null;
  contractType: string;
  salary: number;
  address: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  whatsapp: string | null;
  hireDate: string | null;
  contractEndDate: string | null;
  bankName: string | null;
  bankAccountType: string | null;
  bankAccountNumber: string | null;
  arlRiskClass: number;
  vacationDaysTakenBefore: number;
  isIntegralSalary: boolean;
}

export type EmployeeValidation =
  | { ok: true; value: EmployeeInput }
  | { ok: false; error: string };

/** Tipos de contrato de la nómina electrónica DIAN. */
export const CONTRACT_TYPES: Record<string, string> = {
  '1': 'Término fijo',
  '2': 'Término indefinido',
  '3': 'Obra o labor',
  '4': 'Aprendizaje',
  '5': 'Prácticas',
};

const CONTRACT_ALIASES: Record<string, string> = {
  FIJO: '1',
  'TERMINO FIJO': '1',
  INDEFINIDO: '2',
  'TERMINO INDEFINIDO': '2',
  OBRA: '3',
  'OBRA O LABOR': '3',
  'OBRA LABOR': '3',
  APRENDIZAJE: '4',
  APRENDIZ: '4',
  PRACTICAS: '5',
  PRACTICA: '5',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const text = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value).trim();

const optional = (value: unknown): string | null => text(value) || null;

/** Clave para comparar documentos: sin puntos, espacios ni guiones. */
export function taxIdKey(value: unknown): string {
  return text(value).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Fecha serial de Excel (sistema 1900) → AAAA-MM-DD. */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * AAAA-MM-DD (o serial de Excel) → AAAA-MM-DD; `undefined` si está
 * vacío y `null` si no es una fecha real.
 */
export function parseDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || text(value) === '') return undefined;

  const asNumber = typeof value === 'number' ? value : /^\d{4,5}(\.\d+)?$/.test(text(value)) ? Number(value) : NaN;

  if (Number.isFinite(asNumber)) {
    return asNumber > 0 && asNumber < 2958466 ? excelSerialToIso(Math.floor(asNumber)) : null;
  }

  const s = text(value).slice(0, 10);
  if (!ISO_DATE.test(s)) return null;

  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const s = stripAccents(text(value)).toUpperCase();
  return ['1', 'SI', 'S', 'TRUE', 'X', 'YES'].includes(s);
}

export function normalizeContractType(value: unknown): string | null {
  const s = stripAccents(text(value)).toUpperCase().replace(/\s+/g, ' ');
  if (!s) return '2';
  if (CONTRACT_TYPES[s]) return s;
  return CONTRACT_ALIASES[s.replace(/^TERMINO DE /, 'TERMINO ')] || null;
}

/** Número en formato colombiano o plano: "1.750.905", "1750905,50", 1750905. */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  let s = text(value).replace(/[$\s]/g, '');
  if (!s) return NaN;

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d+$/.test(s)) {
    s = s.replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  }

  return Number(s);
}

export function validateEmployeeInput(
  body: any,
  options: { strict?: boolean } = {}
): EmployeeValidation {
  const strict = !!options.strict;
  const fail = (error: string): EmployeeValidation => ({ ok: false, error });

  const firstName = text(body.firstName);
  const lastName = text(body.lastName);
  const taxId = strict ? text(body.taxId).replace(/[.\s]/g, '') : text(body.taxId);
  const salary = strict ? parseAmount(body.salary) : Number(body.salary);

  if (!firstName || !lastName || !taxId) {
    return fail('Primer nombre, primer apellido y documento son obligatorios.');
  }

  if (!Number.isFinite(salary) || salary <= 0) {
    return fail('El salario debe ser mayor que cero.');
  }

  const value: EmployeeInput = {
    firstName,
    firstName2: optional(body.firstName2),
    lastName,
    lastName2: optional(body.lastName2),
    taxId,
    position: optional(body.position),
    // Sin plazo escrito, la ley presume término indefinido (art. 47
    // CST): código DIAN 2.
    contractType: text(body.contractType) || '2',
    salary,
    address: optional(body.address),
    city: optional(body.city),
    country: text(body.country) || 'Colombia',
    phone: optional(body.phone),
    whatsapp: optional(body.whatsapp),
    hireDate: optional(body.hireDate),
    contractEndDate: optional(body.contractEndDate),
    bankName: optional(body.bankName),
    bankAccountType: optional(body.bankAccountType),
    bankAccountNumber: optional(body.bankAccountNumber),
    arlRiskClass: normalizeArlRiskClass(body.arlRiskClass),
    vacationDaysTakenBefore: Math.max(0, Number(body.vacationDaysTakenBefore) || 0),
    isIntegralSalary: !!body.isIntegralSalary,
  };

  if (!strict) return { ok: true, value };

  // ---------------- Reglas adicionales de la importación ----------------

  const contractType = normalizeContractType(body.contractType);
  if (!contractType) {
    return fail('Tipo de contrato inválido: use 1 (fijo), 2 (indefinido), 3 (obra), 4 (aprendizaje) o 5 (prácticas).');
  }
  value.contractType = contractType;

  const hireDate = parseDate(body.hireDate);
  if (hireDate === undefined) return fail('La fecha de ingreso es obligatoria.');
  if (hireDate === null) return fail('Fecha de ingreso inválida (use AAAA-MM-DD).');
  value.hireDate = hireDate;

  const endDate = parseDate(body.contractEndDate);
  if (endDate === null) return fail('Fecha de fin de contrato inválida (use AAAA-MM-DD).');
  value.contractEndDate = endDate || null;

  if (contractType === '1' && !value.contractEndDate) {
    return fail('El contrato a término fijo requiere fecha de fin de contrato.');
  }

  if (value.contractEndDate && value.contractEndDate < hireDate) {
    return fail('La fecha de fin de contrato es anterior a la de ingreso.');
  }

  value.isIntegralSalary = parseBoolean(body.isIntegralSalary);

  const smmlv = CONSTANTS_2026.SMMLV;

  if (contractType !== '4' && salary < smmlv) {
    return fail(`El salario es inferior al salario mínimo (${smmlv.toLocaleString('es-CO')}).`);
  }

  if (value.isIntegralSalary) {
    const min = smmlv * CONSTANTS_2026.INTEGRAL_SALARY_MIN_SMMLV_MULTIPLE;
    if (salary < min) {
      return fail(`El salario integral debe ser de al menos 13 SMMLV (${min.toLocaleString('es-CO')}).`);
    }
  }

  const arlRaw = text(body.arlRiskClass);
  if (arlRaw && !/^[1-5]$/.test(arlRaw)) {
    return fail('Clase de riesgo ARL inválida (1 a 5).');
  }

  if (value.bankAccountType) {
    const t = stripAccents(value.bankAccountType).toUpperCase();
    if (t !== 'AHORROS' && t !== 'CORRIENTE') {
      return fail('Tipo de cuenta inválido (AHORROS o CORRIENTE).');
    }
    value.bankAccountType = t;
  } else {
    value.bankAccountType = 'AHORROS';
  }

  const vacRaw = text(body.vacationDaysTakenBefore);
  if (vacRaw) {
    const vac = parseAmount(vacRaw);
    if (!Number.isFinite(vac) || vac < 0) {
      return fail('Días de vacaciones disfrutados antes: debe ser un número ≥ 0.');
    }
    value.vacationDaysTakenBefore = vac;
  }

  return { ok: true, value };
}

export function normalizeArlRiskClass(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
}

/** Inserta un empleado ya validado y devuelve su id. */
export async function insertEmployee(
  db: D1Database,
  companyId: string,
  e: EmployeeInput
): Promise<string> {
  const id = `EMP-${crypto.randomUUID()}`;

  await db
    .prepare(`
      INSERT INTO employees (
        id, companyId, firstName, firstName2, lastName, lastName2, taxId,
        position, contractType, salary, address, city, country, phone,
        whatsapp, hireDate, bankName, bankAccountType, bankAccountNumber,
        createdAt, arlRiskClass, contractEndDate, vacationDaysTakenBefore,
        isIntegralSalary, active
      )
      VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
        ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, 1
      )
    `)
    .bind(
      id,
      companyId,
      e.firstName,
      e.firstName2,
      e.lastName,
      e.lastName2,
      e.taxId,
      e.position,
      e.contractType,
      e.salary,
      e.address,
      e.city,
      e.country,
      e.phone,
      e.whatsapp,
      e.hireDate,
      e.bankName,
      e.bankAccountType,
      e.bankAccountNumber,
      new Date().toISOString(),
      e.arlRiskClass,
      e.contractEndDate,
      e.vacationDaysTakenBefore,
      e.isIntegralSalary ? 1 : 0
    )
    .run();

  return id;
}
