/**
 * Revisión antes de cerrar un periodo de nómina:
 *
 *   GET /api/payroll-periods/:id/close-review
 *     → { status, canClose, blockers, warnings, totals }
 *
 * `blockers` impiden el cierre (POST .../close usa periodCloseBlockers
 * y responde 400 con el primero). `warnings` no lo impiden, pero
 * señalan datos que harán fallar el pago, la PILA o la nómina
 * electrónica.
 */

import { sendJson } from '../http';
import { requireRole, requireCompanyAccess, type AuthUser } from '../auth/authz';
import { employeeName, linkedEmployeesWithoutSettlement } from './periodEmployees';

interface RouteEnv {
  DB: D1Database;
}

export interface CloseReviewItem {
  code: string;
  message: string;
  employeeId?: string;
}

export interface CloseReview {
  status: string;
  canClose: boolean;
  blockers: CloseReviewItem[];
  warnings: CloseReviewItem[];
  totals: {
    settlements: number;
    grossEarnings: number;
    totalDeductions: number;
    netPay: number;
  };
}

const LEAVE_LABELS: Record<string, string> = {
  GENERAL_INCAPACITY: 'incapacidad general',
  WORK_INCAPACITY: 'incapacidad laboral',
  MATERNITY_LEAVE: 'licencia de maternidad',
  PATERNITY_LEAVE: 'licencia de paternidad',
  VACATION: 'vacaciones',
};

/** ['a', 'b', 'c'] → 'a, b y c' */
function listJoin(items: string[]): string {
  return items.length > 1 ? items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1] : items.join('');
}

const leaveKey = (l: any) => `${l.type ?? l.leaveType}|${l.startDate}|${l.endDate}`;

