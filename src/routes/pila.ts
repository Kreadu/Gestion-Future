/**
 * Archivo plano PILA (planilla tipo E) de un periodo de nómina:
 *
 *   GET /api/payroll-periods/:id/pila   → { fileName, content, warnings, totals }
 *
 * También expone los datos de afiliación PILA de empleados y empresas
 * (códigos de administradora, tipo de cotizante/aportante, DIVIPOLA)
 * para que src/index.ts los valide y guarde sin tocar sus INSERT/UPDATE.
 * El formato vive en src/services/pilaFile.ts.
 */

import { sendJson } from '../http';
import {
  requireRole,
  requireCompanyAccess,
  HttpError,
  type AuthUser,
} from '../auth/authz';
import { buildPilaFile, type PilaEmployeeInput } from '../services/pilaFile';
import { CONSTANTS_2026 } from '../engine/countries/constants2026';

interface RouteEnv {
  DB: D1Database;
}

// ------------------------------------------------------------
// DATOS DE AFILIACIÓN
// ------------------------------------------------------------

/** Tipos de documento del cotizante admitidos por PILA. */
export const PILA_DOCUMENT_TYPES = ['CC', 'CE', 'TI', 'PA', 'CD', 'SC', 'PE', 'PT', 'RC', 'CN'];

type PilaKind = 'employee' | 'company';

interface FieldRule {
  /** Columna NOT NULL con valor por defecto: vacío = no cambiar. */
  required?: boolean;
  normalize: (v: string) => string;
  valid: (v: string) => boolean;
  error: string;
}

const upper = (v: string) => v.trim().toUpperCase();
const digits2 = (v: string) => /^\d{2}$/.test(v);
const adminCode = (v: string) => /^[A-Z0-9-]{1,6}$/.test(v);

const RULES: Record<PilaKind, Record<string, FieldRule>> = {
  employee: {
    documentType: { required: true, normalize: upper, valid: v => PILA_DOCUMENT_TYPES.includes(v), error: 'Tipo de documento PILA inválido.' },
    pilaContributorType: { required: true, normalize: upper, valid: digits2, error: 'El tipo de cotizante PILA son 2 dígitos (ej. 01).' },
    pilaContributorSubtype: { required: true, normalize: upper, valid: digits2, error: 'El subtipo de cotizante PILA son 2 dígitos (ej. 00).' },
    epsCode: { normalize: upper, valid: adminCode, error: 'Código de EPS inválido (máx. 6 caracteres).' },
    afpCode: { normalize: upper, valid: adminCode, error: 'Código de fondo de pensiones inválido (máx. 6 caracteres).' },
    ccfCode: { normalize: upper, valid: adminCode, error: 'Código de caja de compensación inválido (máx. 6 caracteres).' },
    divipolaCode: { normalize: v => v.trim(), valid: v => /^\d{5}$/.test(v), error: 'El código DIVIPOLA son 5 dígitos (departamento + municipio).' },
  },
  company: {
    arlCode: { normalize: upper, valid: adminCode, error: 'Código de ARL inválido (máx. 6 caracteres).' },
    pilaContributorType: { required: true, normalize: upper, valid: digits2, error: 'El tipo de aportante PILA son 2 dígitos (ej. 01).' },
    divipolaCode: { normalize: v => v.trim(), valid: v => /^\d{5}$/.test(v), error: 'El código DIVIPOLA son 5 dígitos (departamento + municipio).' },
    arlActivityCode: { normalize: v => v.trim(), valid: v => /^\d{7}$/.test(v), error: 'La actividad económica ARL son 7 dígitos.' },
  },
};

/**
 * Valida y normaliza los campos PILA presentes en `body` (los
 * ausentes no se tocan). Lanza 400 si alguno es inválido. Llamar ANTES
 * del INSERT/UPDATE para no dejar registros a medias.
 */
export function parsePilaAffiliation(body: any, kind: PilaKind): Record<string, string | null> {
  const out: Record<string, string | null> = {};

  for (const [column, rule] of Object.entries(RULES[kind])) {
    if (!body || body[column] === undefined) continue;

    const value = rule.normalize(String(body[column] ?? ''));

    if (!value) {
      if (!rule.required) out[column] = null;
      continue;
    }

    if (!rule.valid(value)) {
      throw new HttpError(400, rule.error);
    }

    out[column] = value;
  }

  return out;
}

/** Guarda los campos ya validados por parsePilaAffiliation. */
export async function savePilaAffiliation(
  env: RouteEnv,
  kind: PilaKind,
  id: string,
  values: Record<string, string | null>
): Promise<void> {
  const columns = Object.keys(values);
  if (columns.length === 0) return;

  const table = kind === 'employee' ? 'employees' : 'companies';
  const set = columns.map((c, i) => `${c} = ?${i + 2}`).join(', ');

  await env.DB
    .prepare(`UPDATE ${table} SET ${set} WHERE id = ?1`)
    .bind(id, ...columns.map(c => values[c]))
    .run();
}

/** Campos PILA de una fila, para incluirlos en la respuesta del API. */
export function pilaAffiliationOf(row: any, kind: PilaKind): Record<string, string | null> {
  const defaults: Record<string, string> = kind === 'employee'
    ? { documentType: 'CC', pilaContributorType: '01', pilaContributorSubtype: '00' }
    : { pilaContributorType: '01' };

  const out: Record<string, string | null> = {};

  for (const column of Object.keys(RULES[kind])) {
    out[column] = row?.[column] ?? defaults[column] ?? null;
  }

  return out;
}

