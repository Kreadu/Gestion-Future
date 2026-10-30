/**
 * Consulta del registro de actividad (tabla audit_log):
 *
 *   GET /api/audit-log?companyId=&action=&entity=&from=&to=&limit=&before=
 *
 * from/to son días calendario de Colombia (UTC-5); `at` se guarda en UTC.
 *     → { entries, nextBefore }
 *
 * La más reciente primero. `before` es el cursor que devuelve la
 * página anterior (nextBefore). Un administrador de empresa sólo ve su
 * empresa (companyId obligatorio); el SUPER_ADMIN puede omitirlo y ver
 * toda la plataforma.
 */

import { sendJson } from '../http';
import { HttpError, requireRole, requireCompanyAccess, type AuthUser } from '../auth/authz';

interface RouteEnv {
  DB: D1Database;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Descripción legible de "ACCIÓN entidad". Lo no listado cae en el genérico. */
const DESCRIPTIONS: Record<string, string> = {
  'CREATE company': 'Creó la empresa',
  'UPDATE company': 'Editó la empresa',
  'DELETE company': 'Eliminó la empresa',
  'CREATE professional': 'Creó un profesional de la bolsa por horas',
  'UPDATE professional': 'Editó un profesional de la bolsa por horas',
  'CREATE employee': 'Creó un empleado',
  'UPDATE employee': 'Editó un empleado',
  'DELETE employee': 'Eliminó un empleado',
  'IMPORT employee': 'Importó empleados desde Excel',
  'CREATE employee_leave': 'Registró una novedad (incapacidad, licencia o vacaciones)',
  'UPDATE employee_leave': 'Editó una novedad',
  'DELETE employee_leave': 'Eliminó una novedad',
  'CREATE payroll_period': 'Creó un periodo de nómina',
  'CLOSE payroll_period': 'Cerró el periodo de nómina',
  'CREATE payroll_settlement': 'Calculó una liquidación de nómina',
  'RECALCULATE payroll_settlement': 'Recalculó una liquidación de nómina',
  // Registros anteriores a oct-2026: no distinguían recálculo y XML.
  'UPDATE payroll_settlement': 'Recalculó una liquidación o generó su XML DIAN',
  'GENERATE_XML payroll_settlement': 'Generó el XML de nómina electrónica DIAN',
  'EXPORT bank_file': 'Descargó el archivo bancario',
  'EXPORT pila': 'Descargó el archivo PILA',
  'EXPORT accounting': 'Descargó el comprobante contable',
  'CREATE benefit_payment': 'Registró un pago de prestaciones',
  'DELETE benefit_payment': 'Eliminó un pago de prestaciones',
  'CREATE employee_termination': 'Registró un retiro y liquidación definitiva',
  'CREATE engagement': 'Creó una vinculación por horas',
  'UPDATE engagement': 'Editó una vinculación por horas',
  'DELETE engagement': 'Eliminó una vinculación por horas',
  'CREATE time_entry': 'Registró horas',
  'CREATE pila_verification': 'Verificó la PILA de un contratista',
  'CREATE settlement': 'Liquidó personal por horas',
  'CREATE user': 'Dio acceso a un usuario',
  'DELETE user': 'Quitó el acceso a un usuario',
  'CREATE employee_request': 'Un empleado hizo una solicitud desde el portal',
  'APPROVE employee_request': 'Aprobó una solicitud del portal',
  'REJECT employee_request': 'Rechazó una solicitud del portal',
  'CANCEL employee_request': 'El empleado canceló su solicitud',
};

export function describeAudit(action: string, entity: string): string {
  return DESCRIPTIONS[`${action} ${entity}`] || `${action} ${entity}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 00:00 de ese día en Colombia (UTC-5, sin horario de verano), en UTC. */
function colombiaDayStartUtc(day: string): string {
  return `${day}T05:00:00.000Z`;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function handleAuditLogRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  if (url.pathname !== '/api/audit-log' || request.method !== 'GET') {
    return null;
  }

  requireRole(user, ['TENANT_ADMIN']);

  const q = (name: string) => String(url.searchParams.get(name) || '').trim();
  const companyId = q('companyId');

  if (companyId) {
    requireCompanyAccess(user, companyId);
  } else if (user.role !== 'SUPER_ADMIN') {
    return sendJson({ success: false, error: 'companyId es obligatorio.' }, 400);
  }

  const from = q('from');
  const to = q('to');
  if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
    throw new HttpError(400, 'Las fechas van en formato AAAA-MM-DD.');
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q('limit')) || DEFAULT_LIMIT));

  // Cursor "at|id": a igual fecha desempata por id, así no se repite ni
  // se salta ninguna fila entre páginas.
  const [beforeAt, beforeId] = q('before').split('|');

  // Sólo los filtros presentes, para que D1 use los índices
  // (companyId, at, id) y (at, id) de la migración 0014.
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, ...values: unknown[]) => {
    where.push(sql.replace(/\?/g, () => `?${params.push(values.shift())}`));
  };

  if (companyId) add('a.companyId = ?', companyId);
  if (q('action')) add('a.action = ?', q('action'));
  if (q('entity')) add('a.entity = ?', q('entity'));
  if (from) add('a.at >= ?', colombiaDayStartUtc(from));
  // "hasta" incluye todo ese día.
  if (to) add('a.at < ?', colombiaDayStartUtc(nextDay(to)));
  if (beforeAt) add('(a.at < ? OR (a.at = ? AND a.id < ?))', beforeAt, beforeAt, beforeId || '');

  params.push(limit + 1);

  const rows = (await env.DB
    .prepare(`
      SELECT a.id, a.at, a.email, a.action, a.entity, a.entityId, a.companyId, c.name AS companyName
      FROM audit_log a
      LEFT JOIN companies c ON c.id = a.companyId
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.at DESC, a.id DESC
      LIMIT ?${params.length}
    `)
    .bind(...params)
    .all<any>()).results || [];

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return sendJson({
    success: true,
    data: {
      entries: page.map(r => ({
        id: r.id,
        at: r.at,
        email: r.email,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        companyId: r.companyId,
        companyName: r.companyName ?? null,
        description: describeAudit(r.action, r.entity),
      })),
      nextBefore: rows.length > limit && last ? `${last.at}|${last.id}` : null,
    },
  });
}
