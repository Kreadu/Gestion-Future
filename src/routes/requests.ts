/**
 * Solicitudes de vacaciones y permisos (tabla employee_requests).
 *
 * Empleado (rol EMPLOYEE, siempre sobre su propia ficha):
 *   GET  /api/portal/requests              sus solicitudes
 *   POST /api/portal/requests              { requestType, startDate, endDate, reason }
 *   POST /api/portal/requests/:id/cancel   sólo si sigue pendiente
 *
 * Administrador de la empresa:
 *   GET  /api/employee-requests?companyId=&status=
 *   POST /api/employee-requests/:id/approve  { notes }
 *   POST /api/employee-requests/:id/reject   { notes }
 *
 * Aprobar VACATION registra la novedad con createEmployeeLeave (mismas
 * validaciones que el registro manual); si falla, la solicitud vuelve
 * a pendiente. PERMISSION queda aprobado sin efecto en la nómina.
 *
 * Se atiende antes que src/routes/portal.ts, que es de sólo lectura y
 * niega a un EMPLOYEE cualquier otra ruta.
 */

import { sendJson } from '../http';
import { HttpError, requireRole, requireCompanyAccess, audit, type AuthUser } from '../auth/authz';
import { businessDaysBetween } from '../services/colombiaHolidays';
import { days360, vacationDaysAccrued } from '../engine/countries/colombiaBenefits';
import { createEmployeeLeave } from './leaves';
import { employeeName } from './periodEmployees';

interface RouteEnv {
  DB: D1Database;
}