/** Lo que impide cerrar el periodo. Sólo lo usa POST .../close y la revisión. */
export async function periodCloseBlockers(env: RouteEnv, period: any): Promise<CloseReviewItem[]> {
  if (period.status === 'CLOSED') {
    return [{ code: 'PERIOD_CLOSED', message: 'El periodo ya está cerrado.' }];
  }

  const counts = await env.DB
    .prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN dianStatus != 'GENERATED' THEN 1 ELSE 0 END) AS pending
      FROM payroll_settlements
      WHERE periodId = ?1
    `)
    .bind(period.id)
    .first<any>();

  if (Number(counts?.total ?? 0) === 0) {
    return [{ code: 'NO_SETTLEMENTS', message: 'El periodo no tiene liquidaciones todavía.' }];
  }

  const pending = Number(counts?.pending ?? 0);
  if (pending > 0) {
    return [{
      code: 'DIAN_PENDING',
      message: `Faltan ${pending} liquidación(es) por generar su XML DIAN antes de poder cerrar el periodo.`,
    }];
  }

  return [];
}

export async function reviewPeriodClose(env: RouteEnv, period: any): Promise<CloseReview> {
  const blockers = await periodCloseBlockers(env, period);
  const warnings: CloseReviewItem[] = [];

  const settlements = (await env.DB
    .prepare(`
      SELECT s.dianStatus, s.grossEarnings, s.totalDeductions, s.netPay, s.resultJson,
             e.id AS employeeId, e.firstName, e.firstName2, e.lastName, e.lastName2, e.taxId,
             e.bankAccountNumber, e.epsCode, e.afpCode, e.ccfCode
      FROM payroll_settlements s
      JOIN employees e ON e.id = s.employeeId
      WHERE s.periodId = ?1
      ORDER BY e.lastName, e.firstName
    `)
    .bind(period.id)
    .all<any>()).results || [];

  const totals = { settlements: settlements.length, grossEarnings: 0, totalDeductions: 0, netPay: 0 };

  for (const row of settlements) {
    totals.grossEarnings += Number(row.grossEarnings || 0);
    totals.totalDeductions += Number(row.totalDeductions || 0);
    totals.netPay += Number(row.netPay || 0);
  }

  // Un periodo cerrado ya no se puede corregir: los avisos sólo
  // sirven mientras está abierto.
  if (period.status !== 'CLOSED') {
    if (settlements.length > 0) {
      const company = await env.DB
        .prepare(`SELECT arlCode FROM companies WHERE id = ?1`)
        .bind(period.companyId)
        .first<any>();

      if (!company?.arlCode) {
        warnings.push({ code: 'COMPANY_NO_ARL', message: 'La empresa no tiene código de ARL: el archivo PILA saldrá incompleto.' });
      }
    }

    const leaves = (await env.DB
      .prepare(`
        SELECT l.employeeId, l.leaveType, l.startDate, l.endDate
        FROM employee_leaves l
        JOIN payroll_settlements s ON s.employeeId = l.employeeId AND s.periodId = ?1
        WHERE l.startDate <= ?3 AND l.endDate >= ?2
      `)
      .bind(period.id, period.periodStart, period.periodEnd)
      .all<any>()).results || [];

    for (const row of settlements) {
      const who = `${employeeName(row)} (${row.taxId})`;

      if (!String(row.bankAccountNumber || '').trim()) {
        warnings.push({ code: 'MISSING_BANK_ACCOUNT', employeeId: row.employeeId, message: `${who}: sin número de cuenta bancaria; no saldrá en el archivo de pago.` });
      }

      const missing = [
        !row.epsCode && 'EPS',
        !row.afpCode && 'fondo de pensiones',
        !row.ccfCode && 'caja de compensación',
      ].filter(Boolean) as string[];

      if (missing.length > 0) {
        warnings.push({ code: 'MISSING_PILA_AFFILIATION', employeeId: row.employeeId, message: `${who}: falta código de ${listJoin(missing)} para la PILA.` });
      }

      if (Number(row.netPay || 0) <= 0) {
        warnings.push({ code: 'NON_POSITIVE_NET_PAY', employeeId: row.employeeId, message: `${who}: el neto a pagar es ${Number(row.netPay || 0)}; revisa deducciones y novedades.` });
      }

      // Novedades registradas o borradas después de calcular: se compara
      // lo que hay hoy con lo que la liquidación incluyó (leaveDetails).
      let included: any[] = [];
      try {
        included = JSON.parse(String(row.resultJson)).leaveDetails || [];
      } catch {
        // resultJson ilegible: no hay con qué comparar.
      }

      // El motor guarda las fechas recortadas al periodo; se recorta igual
      // lo registrado para que una novedad que cruza el borde coincida.
      const clip = (l: any) => ({
        ...l,
        startDate: l.startDate < period.periodStart ? period.periodStart : l.startDate,
        endDate: l.endDate > period.periodEnd ? period.periodEnd : l.endDate,
      });
      const includedKeys = new Set(included.map(leaveKey));
      const current = leaves.filter(l => l.employeeId === row.employeeId);
      const currentKeys = new Set(current.map(l => leaveKey(clip(l))));
      // Con XML DIAN ya no se puede recalcular (ver payroll-settlements/calculate).
      const fix = row.dianStatus === 'GENERATED'
        ? 'ya tiene XML DIAN: regístralo como ajuste en el próximo periodo'
        : 'recalcula su nómina';

      for (const l of current.filter(l => !includedKeys.has(leaveKey(clip(l))))) {
        warnings.push({
          code: 'LEAVE_NOT_IN_SETTLEMENT',
          employeeId: row.employeeId,
          message: `${who}: ${LEAVE_LABELS[l.leaveType] || l.leaveType} del ${l.startDate} al ${l.endDate} no está en la liquidación (se registró después de calcular); ${fix}.`,
        });
      }

      for (const l of included.filter(l => !currentKeys.has(leaveKey(l)))) {
        warnings.push({
          code: 'LEAVE_REMOVED_AFTER_SETTLEMENT',
          employeeId: row.employeeId,
          message: `${who}: la liquidación incluye ${LEAVE_LABELS[l.type] || l.type} del ${l.startDate} al ${l.endDate}, que ya no está registrada; ${fix}.`,
        });
      }
    }

    for (const row of await linkedEmployeesWithoutSettlement(env, period)) {
      warnings.push({ code: 'NOT_SETTLED', employeeId: row.id, message: `${employeeName(row)} (${row.taxId}): vinculado en el periodo pero sin liquidación.` });
    }
  }

  return {
    status: String(period.status),
    canClose: blockers.length === 0,
    blockers,
    warnings,
    totals,
  };
}

export async function handleCloseReviewRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/payroll-periods\/([^/]+)\/close-review$/);

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

  return sendJson({ success: true, data: await reviewPeriodClose(env, period) });
}
