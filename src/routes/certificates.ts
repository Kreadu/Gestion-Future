/**
 * Certificados del empleado:
 *
 *   GET /api/employees/:id/income-certificate?year=2026
 *       certificado de ingresos y retenciones (formulario 220)
 *   GET /api/employees/:id/employment-certificate
 *       certificado laboral (constancia de vínculo)
 *
 * `buildIncomeCertificate` y `buildEmploymentCertificate` no
 * autorizan: el portal del empleado las reutiliza con su propia
 * autorización. Las rutas de aquí son para TENANT_ADMIN/SUPER_ADMIN.
 */

import { sendJson } from '../http';
import { logoMetaFromRow, LOGO_UPDATED_AT_SQL } from './logos';
import {
  requireRole,
  requireCompanyAccess,
  HttpError,
  type AuthUser,
} from '../auth/authz';
import {
  computeIncomeCertificate,
  certificatePeriod,
  contractTypeLabel,
  type IncomeCertificateResult,
} from '../services/incomeCertificate';

interface RouteEnv {
  DB: D1Database;
}

export interface CertificateCompany {
  id: string;
  name: string;
  nit: string;
  dv: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  legalRepresentative: string | null;
  hasLogo: boolean;
  logoVersion: string | null;
}

export interface CertificateEmployee {
  id: string;
  fullName: string;
  firstName: string;
  firstName2: string | null;
  lastName: string;
  lastName2: string | null;
  /** Cédula de ciudadanía (13): el empleado no guarda tipo de documento. */
  documentType: string;
  taxId: string;
  position: string | null;
  contractType: string | null;
  contractTypeLabel: string;
  salary: number;
  isIntegralSalary: boolean;
  hireDate: string | null;
  contractEndDate: string | null;
  terminationDate: string | null;
  active: boolean;
}

export interface IncomeCertificateData {
  year: number;
  issueDate: string;
  period: { from: string; to: string };
  /** Lugar donde se practicó la retención. */
  retentionPlace: string | null;
  company: CertificateCompany;
  employee: CertificateEmployee;
  certificate: IncomeCertificateResult;
}

export interface EmploymentCertificateData {
  issueDate: string;
  company: CertificateCompany;
  employee: CertificateEmployee;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapCompany(row: any): CertificateCompany {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    nit: String(row.nit || ''),
    dv: row.dv ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    department: row.department ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    legalRepresentative: row.legalRepresentative ?? null,
    ...logoMetaFromRow(row),
  };
}

function mapEmployee(row: any): CertificateEmployee {
  return {
    id: String(row.id),
    fullName: [row.firstName, row.firstName2, row.lastName, row.lastName2].filter(Boolean).join(' '),
    firstName: String(row.firstName || ''),
    firstName2: row.firstName2 || null,
    lastName: String(row.lastName || ''),
    lastName2: row.lastName2 || null,
    documentType: '13',
    taxId: String(row.taxId || ''),
    position: row.position || null,
    contractType: row.contractType ? String(row.contractType) : null,
    contractTypeLabel: contractTypeLabel(row.contractType),
    salary: Number(row.salary || 0),
    isIntegralSalary: !!row.isIntegralSalary,
    hireDate: row.hireDate || null,
    contractEndDate: row.contractEndDate || null,
    terminationDate: row.terminationDate || null,
    active: row.active === undefined || row.active === null ? true : !!row.active,
  };
}

async function loadEmployeeAndCompany(env: RouteEnv, employeeId: string) {
  const employee = await env.DB
    .prepare(`SELECT * FROM employees WHERE id = ?1`)
    .bind(employeeId)
    .first<any>();

  if (!employee) {
    throw new HttpError(404, 'Empleado no encontrado.');
  }

  const company = await env.DB
    .prepare(`SELECT *, ${LOGO_UPDATED_AT_SQL} FROM companies WHERE id = ?1`)
    .bind(employee.companyId)
    .first<any>();

  if (!company) {
    throw new HttpError(404, 'Empresa no encontrada.');
  }

  return { employee, company };
}

/**
 * Datos del certificado de ingresos y retenciones del año gravable
 * `year`. Sin autorización: quien llama debe validar el acceso.
 */
