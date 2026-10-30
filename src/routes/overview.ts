/**
 * Panel central de empresas (vista de la outsourcing):
 *
 *   GET /api/overview → { month, summary, companies }
 *
 * Una fila por empresa activa con el estado de su nómina del mes en
 * curso (Colombia, UTC-5) y alertas: sin periodo del mes, empleados sin
 * liquidar, XML DIAN pendientes, periodos de meses anteriores abiertos
 * y solicitudes del portal por decidir. Las que tienen más alertas van
 * primero.
 *
 * SUPER_ADMIN ve todas las empresas; TENANT_ADMIN sólo la suya. Cada
 * dato sale de una consulta agrupada por empresa (no una por empresa).
 */

import { sendJson } from '../http';
import { HttpError, requireRole, type AuthUser } from '../auth/authz';

interface RouteEnv {
  DB: D1Database;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Primer y último día del mes en curso en Colombia (UTC-5). */
export function currentMonthBounds(now: Date): { start: string; end: string } {
  const local = new Date(now.getTime() - 5 * 3600_000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const mm = String(month + 1).padStart(2, '0');
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

interface Alert {
  code: string;
  message: string;
}

/** Filas agrupadas por companyId → Map. */
async function byCompany(stmt: D1PreparedStatement): Promise<Map<string, any>> {
  const rows = (await stmt.all<any>()).results || [];
  return new Map(rows.map(r => [String(r.companyId), r]));
}

export async function handleOverviewRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  if (url.pathname !== '/api/overview' || request.method !== 'GET') {
    return null;
  }

  requireRole(user, ['TENANT_ADMIN']);

  // null = todas las empresas: sólo para SUPER_ADMIN.
  if (user.role !== 'SUPER_ADMIN' && !user.companyId) {
    throw new HttpError(403, 'Tu usuario no está asociado a una empresa.');
  }
  const scope = user.role === 'SUPER_ADMIN' ? null : user.companyId;
  const { start, end } = currentMonthBounds(new Date());
  const monthLabel = `${MONTHS[Number(start.slice(5, 7)) - 1]} de ${start.slice(0, 4)}`;

  const [companies, employees, periods, unsettled, oldOpen, requests, activity] = await Promise.all([
    env.DB
      .prepare(`SELECT id, name, nit FROM companies WHERE active = 1 AND (?1 IS NULL OR id = ?1)`)
      .bind(scope)
      .all<any>(),
    byCompany(env.DB
      .prepare(`SELECT companyId, COUNT(*) AS n FROM employees WHERE active = 1 AND (?1 IS NULL OR companyId = ?1) GROUP BY companyId`)
      .bind(scope)),
    // Periodos que tocan el mes (también quincenas y los que cruzan de mes).
    env.DB
      .prepare(`
        SELECT p.id, p.companyId, p.periodStart, p.periodEnd, p.status,
               COUNT(s.id) AS settlements,
               COALESCE(SUM(CASE WHEN s.dianStatus != 'GENERATED' THEN 1 ELSE 0 END), 0) AS pendingXml
        FROM payroll_periods p
        LEFT JOIN payroll_settlements s ON s.periodId = p.id
        WHERE p.periodStart <= ?3 AND p.periodEnd >= ?2 AND (?1 IS NULL OR p.companyId = ?1)
        GROUP BY p.id
        ORDER BY p.periodStart DESC, p.periodEnd DESC, p.id
      `)
      .bind(scope, start, end)
      .all<any>(),
    // Empleados vinculados a cada periodo abierto del mes y cuántos no tienen liquidación.
    env.DB
      .prepare(`
        SELECT p.id AS periodId, COUNT(e.id) AS linked,
               SUM(CASE WHEN s.id IS NULL THEN 1 ELSE 0 END) AS unsettled
        FROM payroll_periods p
        JOIN employees e ON e.companyId = p.companyId
          AND (e.hireDate IS NULL OR e.hireDate <= p.periodEnd)
          AND (e.terminationDate IS NULL OR e.terminationDate >= p.periodStart)
          AND (e.active = 1 OR e.terminationDate IS NOT NULL)
        LEFT JOIN payroll_settlements s ON s.periodId = p.id AND s.employeeId = e.id
        WHERE p.status = 'DRAFT' AND p.periodStart <= ?3 AND p.periodEnd >= ?2 AND (?1 IS NULL OR p.companyId = ?1)
        GROUP BY p.id
      `)
      .bind(scope, start, end)
      .all<any>(),
    byCompany(env.DB
      .prepare(`SELECT companyId, COUNT(*) AS n FROM payroll_periods WHERE status = 'DRAFT' AND periodEnd < ?2 AND (?1 IS NULL OR companyId = ?1) GROUP BY companyId`)
      .bind(scope, start)),
    byCompany(env.DB
      .prepare(`SELECT companyId, COUNT(*) AS n FROM employee_requests WHERE status = 'PENDING' AND (?1 IS NULL OR companyId = ?1) GROUP BY companyId`)
      .bind(scope)),
    byCompany(env.DB
      .prepare(`SELECT companyId, MAX(at) AS at FROM audit_log WHERE companyId IS NOT NULL AND (?1 IS NULL OR companyId = ?1) GROUP BY companyId`)
      .bind(scope)),
  ]);

  const monthPeriods = new Map<string, any[]>();
  for (const p of periods.results || []) {
    const list = monthPeriods.get(String(p.companyId)) || [];
    list.push(p);
    monthPeriods.set(String(p.companyId), list);
  }
  const unsettledByPeriod = new Map((unsettled.results || []).map(r => [String(r.periodId), r]));

  const rows = (companies.results || []).map(c => {
    const id = String(c.id);
    const activeEmployees = Number(employees.get(id)?.n || 0);
    const list = monthPeriods.get(id) || [];
    // Se muestra el más reciente; las alertas cubren todos los abiertos del mes.
    const p = list[0];
    const openPastPeriods = Number(oldOpen.get(id)?.n || 0);
    const pendingRequests = Number(requests.get(id)?.n || 0);
    const alerts: Alert[] = [];

    if (!p && activeEmployees > 0) {
      alerts.push({ code: 'NO_CURRENT_PERIOD', message: `No hay periodo de nómina de ${monthLabel}.` });
    }

    for (const open of list.filter(x => x.status === 'DRAFT')) {
      const range = `${open.periodStart} a ${open.periodEnd}`;
      const u = unsettledByPeriod.get(String(open.id));

      if (Number(open.settlements) === 0) {
        alerts.push({ code: 'PERIOD_WITHOUT_SETTLEMENTS', message: `El periodo ${range} no tiene liquidaciones.` });
      } else if (u && Number(u.unsettled) > 0) {
        alerts.push({ code: 'UNSETTLED_EMPLOYEES', message: `${u.unsettled} de ${u.linked} empleado(s) sin liquidar en el periodo ${range}.` });
      }
      if (Number(open.pendingXml) > 0) {
        alerts.push({ code: 'PENDING_XML', message: `${open.pendingXml} liquidación(es) sin XML DIAN en el periodo ${range}.` });
      }
    }

    if (openPastPeriods > 0) {
      alerts.push({ code: 'OLD_PERIOD_OPEN', message: `${openPastPeriods} periodo(s) de meses anteriores sin cerrar.` });
    }

    if (pendingRequests > 0) {
      alerts.push({ code: 'PENDING_REQUESTS', message: `${pendingRequests} solicitud(es) del portal por decidir.` });
    }

    return {
      companyId: id,
      name: c.name,
      nit: c.nit,
      activeEmployees,
      currentPeriod: p
        ? {
            id: String(p.id),
            periodStart: p.periodStart,
            periodEnd: p.periodEnd,
            // Cerrado sólo si todos los periodos del mes lo están.
            status: list.some(x => x.status === 'DRAFT') ? 'DRAFT' : 'CLOSED',
            settlements: Number(p.settlements),
            pendingXml: Number(p.pendingXml),
          }
        : null,
      openPastPeriods,
      pendingRequests,
      lastActivityAt: activity.get(id)?.at ?? null,
      alerts,
    };
  });

  rows.sort((x, y) => y.alerts.length - x.alerts.length || String(x.name).localeCompare(String(y.name), 'es'));

  return sendJson({
    success: true,
    data: {
      month: { start, end, label: monthLabel },
      summary: {
        companies: rows.length,
        withAlerts: rows.filter(r => r.alerts.length > 0).length,
        closedThisMonth: rows.filter(r => r.currentPeriod?.status === 'CLOSED').length,
        activeEmployees: rows.reduce((t, r) => t + r.activeEmployees, 0),
        pendingRequests: rows.reduce((t, r) => t + r.pendingRequests, 0),
      },
      companies: rows,
    },
  });
}