const REQUEST_TYPES = ['VACATION', 'PERMISSION'];
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de hoy en Colombia (UTC-5, sin horario de verano). */
function today(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

/** AAAA-MM-DD de una fecha que existe (rechaza 2026-02-31). */
function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Máximo de días calendario de una solicitud. */
const MAX_REQUEST_DAYS = 120;

function text(value: unknown, max = 500): string | null {
  const s = String(value ?? '').trim().slice(0, max);
  return s || null;
}

function publicRequest(row: any) {
  return {
    id: String(row.id),
    employeeId: String(row.employeeId),
    companyId: String(row.companyId),
    requestType: row.requestType,
    startDate: row.startDate,
    endDate: row.endDate,
    businessDays: row.businessDays === null || row.businessDays === undefined ? null : Number(row.businessDays),
    reason: row.reason ?? null,
    status: row.status,
    decidedBy: row.decidedBy ?? null,
    decidedAt: row.decidedAt ?? null,
    decisionNotes: row.decisionNotes ?? null,
    leaveId: row.leaveId ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * Días de vacaciones disponibles hoy de cada empleado: saldo causado a
 * la fecha (misma fórmula que vacationBalance en benefits.ts) menos las
 * vacaciones registradas que empiezan después de hoy y las solicitudes
 * de vacaciones pendientes, salvo la que se está evaluando.
 *
 * Dos consultas por empresa, sin importar cuántos empleados se evalúen.
 */
async function availableVacationDaysFor(
  env: RouteEnv,
  companyId: string,
  employees: { employee: any; excludeRequestId: string }[]
): Promise<Map<string, number | null>> {
  const [leaves, pending] = await Promise.all([
    env.DB
      .prepare(`SELECT employeeId, startDate, businessDays FROM employee_leaves WHERE companyId = ?1 AND leaveType = 'VACATION'`)
      .bind(companyId)
      .all<any>(),
    env.DB
      .prepare(`SELECT id, employeeId, businessDays FROM employee_requests WHERE companyId = ?1 AND requestType = 'VACATION' AND status = 'PENDING'`)
      .bind(companyId)
      .all<any>(),
  ]);

  const now = today();
  const result = new Map<string, number | null>();

  for (const { employee, excludeRequestId } of employees) {
    const key = `${employee.id}|${excludeRequestId}`;
    if (!employee.hireDate) {
      result.set(key, null);
      continue;
    }

    const end = employee.terminationDate && employee.terminationDate < now ? employee.terminationDate : now;
    const accrued = vacationDaysAccrued(days360(employee.hireDate, end));
    const own = (leaves.results || []).filter(l => l.employeeId === employee.id);
    const taken = own.filter(l => l.startDate <= end).reduce((t, l) => t + Number(l.businessDays || 0), 0)
      + Number(employee.vacationDaysTakenBefore || 0);
    const scheduled = own.filter(l => l.startDate > now).reduce((t, l) => t + Number(l.businessDays || 0), 0);
    const requested = (pending.results || [])
      .filter(r => r.employeeId === employee.id && r.id !== excludeRequestId)
      .reduce((t, r) => t + Number(r.businessDays || 0), 0);

    result.set(key, Math.round((accrued - taken - scheduled - requested) * 100) / 100);
  }

  return result;
}

async function availableVacationDays(env: RouteEnv, employee: any, excludeRequestId = ''): Promise<number | null> {
  const map = await availableVacationDaysFor(env, String(employee.companyId), [{ employee, excludeRequestId }]);
  return map.get(`${employee.id}|${excludeRequestId}`) ?? null;
}

async function ownEmployee(env: RouteEnv, user: AuthUser) {
  if (user.role !== 'EMPLOYEE' || !user.employeeId || !user.companyId) {
    throw new HttpError(403, 'Las solicitudes del portal son sólo para empleados.');
  }

  const employee = await env.DB
    .prepare(`SELECT * FROM employees WHERE id = ?1 AND companyId = ?2`)
    .bind(user.employeeId, user.companyId)
    .first<any>();

  if (!employee) {
    throw new HttpError(403, 'Tu usuario no está enlazado a un empleado. Contacta a tu administrador.');
  }

  return employee;
}

async function createRequest(env: RouteEnv, user: AuthUser, employee: any, body: any): Promise<Response> {
  const requestType = String(body?.requestType || '').trim();
  const startDate = String(body?.startDate || '').trim();
  const endDate = String(body?.endDate || '').trim();
  const reason = text(body?.reason);

  if (!REQUEST_TYPES.includes(requestType)) {
    return sendJson({ success: false, error: 'El tipo de solicitud debe ser vacaciones o permiso.' }, 400);
  }

  if (!isRealDate(startDate) || !isRealDate(endDate)) {
    return sendJson({ success: false, error: 'Fechas inválidas (formato AAAA-MM-DD).' }, 400);
  }

  if (endDate < startDate) {
    return sendJson({ success: false, error: 'La fecha final debe ser igual o posterior a la inicial.' }, 400);
  }

  if (startDate < today()) {
    return sendJson({ success: false, error: 'La solicitud no puede empezar en una fecha pasada.' }, 400);
  }

  const calendarDays = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;
  if (calendarDays > MAX_REQUEST_DAYS) {
    return sendJson({ success: false, error: `Una solicitud puede cubrir hasta ${MAX_REQUEST_DAYS} días; divídela si necesitas más.` }, 400);
  }

  if (requestType === 'PERMISSION' && !reason) {
    return sendJson({ success: false, error: 'Indica el motivo del permiso.' }, 400);
  }

  if (employee.terminationDate && endDate > employee.terminationDate) {
    return sendJson({ success: false, error: `La solicitud termina después de tu fecha de retiro (${employee.terminationDate}).` }, 400);
  }

  const overlap = await env.DB
    .prepare(`
      SELECT id FROM employee_requests
      WHERE employeeId = ?1 AND status IN ('PENDING', 'APPROVED')
        AND startDate <= ?3 AND endDate >= ?2
      LIMIT 1
    `)
    .bind(employee.id, startDate, endDate)
    .first();

  if (overlap) {
    return sendJson({ success: false, error: 'Ya tienes una solicitud pendiente o aprobada que se cruza con esas fechas.' }, 400);
  }

  // Lo que el administrador ya registró (incapacidades, licencias,
  // vacaciones): aprobar algo que se cruza fallaría.
  const leaveOverlap = await env.DB
    .prepare(`SELECT startDate, endDate FROM employee_leaves WHERE employeeId = ?1 AND startDate <= ?3 AND endDate >= ?2 LIMIT 1`)
    .bind(employee.id, startDate, endDate)
    .first<any>();

  if (leaveOverlap) {
    return sendJson({ success: false, error: `Ya tienes una novedad registrada del ${leaveOverlap.startDate} al ${leaveOverlap.endDate} que se cruza con esas fechas.` }, 400);
  }

  const businessDays = requestType === 'VACATION' ? businessDaysBetween(startDate, endDate) : null;

  if (businessDays === 0) {
    return sendJson({ success: false, error: 'Esas fechas no incluyen días hábiles: no descuentan vacaciones.' }, 400);
  }

  const pendingDays = requestType === 'VACATION' ? await availableVacationDays(env, employee) : null;

  const id = `REQ-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  await env.DB
    .prepare(`
      INSERT INTO employee_requests (id, employeeId, companyId, requestType, startDate, endDate, businessDays, reason, status, createdAt)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'PENDING', ?9)
    `)
    .bind(id, employee.id, employee.companyId, requestType, startDate, endDate, businessDays, reason, createdAt)
    .run();

  await audit(env as any, user, 'CREATE', 'employee_request', id, String(employee.companyId));

  const row = await env.DB.prepare(`SELECT * FROM employee_requests WHERE id = ?1`).bind(id).first<any>();

  return sendJson({
    success: true,
    data: {
      ...publicRequest(row),
      pendingDays,
      // Se permite (vacaciones anticipadas de común acuerdo), pero el
      // administrador debe verlo al decidir.
      exceedsBalance: pendingDays !== null && businessDays !== null && businessDays > pendingDays,
    },
  }, 201);
}

async function decide(env: RouteEnv, user: AuthUser, id: string, action: 'approve' | 'reject', body: any): Promise<Response> {
  requireRole(user, ['TENANT_ADMIN']);

  const row = await env.DB.prepare(`SELECT * FROM employee_requests WHERE id = ?1`).bind(id).first<any>();

  if (!row) {
    return sendJson({ success: false, error: 'Solicitud no encontrada.' }, 404);
  }

  requireCompanyAccess(user, String(row.companyId));

  const notes = text(body?.notes);
  const decidedAt = new Date().toISOString();
  const status = action === 'approve' ? 'APPROVED' : 'REJECTED';

  // Se reclama la solicitud antes de crear la novedad: dos aprobaciones
  // simultáneas no pueden registrar dos veces las vacaciones.
  const claimed = await env.DB
    .prepare(`
      UPDATE employee_requests
      SET status = ?1, decidedBy = ?2, decidedAt = ?3, decisionNotes = ?4
      WHERE id = ?5 AND status = 'PENDING'
    `)
    .bind(status, user.email, decidedAt, notes, id)
    .run();

  if (!claimed.meta?.changes) {
    return sendJson({ success: false, error: 'La solicitud ya no está pendiente.' }, 409);
  }

  if (action === 'approve' && row.requestType === 'VACATION') {
    const backToPending = () => env.DB
      .prepare(`
        UPDATE employee_requests
        SET status = 'PENDING', decidedBy = NULL, decidedAt = NULL, decisionNotes = NULL
        WHERE id = ?1
      `)
      .bind(id)
      .run();

    let leave: Response;
    try {
      leave = await createEmployeeLeave(env, user, {
        employeeId: row.employeeId,
        leaveType: 'VACATION',
        startDate: row.startDate,
        endDate: row.endDate,
        businessDays: row.businessDays,
        notes: 'Solicitud del portal' + (row.reason ? `: ${row.reason}` : ''),
      });
    } catch (error) {
      await backToPending();
      throw error;
    }

    if (leave.status !== 201) {
      await backToPending();
      return leave;
    }

    const created = await leave.json() as any;
    const linked = await env.DB
      .prepare(`UPDATE employee_requests SET leaveId = ?1 WHERE id = ?2`)
      .bind(created.data.id, id)
      .run();

    // Sin el enlace, borrar la novedad no cancelaría la solicitud: se
    // deshace la novedad y la solicitud vuelve a pendiente.
    if (!linked.meta?.changes) {
      await env.DB.prepare(`DELETE FROM employee_leaves WHERE id = ?1`).bind(created.data.id).run();
      await backToPending();
      return sendJson({ success: false, error: 'No se pudo completar la aprobación; inténtalo de nuevo.' }, 500);
    }
  }

  await audit(env as any, user, action === 'approve' ? 'APPROVE' : 'REJECT', 'employee_request', id, String(row.companyId));

  const updated = await env.DB.prepare(`SELECT * FROM employee_requests WHERE id = ?1`).bind(id).first<any>();
  return sendJson({ success: true, data: publicRequest(updated) });
}

export async function handleRequestRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  // --- Empleado ---
  if (url.pathname === '/api/portal/requests') {
    const employee = await ownEmployee(env, user);

    if (request.method === 'GET') {
      const rows = await env.DB
        .prepare(`SELECT * FROM employee_requests WHERE employeeId = ?1 ORDER BY startDate DESC, createdAt DESC`)
        .bind(employee.id)
        .all<any>();
      return sendJson({ success: true, data: (rows.results || []).map(publicRequest) });
    }

    if (request.method === 'POST') {
      return createRequest(env, user, employee, await request.json().catch(() => ({})));
    }

    return sendJson({ success: false, error: 'Método no permitido.' }, 405);
  }

  const cancelMatch = url.pathname.match(/^\/api\/portal\/requests\/([^/]+)\/cancel$/);

  if (cancelMatch && request.method === 'POST') {
    const employee = await ownEmployee(env, user);
    const id = decodeURIComponent(cancelMatch[1]);

    // Filtra por el empleado: la de otro responde 404, igual que una inexistente.
    const row = await env.DB
      .prepare(`SELECT * FROM employee_requests WHERE id = ?1 AND employeeId = ?2`)
      .bind(id, employee.id)
      .first<any>();

    if (!row) {
      return sendJson({ success: false, error: 'Solicitud no encontrada.' }, 404);
    }

    const result = await env.DB
      .prepare(`UPDATE employee_requests SET status = 'CANCELLED', decidedAt = ?1 WHERE id = ?2 AND status = 'PENDING'`)
      .bind(new Date().toISOString(), id)
      .run();

    if (!result.meta?.changes) {
      return sendJson({ success: false, error: 'Sólo se puede cancelar una solicitud pendiente.' }, 409);
    }

    await audit(env as any, user, 'CANCEL', 'employee_request', id, String(row.companyId));
    return sendJson({ success: true, message: 'Solicitud cancelada.' });
  }

  // --- Administrador ---
  if (url.pathname === '/api/employee-requests' && request.method === 'GET') {
    requireRole(user, ['TENANT_ADMIN']);

    const companyId = String(url.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return sendJson({ success: false, error: 'companyId es obligatorio.' }, 400);
    }
    requireCompanyAccess(user, companyId);

    const status = String(url.searchParams.get('status') || '').trim();
    if (status && !STATUSES.includes(status)) {
      return sendJson({ success: false, error: 'Estado inválido.' }, 400);
    }

    const rows = await env.DB
      .prepare(`
        SELECT r.*, e.firstName, e.firstName2, e.lastName, e.lastName2, e.taxId, e.hireDate,
               e.terminationDate, e.vacationDaysTakenBefore
        FROM employee_requests r
        JOIN employees e ON e.id = r.employeeId
        WHERE r.companyId = ?1 AND (?2 = '' OR r.status = ?2)
        ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END, r.startDate, r.createdAt
      `)
      .bind(companyId, status)
      .all<any>();

    // El saldo sólo importa para decidir vacaciones pendientes.
    const toEvaluate = (rows.results || [])
      .filter(row => row.status === 'PENDING' && row.requestType === 'VACATION')
      .map(row => ({ employee: { ...row, id: row.employeeId }, excludeRequestId: String(row.id) }));
    const balances = await availableVacationDaysFor(env, companyId, toEvaluate);

    const data = (rows.results || []).map(row => {
      const pendingDays = balances.get(`${row.employeeId}|${row.id}`) ?? null;
      return {
        ...publicRequest(row),
        employeeName: employeeName(row),
        taxId: row.taxId,
        pendingDays,
        exceedsBalance: pendingDays !== null && row.businessDays !== null && Number(row.businessDays) > pendingDays,
      };
    });

    return sendJson({ success: true, data });
  }

  const decideMatch = url.pathname.match(/^\/api\/employee-requests\/([^/]+)\/(approve|reject)$/);

  if (decideMatch && request.method === 'POST') {
    return decide(env, user, decodeURIComponent(decideMatch[1]), decideMatch[2] as 'approve' | 'reject', await request.json().catch(() => ({})));
  }

  return null;
}