// ------------------------------------------------------------
// ARCHIVO
// ------------------------------------------------------------

function employeeName(row: any): string {
  return [row.firstName, row.firstName2, row.lastName, row.lastName2]
    .filter(Boolean)
    .join(' ');
}

function lastDayOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export async function handlePilaRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/payroll-periods\/([^/]+)\/pila$/);

  if (!match || request.method !== 'GET') {
    return null;
  }

  requireRole(user, ['TENANT_ADMIN']);

  const period = await env.DB
    .prepare(`SELECT * FROM payroll_periods WHERE id = ?1`)
    .bind(decodeURIComponent(match[1]))
    .first<any>();

  if (!period) {
    return sendJson({ success: false, error: 'Periodo no encontrado.' }, 404);
  }

  requireCompanyAccess(user, String(period.companyId));

  const company = await env.DB
    .prepare(`SELECT * FROM companies WHERE id = ?1`)
    .bind(period.companyId)
    .first<any>();

  const settlements = await env.DB
    .prepare(`
      SELECT s.resultJson, s.daysWorked AS settledDays, e.*
      FROM payroll_settlements s
      JOIN employees e ON e.id = s.employeeId
      WHERE s.periodId = ?1
      ORDER BY e.lastName, e.firstName
    `)
    .bind(period.id)
    .all<any>();

  const rows = settlements.results || [];

  if (rows.length === 0) {
    return sendJson(
      { success: false, error: 'El periodo no tiene liquidaciones: calcula la nómina antes de generar la PILA.' },
      400
    );
  }

  const periodStart = String(period.periodStart);
  const periodEnd = String(period.periodEnd);
  const warnings: string[] = [];

  if (period.status !== 'CLOSED') {
    warnings.push('El periodo sigue en borrador: ciérralo antes de pagar la planilla para que no cambie.');
  }

  if (periodStart.slice(8) !== '01' || periodEnd !== lastDayOfMonth(periodStart) ) {
    warnings.push('La PILA es mensual: el periodo no corresponde a un mes calendario completo.');
  }

  const exemptCap = CONSTANTS_2026.SMMLV * CONSTANTS_2026.EXEMPT_114_1_MAX_SMMLV_MULTIPLE;

  const employees: PilaEmployeeInput[] = rows.map(row => {
    const result = JSON.parse(String(row.resultJson));
    const salary = Number(row.salary || 0);

    return {
      documentType: row.documentType || 'CC',
      documentNumber: String(row.taxId || ''),
      contributorType: row.pilaContributorType || '01',
      contributorSubtype: row.pilaContributorSubtype || '00',
      firstName: row.firstName,
      firstName2: row.firstName2,
      lastName: row.lastName,
      lastName2: row.lastName2,
      divipolaCode: row.divipolaCode || company?.divipolaCode || null,
      epsCode: row.epsCode,
      afpCode: row.afpCode,
      ccfCode: row.ccfCode,
      salary,
      isIntegralSalary: !!row.isIntegralSalary,
      arlRiskClass: Number(row.arlRiskClass) || 1,
      isExempt: !!company?.isExempt114_1 && salary < exemptCap,
      hireDate: row.hireDate,
      terminationDate: row.terminationDate,
      daysWorked: Number(result.daysWorked ?? row.settledDays ?? 0),
      ibc: Number(result.ibcSecuritySocial || 0),
      fspRate: Number(result.employeeDeductions?.fspPct || 0),
      leaves: (result.leaveDetails || []).map((l: any) => ({
        type: l.type,
        startDate: l.startDate,
        endDate: l.endDate,
        days: Number(l.days || 0),
        value: Number(l.value || 0),
      })),
      economicActivityCode: company?.arlActivityCode || null,
    };
  });

  // Empleados vinculados en el periodo que no tienen liquidación.
  const active = await env.DB
    .prepare(`
      SELECT e.*
      FROM employees e
      WHERE e.companyId = ?1
        AND (e.hireDate IS NULL OR e.hireDate <= ?3)
        AND (e.terminationDate IS NULL OR e.terminationDate >= ?2)
        AND (e.active = 1 OR e.terminationDate IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM payroll_settlements s
          WHERE s.periodId = ?4 AND s.employeeId = e.id
        )
    `)
    .bind(period.companyId, periodStart, periodEnd, period.id)
    .all<any>();

  for (const row of active.results || []) {
    warnings.push(`${employeeName(row)} (${row.taxId}): vinculado en el periodo pero sin liquidación en este periodo; no se incluyó.`);
  }

  const file = buildPilaFile({
    company: {
      name: String(company?.name || ''),
      nit: String(company?.nit || ''),
      dv: company?.dv,
      contributorType: company?.pilaContributorType || '01',
      arlCode: company?.arlCode,
    },
    periodStart,
    periodEnd,
    employees,
  });

  return sendJson({
    success: true,
    data: {
      fileName: file.fileName,
      content: file.content,
      warnings: [...warnings, ...file.warnings],
      totals: file.totals,
      cotizantes: file.cotizantes,
      lines: file.lines.length,
    },
  });
}
