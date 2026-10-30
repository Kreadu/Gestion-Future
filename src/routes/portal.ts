/**
 * Portal del empleado (rol EMPLOYEE). Sólo lectura:
 *
 *   GET /api/portal/me                       ficha, saldo de vacaciones y licencias
 *   GET /api/portal/payslips                 sus desprendibles (liquidaciones de periodos)
 *   GET /api/portal/payslips/:id             detalle de un desprendible
 *   GET /api/portal/benefits                 prima/cesantías pagadas y liquidación definitiva
 *   GET /api/portal/employment-certificate   datos del certificado laboral
 *   GET /api/portal/income-certificate?year=AAAA  formulario 220 del año
 *
 * Los desprendibles son sólo los de periodos CERRADOS: un borrador
 * todavía puede recalcularse y no es lo que se le pagó.
 *
 * Todo se filtra por user.employeeId y user.companyId (los de la
 * tabla users), nunca por parámetros del cliente.
 *
 * Además, deny-by-default: un EMPLOYEE no puede tocar ninguna otra
 * ruta /api/* (salvo /api/me, que index.ts resuelve antes). Sin esto,
 * varias rutas administrativas validaban el cuerpo o buscaban el
 * registro ANTES de requireRole y respondían 400/404, lo que le
 * permitía a un empleado averiguar qué IDs existen en la plataforma.
 */

import { sendJson } from '../http';
import { HttpError, type AuthUser } from '../auth/authz';
import { vacationBalance } from './benefits';
import { buildEmploymentCertificate, buildIncomeCertificate } from './certificates';
import { employeeName } from './periodEmployees';

interface RouteEnv {
  DB: D1Database;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}