export async function buildIncomeCertificate(
  env: RouteEnv,
  employeeId: string,
  year: number
): Promise<IncomeCertificateData> {
  const { employee, company } = await loadEmployeeAndCompany(env, employeeId);

  const settlements = await env.DB
    .prepare(`
      SELECT p.periodStart, p.periodEnd, p.status, s.resultJson
      FROM payroll_settlements s
      JOIN payroll_periods p ON p.id = s.periodId
      WHERE s.employeeId = ?1
        AND p.periodEnd >= ?2
        AND p.periodEnd <= ?3
      ORDER BY p.periodStart
    `)
    .bind(employee.id, `${year}-01-01`, `${year}-12-31`)
    .all<any>();

  // Prima del año; cesantías e intereses del año anterior (se pagan
  // en el año gravable). El servicio decide qué cuenta.
  const benefits = await env.DB
    .prepare(`
      SELECT benefitType, periodStart, periodEnd, amount
      FROM benefit_payments
      WHERE employeeId = ?1
        AND periodEnd >= ?2
        AND periodEnd <= ?3
    `)
    .bind(employee.id, `${year - 1}-01-01`, `${year}-12-31`)
    .all<any>();

  const terminationRow = await env.DB
    .prepare(`SELECT terminationDate, resultJson FROM employee_terminations WHERE employeeId = ?1`)
    .bind(employee.id)
    .first<any>();

  let termination = null;

  if (terminationRow) {
    const parsed = JSON.parse(String(terminationRow.resultJson));
    termination = {
      terminationDate: String(terminationRow.terminationDate),
      result: parsed?.result ?? parsed,
    };
  }

  const certificate = computeIncomeCertificate({
    year,
    settlements: (settlements.results || []).map(r => ({
      periodStart: String(r.periodStart),
      periodEnd: String(r.periodEnd),
      closed: r.status === 'CLOSED',
      result: JSON.parse(String(r.resultJson)),
    })),
    benefitPayments: (benefits.results || []).map(r => ({
      benefitType: String(r.benefitType),
      periodStart: String(r.periodStart),
      periodEnd: String(r.periodEnd),
      amount: Number(r.amount),
    })),
    termination,
  });

  const mappedCompany = mapCompany(company);

  return {
    year,
    issueDate: today(),
    period: certificatePeriod(year, employee.hireDate, employee.terminationDate),
    retentionPlace: mappedCompany.city,
    company: mappedCompany,
    employee: mapEmployee(employee),
    certificate,
  };
}

/**
 * Datos del certificado laboral. Sin autorización: quien llama debe
 * validar el acceso.
 */
export async function buildEmploymentCertificate(
  env: RouteEnv,
  employeeId: string
): Promise<EmploymentCertificateData> {
  const { employee, company } = await loadEmployeeAndCompany(env, employeeId);

  return {
    issueDate: today(),
    company: mapCompany(company),
    employee: mapEmployee(employee),
  };
}

async function authorizeEmployee(env: RouteEnv, user: AuthUser, employeeId: string) {
  requireRole(user, ['TENANT_ADMIN']);

  const row = await env.DB
    .prepare(`SELECT companyId FROM employees WHERE id = ?1`)
    .bind(employeeId)
    .first<any>();

  if (!row) {
    throw new HttpError(404, 'Empleado no encontrado.');
  }

  requireCompanyAccess(user, String(row.companyId));
}

export async function handleCertificateRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  if (request.method !== 'GET') return null;

  const incomeMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/income-certificate$/);

  if (incomeMatch) {
    const employeeId = decodeURIComponent(incomeMatch[1]);
    await authorizeEmployee(env, user, employeeId);

    const yearParam = url.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear() - 1;

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return sendJson({ success: false, error: 'Año gravable inválido.' }, 400);
    }

    return sendJson({ success: true, data: await buildIncomeCertificate(env, employeeId, year) });
  }

  const employmentMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/employment-certificate$/);

  if (employmentMatch) {
    const employeeId = decodeURIComponent(employmentMatch[1]);
    await authorizeEmployee(env, user, employeeId);

    return sendJson({ success: true, data: await buildEmploymentCertificate(env, employeeId) });
  }

  return null;
}