/** Deja visibles sólo los últimos 4 dígitos de la cuenta. */
export function maskAccount(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (s.length <= 4) return '*'.repeat(s.length);
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

function parseJson(text: unknown): any {
  try {
    return JSON.parse(String(text));
  } catch {
    return null;
  }
}

/**
 * Empleado y empresa del usuario autenticado. Exige rol EMPLOYEE
 * explícitamente (requireRole dejaría pasar a SUPER_ADMIN) y que el
 * empleado enlazado pertenezca a la empresa del usuario.
 */
async function loadOwnEmployee(env: RouteEnv, user: AuthUser) {
  if (user.role !== 'EMPLOYEE') {
    throw new HttpError(403, 'El portal del empleado es sólo para empleados.');
  }

  if (!user.employeeId || !user.companyId) {
    throw new HttpError(403, 'Tu usuario no está enlazado a un empleado. Contacta a tu administrador.');
  }

  const employee = await env.DB
    .prepare(`SELECT * FROM employees WHERE id = ?1 AND companyId = ?2`)
    .bind(user.employeeId, user.companyId)
    .first<any>();

  if (!employee) {
    throw new HttpError(403, 'Tu usuario no está enlazado a un empleado. Contacta a tu administrador.');
  }

  const company = await env.DB
    .prepare(`SELECT id, name, nit, dv, address, city, phone, email, legalRepresentative, logo FROM companies WHERE id = ?1`)
    .bind(user.companyId)
    .first<any>();

  return { employee, company: company || { id: user.companyId, name: '' } };
}

function publicEmployee(e: any) {
  return {
    id: String(e.id),
    fullName: employeeName(e),
    firstName: e.firstName,
    firstName2: e.firstName2 ?? null,
    lastName: e.lastName,
    lastName2: e.lastName2 ?? null,
    taxId: e.taxId,
    position: e.position ?? null,
    contractType: e.contractType ?? null,
    hireDate: e.hireDate ?? null,
    terminationDate: e.terminationDate ?? null,
    active: !!e.active,
    salary: Number(e.salary ?? 0),
    isIntegralSalary: !!e.isIntegralSalary,
    bankName: e.bankName ?? null,
    bankAccountType: e.bankAccountType ?? null,
    bankAccountNumber: maskAccount(e.bankAccountNumber),
  };
}

function publicCompany(c: any) {
  return {
    name: c.name,
    nit: c.nit ?? null,
    dv: c.dv ?? null,
    address: c.address ?? null,
    city: c.city ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    legalRepresentative: c.legalRepresentative ?? null,
    logo: c.logo ?? null,
  };
}

export async function handlePortalRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  const isPortal = url.pathname === '/api/portal' || url.pathname.startsWith('/api/portal/');

  if (!isPortal) {
    if (user.role === 'EMPLOYEE') {
      throw new HttpError(403, 'No tienes permisos para realizar esta acción.');
    }
    return null;
  }

  const { employee, company } = await loadOwnEmployee(env, user);

  if (request.method !== 'GET') {
    return sendJson({ success: false, error: 'Método no permitido.' }, 405);
  }

  if (url.pathname === '/api/portal/me') {
    let balance = null;

    if (employee.hireDate) {
      balance = await vacationBalance(env, employee, today());
    }

    const leaves = await env.DB
      .prepare(`
        SELECT id, leaveType, startDate, endDate, totalDays, businessDays, notes
        FROM employee_leaves
        WHERE employeeId = ?1 AND companyId = ?2
        ORDER BY startDate DESC
      `)
      .bind(employee.id, employee.companyId)
      .all<any>();

    return sendJson({
      success: true,
      data: {
        employee: publicEmployee(employee),
        company: publicCompany(company),
        vacationBalance: balance,
        leaves: (leaves.results || []).map(l => ({
          id: l.id,
          leaveType: l.leaveType,
          startDate: l.startDate,
          endDate: l.endDate,
          totalDays: Number(l.totalDays ?? 0),
          businessDays: l.businessDays === null || l.businessDays === undefined ? null : Number(l.businessDays),
          notes: l.notes ?? null,
        })),
      },
    });
  }

  if (url.pathname === '/api/portal/payslips') {
    const result = await env.DB
      .prepare(`
        SELECT s.id, s.periodId, s.employeeId, s.daysWorked, s.grossEarnings,
               s.totalDeductions, s.netPay, p.periodStart, p.periodEnd, p.status
        FROM payroll_settlements s
        JOIN payroll_periods p ON p.id = s.periodId
        WHERE s.employeeId = ?1 AND s.companyId = ?2 AND p.companyId = ?2
          AND p.status = 'CLOSED'
        ORDER BY p.periodStart DESC
      `)
      .bind(employee.id, employee.companyId)
      .all<any>();

    return sendJson({
      success: true,
      data: (result.results || []).map(r => ({
        id: r.id,
        periodId: r.periodId,
        employeeId: r.employeeId,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        periodStatus: r.status === 'CLOSED' ? 'CLOSED' : 'DRAFT',
        daysWorked: Number(r.daysWorked ?? 0),
        grossEarnings: Number(r.grossEarnings ?? 0),
        totalDeductions: Number(r.totalDeductions ?? 0),
        netPay: Number(r.netPay ?? 0),
      })),
    });
  }

  const payslipMatch = url.pathname.match(/^\/api\/portal\/payslips\/([^/]+)$/);

  if (payslipMatch) {
    const row = await env.DB
      .prepare(`
        SELECT s.id, s.periodId, s.employeeId, s.daysWorked, s.grossEarnings,
               s.totalDeductions, s.netPay, s.resultJson, p.periodStart, p.periodEnd, p.status
        FROM payroll_settlements s
        JOIN payroll_periods p ON p.id = s.periodId
        WHERE s.id = ?1 AND s.employeeId = ?2 AND s.companyId = ?3 AND p.companyId = ?3
          AND p.status = 'CLOSED'
      `)
      .bind(decodeURIComponent(payslipMatch[1]), employee.id, employee.companyId)
      .first<any>();

    if (!row) {
      return sendJson({ success: false, error: 'Desprendible no encontrado.' }, 404);
    }

    return sendJson({
      success: true,
      data: {
        id: row.id,
        periodId: row.periodId,
        employeeId: row.employeeId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        periodStatus: row.status === 'CLOSED' ? 'CLOSED' : 'DRAFT',
        daysWorked: Number(row.daysWorked ?? 0),
        grossEarnings: Number(row.grossEarnings ?? 0),
        totalDeductions: Number(row.totalDeductions ?? 0),
        netPay: Number(row.netPay ?? 0),
        calculation: parseJson(row.resultJson),
        employee: publicEmployee(employee),
        company: publicCompany(company),
      },
    });
  }

  if (url.pathname === '/api/portal/benefits') {
    const payments = await env.DB
      .prepare(`
        SELECT id, benefitType, periodStart, periodEnd, days, base, amount, createdAt
        FROM benefit_payments
        WHERE employeeId = ?1 AND companyId = ?2
        ORDER BY periodStart DESC, benefitType
      `)
      .bind(employee.id, employee.companyId)
      .all<any>();

    const termination = await env.DB
      .prepare(`
        SELECT id, terminationDate, reason, total, resultJson, createdAt
        FROM employee_terminations
        WHERE employeeId = ?1 AND companyId = ?2
      `)
      .bind(employee.id, employee.companyId)
      .first<any>();

    // resultJson guarda { input, result } (ver routes/benefits.ts).
    const stored = termination ? parseJson(termination.resultJson) : null;

    return sendJson({
      success: true,
      data: {
        payments: (payments.results || []).map(p => ({
          id: p.id,
          benefitType: p.benefitType,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          days: Number(p.days ?? 0),
          base: Number(p.base ?? 0),
          amount: Number(p.amount ?? 0),
          createdAt: p.createdAt ?? null,
        })),
        termination: termination
          ? {
              id: termination.id,
              terminationDate: termination.terminationDate,
              reason: termination.reason,
              total: Number(termination.total ?? 0),
              input: stored?.input ?? null,
              result: stored?.result ?? null,
              createdAt: termination.createdAt ?? null,
            }
          : null,
      },
    });
  }

  if (url.pathname === '/api/portal/employment-certificate') {
    return sendJson({ success: true, data: await buildEmploymentCertificate(env, String(employee.id)) });
  }

  if (url.pathname === '/api/portal/income-certificate') {
    const yearParam = url.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear() - 1;

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return sendJson({ success: false, error: 'Año gravable inválido.' }, 400);
    }

    return sendJson({ success: true, data: await buildIncomeCertificate(env, String(employee.id), year) });
  }

  return sendJson({ success: false, error: 'Ruta no encontrada.' }, 404);
}
