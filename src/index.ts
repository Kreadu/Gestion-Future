import ColombiaPayrollEngine, {
  ColombiaPayrollEngineError,
} from './engine/countries/colombiaEngine';
import type {
  ColombiaPayrollInput,
  ColombiaPayrollResult,
  EmployeeLeaveInput,
  EmployeeLeaveType,
} from './types/payroll';

import { DianNominaXmlService } from './services/dianNominaXmlService';
interface DianEmployerInfo {
  nit: string;
  dv: string;
  companyName: string;
  softwareId: string;
  pinSoftware: string;
  testSetId?: string;
}

interface DianEmployeeExtraInfo {
  typeDocument: '13' | '31' | '22' | '41' | '42';
  typeContract: '1' | '2' | '3' | '4' | '5';
  paymentMethod: '10' | '42' | '20';
  bankName?: string;
  accountNumber?: string;
  accountType?: 'AHORROS' | 'CORRIENTE';
}

import { BankDisbursementService } from './services/bankDisbursement';
import { getDashboardHtml } from './dashboard';
import {
  authenticate,
  requireRole,
  requireCompanyAccess,
  canAccessCompany,
  audit,
  HttpError,
  type AuthUser,
  type UserRole,
} from './auth/authz';

import {
  PartTimeEmployeeEngine,
  PartTimeEmployeeEngineError,
  MIN_HOURLY_WAGE,
} from './engine/hourly/partTimeEmployeeEngine';

import {
  IndependentContractorEngine,
  IndependentContractorEngineError,
} from './engine/hourly/independentContractorEngine';

import { DocumentoSoporteService } from './services/documentoSoporteService';
import { getNextDianConsecutive } from './services/dianCounters';
import { intersectDateRanges } from './services/dateRanges';
import { CONSTANTS_2026 } from './engine/countries/constants2026';

import type {
  Professional,
  Engagement,
  VinculationType,
  RetentionConcept,
  PartTimeEmployeeInput,
  IndependentContractorInput,
  DocumentoSoportePayerInfo,
  DocumentoSoporteBeneficiaryInfo,
} from './types/hourly';

import type {
  PayrollPeriod,
  PayrollSettlement,
} from './types/payrollPeriods';

interface Env {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_API_KEY: string;
  FIREBASE_AUTH_DOMAIN: string;
  DIAN_SOFTWARE_ID?: string;
  DIAN_SOFTWARE_PIN?: string;
}

interface Company {
  logo?: string;
  id: string;
  name: string;
  nit: string;
  dv?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  contactName?: string | null;
  legalRepresentative?: string | null;
  taxRegime?: string | null;
  economicActivity?: string | null;
  active: boolean | number;
  createdAt?: string | null;
}

interface Employee {
  id: string;
  companyId: string;
  firstName: string;
  firstName2?: string | null;
  lastName: string;
  lastName2?: string | null;
  taxId: string;
  position?: string | null;
  contractType?: string | null;
  salary: number;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  hireDate?: string | null;
  bankName?: string | null;
  bankAccountType?: string | null;
  bankAccountNumber?: string | null;
  active: boolean | number;
  createdAt?: string | null;
}

interface EmployeeLeave {
  id: string;
  employeeId: string;
  companyId: string;
  leaveType: EmployeeLeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  accumulatedDaysBefore: number;
  notes?: string | null;
  createdAt?: string | null;
}

function sendJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function normalizeCompany(row: any): Company {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    nit: String(row.nit ?? ''),
    dv: row.dv ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    department: row.department ?? null,
    postalCode: row.postalCode ?? null,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    email: row.email ?? null,
    contactName: row.contactName ?? null,
    legalRepresentative: row.legalRepresentative ?? null,
    taxRegime: row.taxRegime ?? null,
    economicActivity: row.economicActivity ?? null,
    active: !!row.active,
    createdAt: row.createdAt ?? null,
  };
}

function normalizeEmployee(row: any): Employee {
  return {
    id: String(row.id),
    companyId: String(row.companyId),
    firstName: String(row.firstName ?? ''),
    firstName2: row.firstName2 ?? null,
    lastName: String(row.lastName ?? ''),
    lastName2: row.lastName2 ?? null,
    taxId: String(row.taxId ?? ''),
    position: row.position ?? null,
    contractType: row.contractType ?? null,
    salary: Number(row.salary ?? 0),
    address: row.address ?? null,
    city: row.city ?? null,
    country: row.country ?? 'Colombia',
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    hireDate: row.hireDate ?? null,
    bankName: row.bankName ?? null,
    bankAccountType: row.bankAccountType ?? null,
    bankAccountNumber: row.bankAccountNumber ?? null,
    active: !!row.active,
    createdAt: row.createdAt ?? null,
  };
}

function normalizeEmployeeLeave(row: any): EmployeeLeave {
  return {
    id: String(row.id),
    employeeId: String(row.employeeId),
    companyId: String(row.companyId),
    leaveType: row.leaveType as EmployeeLeaveType,
    startDate: String(row.startDate ?? ''),
    endDate: String(row.endDate ?? ''),
    totalDays: Number(row.totalDays ?? 0),
    accumulatedDaysBefore: Number(row.accumulatedDaysBefore ?? 0),
    notes: row.notes ?? null,
    createdAt: row.createdAt ?? null,
  };
}

function normalizeProfessional(row: any): Professional {
  return {
    id: String(row.id),
    firstName: String(row.firstName ?? ''),
    firstName2: row.firstName2 ?? null,
    lastName: String(row.lastName ?? ''),
    lastName2: row.lastName2 ?? null,
    taxId: String(row.taxId ?? ''),
    profession: String(row.profession ?? ''),
    email: row.email ?? null,
    phone: row.phone ?? null,
    city: row.city ?? null,
    bankName: row.bankName ?? null,
    bankAccountType: row.bankAccountType ?? null,
    bankAccountNumber: row.bankAccountNumber ?? null,
    active: !!row.active,
    createdAt: row.createdAt ?? null,
  };
}

function normalizePublicProfessional(row: any) {
  return {
    id: String(row.id),
    firstName: String(row.firstName ?? ''),
    lastName: String(row.lastName ?? ''),
    profession: String(row.profession ?? ''),
    city: row.city ?? null,
  };
}

function normalizeEngagement(row: any): Engagement {
  return {
    id: String(row.id),
    professionalId: String(row.professionalId),
    companyId: String(row.companyId),
    vinculationType: row.vinculationType as VinculationType,
    hourlyRate: Number(row.hourlyRate ?? 0),
    startDate: String(row.startDate ?? ''),
    endDate: row.endDate ?? null,
    active: !!row.active,
    retentionConcept: (row.retentionConcept as RetentionConcept) ?? null,
    isIncomeTaxFiler:
      row.isIncomeTaxFiler === null || row.isIncomeTaxFiler === undefined
        ? null
        : !!row.isIncomeTaxFiler,
    deliverableDescription: row.deliverableDescription ?? null,
    weeklyHours:
      row.weeklyHours === null || row.weeklyHours === undefined
        ? null
        : Number(row.weeklyHours),
    contractType: row.contractType ?? null,
    createdAt: row.createdAt ?? null,
  };
}

function normalizePayrollPeriod(row: any): PayrollPeriod {
  return {
    id: String(row.id),
    companyId: String(row.companyId),
    periodStart: String(row.periodStart ?? ''),
    periodEnd: String(row.periodEnd ?? ''),
    status: row.status === 'CLOSED' ? 'CLOSED' : 'DRAFT',
    createdAt: row.createdAt ?? null,
    closedAt: row.closedAt ?? null,
  };
}

function normalizePayrollSettlement(row: any): PayrollSettlement {
  return {
    id: String(row.id),
    periodId: String(row.periodId),
    employeeId: String(row.employeeId),
    companyId: String(row.companyId),
    daysWorked: Number(row.daysWorked ?? 0),
    extraDiurna: Number(row.extraDiurna ?? 0),
    extraNocturna: Number(row.extraNocturna ?? 0),
    recargoNocturno: Number(row.recargoNocturno ?? 0),
    grossEarnings: Number(row.grossEarnings ?? 0),
    totalDeductions: Number(row.totalDeductions ?? 0),
    netPay: Number(row.netPay ?? 0),
    dianStatus: row.dianStatus === 'GENERATED' ? 'GENERATED' : 'PENDING',
    dianConsecutive:
      row.dianConsecutive === null || row.dianConsecutive === undefined
        ? null
        : Number(row.dianConsecutive),
    dianCune: row.dianCune ?? null,
    dianGeneratedAt: row.dianGeneratedAt ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);

    try {
      /*
       * ============================================================
       * DASHBOARD
       * ============================================================
       */

      if (
        url.pathname === '/' ||
        url.pathname === '/dashboard'
      ) {
        return new Response(
          getDashboardHtml({
            apiKey: env.FIREBASE_API_KEY,
            authDomain: env.FIREBASE_AUTH_DOMAIN,
            projectId: env.FIREBASE_PROJECT_ID,
          }),
          {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          }
        );
      }

      /*
       * ============================================================
       * AUTENTICACIÓN
       *
       * Todo lo que sigue es /api/*: exige un ID token de Firebase
       * válido y resuelve el usuario (rol + empresa) desde D1.
       * ============================================================
       */

      const user: AuthUser = await authenticate(request, env);

      if (
        url.pathname === '/api/me' &&
        request.method === 'GET'
      ) {
        return sendJson({
          success: true,
          data: user,
        });
      }

      /*
       * ============================================================
       * EMPRESAS - LISTAR
       * ============================================================
       */

      if (
        url.pathname === '/api/companies' &&
        request.method === 'GET'
      ) {
        // Un EMPLOYEE no tiene acceso a la administración de empresas.
        requireRole(user, ['TENANT_ADMIN']);

        // SUPER_ADMIN ve todas las empresas; TENANT_ADMIN sólo la suya.
        const result = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              nit,
              dv,
              address,
              city,
              department,
              postalCode,
              phone,
              whatsapp,
              email,
              contactName,
              legalRepresentative,
              taxRegime,
              economicActivity,
              logo,
              active,
              createdAt
            FROM companies
            WHERE active = 1
              AND (?1 IS NULL OR id = ?1)
            ORDER BY name ASC
          `)
          .bind(user.role === 'SUPER_ADMIN' ? null : user.companyId)
          .all();

        const companies = (result.results || []).map(
          normalizeCompany
        );

        return sendJson({
          success: true,
          data: companies,
        });
      }

      /*
       * ============================================================
       * EMPRESAS - CREAR
       * ============================================================
       */

      if (
        url.pathname === '/api/companies' &&
        request.method === 'POST'
      ) {
        // Sólo Kreadu (SUPER_ADMIN) da de alta nuevos clientes.
        requireRole(user, []);

        const body = await request.json() as any;

        const name = String(body.name || '').trim();
        const nit = String(body.nit || '').trim();

        if (!name) {
          return sendJson(
            {
              success: false,
              error: 'El nombre de la empresa es obligatorio.',
            },
            400
          );
        }

        if (!nit) {
          return sendJson(
            {
              success: false,
              error: 'El NIT de la empresa es obligatorio.',
            },
            400
          );
        }

        const id = `COMP-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO companies (
              id,
              name,
              nit,
              dv,
              address,
              city,
              department,
              postalCode,
              phone,
              whatsapp,
              email,
              contactName,
              legalRepresentative,
              taxRegime,
              economicActivity,
              logo,
              active,
              createdAt
            )
            VALUES (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
              ?10, ?11, ?12, ?13, ?14, ?15, ?16, 1, ?17
            )
          `)
          .bind(
            id,
            name,
            nit,
            body.dv || null,
            body.address || null,
            body.city || null,
            body.department || null,
            body.postalCode || null,
            body.phone || null,
            body.whatsapp || null,
            body.email || null,
            body.contactName || null,
            body.legalRepresentative || null,
            body.taxRegime || null,
            body.economicActivity || null,
            body.logo || null,
            createdAt
          )
          .run();

        const row = await env.DB
          .prepare(`
            SELECT *
            FROM companies
            WHERE id = ?1
          `)
          .bind(id)
          .first();

        await audit(env, user, 'CREATE', 'company', id, id);

        return sendJson(
          {
            success: true,
            data: normalizeCompany(row),
          },
          201
        );
      }

      /*
       * ============================================================
       * EMPRESA - EDITAR
       * ============================================================
       */

      const companyMatch =
        url.pathname.match(/^\/api\/companies\/([^/]+)$/);

      if (
        companyMatch &&
        request.method === 'PUT'
      ) {
        const companyId = decodeURIComponent(companyMatch[1]);

        // SUPER_ADMIN o el TENANT_ADMIN de esa misma empresa.
        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, companyId);

        const body = await request.json() as any;

        const existing = await env.DB
          .prepare(`
            SELECT *
            FROM companies
            WHERE id = ?1
          `)
          .bind(companyId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Empresa no encontrada.',
            },
            404
          );
        }

        const name = String(
          body.name ?? existing.name ?? ''
        ).trim();

        const nit = String(
          body.nit ?? existing.nit ?? ''
        ).trim();

        if (!name || !nit) {
          return sendJson(
            {
              success: false,
              error: 'Nombre y NIT son obligatorios.',
            },
            400
          );
        }

        await env.DB
          .prepare(`
            UPDATE companies
            SET
              name = ?1,
              nit = ?2,
              dv = ?3,
              address = ?4,
              city = ?5,
              department = ?6,
              postalCode = ?7,
              phone = ?8,
              whatsapp = ?9,
              email = ?10,
              contactName = ?11,
              legalRepresentative = ?12,
              taxRegime = ?13,
              economicActivity = ?14,
              logo = ?15
            WHERE id = ?16
          `)
          .bind(
            name,
            nit,
            body.dv ?? null,
            body.address ?? null,
            body.city ?? null,
            body.department ?? null,
            body.postalCode ?? null,
            body.phone ?? null,
            body.whatsapp ?? null,
            body.email ?? null,
            body.contactName ?? null,
            body.legalRepresentative ?? null,
            body.taxRegime ?? null,
            body.economicActivity ?? null,
            body.logo ?? existing.logo ?? null,
            companyId
          )
          .run();

        const row = await env.DB
          .prepare(`
            SELECT *
            FROM companies
            WHERE id = ?1
          `)
          .bind(companyId)
          .first();

        await audit(env, user, 'UPDATE', 'company', companyId, companyId);

        return sendJson({
          success: true,
          data: normalizeCompany(row),
        });
      }

      /*
       * ============================================================
       * EMPRESA - ELIMINAR
       * ============================================================
       */

      if (
        companyMatch &&
        request.method === 'DELETE'
      ) {
        const companyId = decodeURIComponent(companyMatch[1]);

        // Sólo Kreadu (SUPER_ADMIN) puede dar de baja a un cliente.
        requireRole(user, []);

        const existing = await env.DB
          .prepare(`
            SELECT id
            FROM companies
            WHERE id = ?1
          `)
          .bind(companyId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Empresa no encontrada.',
            },
            404
          );
        }

        await env.DB
          .prepare(`
            UPDATE companies
            SET active = 0
            WHERE id = ?1
          `)
          .bind(companyId)
          .run();

        await env.DB
          .prepare(`
            UPDATE employees
            SET active = 0
            WHERE companyId = ?1
          `)
          .bind(companyId)
          .run();

        await audit(env, user, 'DELETE', 'company', companyId, companyId);

        return sendJson({
          success: true,
          message: 'Empresa eliminada correctamente.',
        });
      }

      /*
       * ============================================================
       * EMPLEADOS - LISTAR
       * ============================================================
       */

      if (
        url.pathname === '/api/employees' &&
        request.method === 'GET'
      ) {
        const companyId = url.searchParams.get('companyId');

        if (!companyId) {
          return sendJson(
            {
              success: false,
              error: 'companyId es obligatorio.',
            },
            400
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, companyId);

        const result = await env.DB
          .prepare(`
            SELECT
              id,
              companyId,
              firstName,
              firstName2,
              lastName,
              lastName2,
              taxId,
              position,
              contractType,
              salary,
              address,
              city,
              country,
              phone,
              whatsapp,
              hireDate,
              active,
              createdAt
            FROM employees
            WHERE companyId = ?1
              AND active = 1
            ORDER BY firstName ASC, lastName ASC
          `)
          .bind(companyId)
          .all();

        const employees = (result.results || []).map(
          normalizeEmployee
        );

        return sendJson({
          success: true,
          data: employees,
        });
      }

      /*
       * ============================================================
       * EMPLEADOS - CREAR
       * ============================================================
       */

      if (
        url.pathname === '/api/employees' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const companyId = String(
          body.companyId || ''
        ).trim();

        if (!companyId) {
          return sendJson(
            {
              success: false,
              error: 'companyId es obligatorio.',
            },
            400
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, companyId);

        const company = await env.DB
          .prepare(`
            SELECT id
            FROM companies
            WHERE id = ?1
              AND active = 1
          `)
          .bind(companyId)
          .first();

        if (!company) {
          return sendJson(
            {
              success: false,
              error: 'La empresa no existe o está inactiva.',
            },
            404
          );
        }

        const firstName = String(
          body.firstName || ''
        ).trim();

        const lastName = String(
          body.lastName || ''
        ).trim();

        const taxId = String(
          body.taxId || ''
        ).trim();

        const salary = Number(body.salary);

        if (!firstName || !lastName || !taxId) {
          return sendJson(
            {
              success: false,
              error:
                'Primer nombre, primer apellido y documento son obligatorios.',
            },
            400
          );
        }

        if (!Number.isFinite(salary) || salary <= 0) {
          return sendJson(
            {
              success: false,
              error: 'El salario debe ser mayor que cero.',
            },
            400
          );
        }

        const id = `EMP-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO employees (
              id,
              companyId,
              firstName,
              firstName2,
              lastName,
              lastName2,
              taxId,
              position,
              contractType,
              salary,
              address,
              city,
              country,
              phone,
              whatsapp,
              hireDate,
              bankName,
              bankAccountType,
              bankAccountNumber,
              active,
              createdAt
            )
            VALUES (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
              ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, 1, ?19
            )
          `)
          .bind(
            id,
            companyId,
            firstName,
            body.firstName2 || null,
            lastName,
            body.lastName2 || null,
            taxId,
            body.position || null,
            body.contractType || '1',
            salary,
            body.address || null,
            body.city || null,
            body.country || 'Colombia',
            body.phone || null,
            body.whatsapp || null,
            body.hireDate || null,
            body.bankName || null,
            body.bankAccountType || null,
            body.bankAccountNumber || null,
            createdAt
          )
          .run();

        const row = await env.DB
          .prepare(`
            SELECT *
            FROM employees
            WHERE id = ?1
          `)
          .bind(id)
          .first();

        await audit(env, user, 'CREATE', 'employee', id, companyId);

        return sendJson(
          {
            success: true,
            data: normalizeEmployee(row),
          },
          201
        );
      }

      /*
       * ============================================================
       * EMPLEADO - EDITAR
       * ============================================================
       */

      const employeeMatch =
        url.pathname.match(/^\/api\/employees\/([^/]+)$/);

      if (
        employeeMatch &&
        request.method === 'PUT'
      ) {
        const employeeId =
          decodeURIComponent(employeeMatch[1]);

        const body = await request.json() as any;

        const existing = await env.DB
          .prepare(`
            SELECT *
            FROM employees
            WHERE id = ?1
          `)
          .bind(employeeId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Empleado no encontrado.',
            },
            404
          );
        }

        // El acceso se valida con la empresa REAL del empleado (en D1),
        // nunca con un companyId que llegara en el body.
        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(existing.companyId));

        const salary = Number(
          body.salary ?? existing.salary
        );

        if (!Number.isFinite(salary) || salary <= 0) {
          return sendJson(
            {
              success: false,
              error: 'El salario debe ser mayor que cero.',
            },
            400
          );
        }

        await env.DB
          .prepare(`
            UPDATE employees
            SET
              firstName = ?1,
              firstName2 = ?2,
              lastName = ?3,
              lastName2 = ?4,
              taxId = ?5,
              position = ?6,
              contractType = ?7,
              salary = ?8,
              address = ?9,
              city = ?10,
              country = ?11,
              phone = ?12,
              whatsapp = ?13,
              hireDate = ?14,
              bankName = ?15,
              bankAccountType = ?16,
              bankAccountNumber = ?17
            WHERE id = ?18
          `)
          .bind(
            String(
              body.firstName ??
              existing.firstName ??
              ''
            ).trim(),

            body.firstName2 ?? null,

            String(
              body.lastName ??
              existing.lastName ??
              ''
            ).trim(),

            body.lastName2 ?? null,

            String(
              body.taxId ??
              existing.taxId ??
              ''
            ).trim(),

            body.position ?? null,
            body.contractType ?? '1',
            salary,
            body.address ?? null,
            body.city ?? null,
            body.country ?? 'Colombia',
            body.phone ?? null,
            body.whatsapp ?? null,
            body.hireDate ?? null,
            body.bankName ?? existing.bankName ?? null,
            body.bankAccountType ?? existing.bankAccountType ?? null,
            body.bankAccountNumber ?? existing.bankAccountNumber ?? null,
            employeeId
          )
          .run();

        const row = await env.DB
          .prepare(`
            SELECT *
            FROM employees
            WHERE id = ?1
          `)
          .bind(employeeId)
          .first();

        await audit(
          env,
          user,
          'UPDATE',
          'employee',
          employeeId,
          String(existing.companyId)
        );

        return sendJson({
          success: true,
          data: normalizeEmployee(row),
        });
      }

      /*
       * ============================================================
       * EMPLEADO - ELIMINAR
       * ============================================================
       */

      if (
        employeeMatch &&
        request.method === 'DELETE'
      ) {
        const employeeId =
          decodeURIComponent(employeeMatch[1]);

        const existing = await env.DB
          .prepare(`
            SELECT id, companyId
            FROM employees
            WHERE id = ?1
              AND active = 1
          `)
          .bind(employeeId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Empleado no encontrado.',
            },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(existing.companyId));

        await env.DB
          .prepare(`
            UPDATE employees
            SET active = 0
            WHERE id = ?1
          `)
          .bind(employeeId)
          .run();

        await audit(
          env,
          user,
          'DELETE',
          'employee',
          employeeId,
          String(existing.companyId)
        );

        return sendJson({
          success: true,
          message: 'Empleado eliminado correctamente.',
        });
      }

      /*
       * ============================================================
       * INCAPACIDADES Y LICENCIAS DE MATERNIDAD/PATERNIDAD
       *
       * No se rastrea automáticamente la continuidad entre
       * incapacidades: quien registra una incapacidad general indica
       * manualmente `accumulatedDaysBefore` (ver migrations/0005).
       * ============================================================
       */

      const EMPLOYEE_LEAVE_TYPES: EmployeeLeaveType[] = [
        'GENERAL_INCAPACITY',
        'WORK_INCAPACITY',
        'MATERNITY_LEAVE',
        'PATERNITY_LEAVE',
      ];

      if (
        url.pathname === '/api/employee-leaves' &&
        request.method === 'GET'
      ) {
        const employeeId = url.searchParams.get('employeeId');

        if (!employeeId) {
          return sendJson(
            { success: false, error: 'employeeId es obligatorio.' },
            400
          );
        }

        const employeeRow = await env.DB
          .prepare(`SELECT id, companyId FROM employees WHERE id = ?1`)
          .bind(employeeId)
          .first();

        if (!employeeRow) {
          return sendJson(
            { success: false, error: 'Empleado no encontrado.' },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(employeeRow.companyId));

        const result = await env.DB
          .prepare(`
            SELECT *
            FROM employee_leaves
            WHERE employeeId = ?1
            ORDER BY startDate DESC
          `)
          .bind(employeeId)
          .all();

        const leaves = (result.results || []).map(normalizeEmployeeLeave);

        return sendJson({ success: true, data: leaves });
      }

      if (
        url.pathname === '/api/employee-leaves' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const employeeId = String(body.employeeId || '').trim();
        const leaveType = String(body.leaveType || '').trim();
        const startDate = String(body.startDate || '').trim();
        const endDate = String(body.endDate || '').trim();

        if (!employeeId || !leaveType || !startDate || !endDate) {
          return sendJson(
            {
              success: false,
              error:
                'employeeId, leaveType, startDate y endDate son obligatorios.',
            },
            400
          );
        }

        if (
          !EMPLOYEE_LEAVE_TYPES.includes(leaveType as EmployeeLeaveType)
        ) {
          return sendJson(
            {
              success: false,
              error:
                'leaveType debe ser GENERAL_INCAPACITY, WORK_INCAPACITY, ' +
                'MATERNITY_LEAVE o PATERNITY_LEAVE.',
            },
            400
          );
        }

        const employeeRow = await env.DB
          .prepare(`SELECT id, companyId FROM employees WHERE id = ?1 AND active = 1`)
          .bind(employeeId)
          .first();

        if (!employeeRow) {
          return sendJson(
            { success: false, error: 'Empleado no encontrado o inactivo.' },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(employeeRow.companyId));

        const start = new Date(`${startDate}T00:00:00Z`);
        const end = new Date(`${endDate}T00:00:00Z`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return sendJson(
            { success: false, error: 'startDate/endDate inválidas.' },
            400
          );
        }

        const totalDays =
          Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

        if (totalDays < 1) {
          return sendJson(
            {
              success: false,
              error: 'endDate debe ser igual o posterior a startDate.',
            },
            400
          );
        }

        // Sólo aplica (y sólo se persiste) para incapacidad general —
        // en el resto de tipos siempre es 0.
        const accumulatedDaysBefore =
          leaveType === 'GENERAL_INCAPACITY'
            ? Math.max(0, Number(body.accumulatedDaysBefore) || 0)
            : 0;

        const id = `LV-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO employee_leaves (
              id, employeeId, companyId, leaveType, startDate, endDate,
              totalDays, accumulatedDaysBefore, notes, createdAt
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          `)
          .bind(
            id,
            employeeId,
            String(employeeRow.companyId),
            leaveType,
            startDate,
            endDate,
            totalDays,
            accumulatedDaysBefore,
            body.notes || null,
            createdAt
          )
          .run();

        await audit(
          env,
          user,
          'CREATE',
          'employee_leave',
          id,
          String(employeeRow.companyId)
        );

        return sendJson(
          {
            success: true,
            data: {
              id,
              employeeId,
              companyId: String(employeeRow.companyId),
              leaveType,
              startDate,
              endDate,
              totalDays,
              accumulatedDaysBefore,
              notes: body.notes || null,
              createdAt,
            },
          },
          201
        );
      }

      const employeeLeaveMatch =
        url.pathname.match(/^\/api\/employee-leaves\/([^/]+)$/);

      if (
        employeeLeaveMatch &&
        request.method === 'DELETE'
      ) {
        const leaveId = decodeURIComponent(employeeLeaveMatch[1]);

        const existing = await env.DB
          .prepare(`SELECT id, companyId FROM employee_leaves WHERE id = ?1`)
          .bind(leaveId)
          .first();

        if (!existing) {
          return sendJson(
            { success: false, error: 'Incapacidad/licencia no encontrada.' },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(existing.companyId));

        await env.DB
          .prepare(`DELETE FROM employee_leaves WHERE id = ?1`)
          .bind(leaveId)
          .run();

        await audit(
          env,
          user,
          'DELETE',
          'employee_leave',
          leaveId,
          String(existing.companyId)
        );

        return sendJson({
          success: true,
          message: 'Incapacidad/licencia eliminada correctamente.',
        });
      }

      /*
       * ============================================================
       * NÓMINA PERSISTENTE — PERIODOS
       *
       * Antes de esta fase, calcular una nómina no se guardaba en
       * ningún lado y el XML de nómina electrónica siempre usaba el
       * consecutivo 1. Ahora toda liquidación vive dentro de un
       * periodo, y el consecutivo DIAN se pide con
       * getNextDianConsecutive (src/services/dianCounters.ts).
       * ============================================================
       */

      if (
        url.pathname === '/api/payroll-periods' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const companyId = String(body.companyId || '').trim();
        const periodStart = String(body.periodStart || '').trim();
        const periodEnd = String(body.periodEnd || '').trim();

        if (!companyId || !periodStart || !periodEnd) {
          return sendJson(
            {
              success: false,
              error: 'companyId, periodStart y periodEnd son obligatorios.',
            },
            400
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, companyId);

        const company = await env.DB
          .prepare(`SELECT id FROM companies WHERE id = ?1 AND active = 1`)
          .bind(companyId)
          .first();

        if (!company) {
          return sendJson(
            {
              success: false,
              error: 'La empresa no existe o está inactiva.',
            },
            404
          );
        }

        const id = `PP-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO payroll_periods (
              id, companyId, periodStart, periodEnd, status, createdAt
            )
            VALUES (?1, ?2, ?3, ?4, 'DRAFT', ?5)
          `)
          .bind(id, companyId, periodStart, periodEnd, createdAt)
          .run();

        await audit(env, user, 'CREATE', 'payroll_period', id, companyId);

        return sendJson(
          {
            success: true,
            data: {
              id,
              companyId,
              periodStart,
              periodEnd,
              status: 'DRAFT',
              createdAt,
            },
          },
          201
        );
      }

      if (
        url.pathname === '/api/payroll-periods' &&
        request.method === 'GET'
      ) {
        const companyId = url.searchParams.get('companyId');

        if (!companyId) {
          return sendJson(
            {
              success: false,
              error: 'companyId es obligatorio.',
            },
            400
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, companyId);

        const result = await env.DB
          .prepare(`
            SELECT *
            FROM payroll_periods
            WHERE companyId = ?1
            ORDER BY periodStart DESC
          `)
          .bind(companyId)
          .all();

        return sendJson({
          success: true,
          data: (result.results || []).map(normalizePayrollPeriod),
        });
      }

      const periodCloseMatch = url.pathname.match(
        /^\/api\/payroll-periods\/([^/]+)\/close$/
      );

      if (
        periodCloseMatch &&
        request.method === 'POST'
      ) {
        const periodId = decodeURIComponent(periodCloseMatch[1]);

        const periodRow = await env.DB
          .prepare(`SELECT * FROM payroll_periods WHERE id = ?1`)
          .bind(periodId)
          .first();

        if (!periodRow) {
          return sendJson(
            { success: false, error: 'Periodo no encontrado.' },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(periodRow.companyId));

        if (periodRow.status === 'CLOSED') {
          return sendJson(
            { success: false, error: 'El periodo ya está cerrado.' },
            400
          );
        }

        const totals = await env.DB
          .prepare(`
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN dianStatus != 'GENERATED' THEN 1 ELSE 0 END) AS pending
            FROM payroll_settlements
            WHERE periodId = ?1
          `)
          .bind(periodId)
          .first();

        const total = Number((totals as any)?.total ?? 0);
        const pending = Number((totals as any)?.pending ?? 0);

        if (total === 0) {
          return sendJson(
            {
              success: false,
              error: 'El periodo no tiene liquidaciones todavía.',
            },
            400
          );
        }

        if (pending > 0) {
          return sendJson(
            {
              success: false,
              error:
                `Faltan ${pending} liquidación(es) por generar su XML DIAN ` +
                'antes de poder cerrar el periodo.',
            },
            400
          );
        }

        const closedAt = new Date().toISOString();

        await env.DB
          .prepare(`
            UPDATE payroll_periods
            SET status = 'CLOSED', closedAt = ?1
            WHERE id = ?2
          `)
          .bind(closedAt, periodId)
          .run();

        await audit(
          env,
          user,
          'UPDATE',
          'payroll_period',
          periodId,
          String(periodRow.companyId)
        );

        return sendJson({
          success: true,
          message: 'Periodo cerrado correctamente.',
        });
      }

      /*
       * ============================================================
       * NÓMINA PERSISTENTE — LIQUIDACIONES
       * ============================================================
       */

      if (
        url.pathname === '/api/payroll-settlements' &&
        request.method === 'GET'
      ) {
        const periodId = url.searchParams.get('periodId');

        if (!periodId) {
          return sendJson(
            { success: false, error: 'periodId es obligatorio.' },
            400
          );
        }

        const periodRow = await env.DB
          .prepare(`SELECT companyId FROM payroll_periods WHERE id = ?1`)
          .bind(periodId)
          .first();

        if (!periodRow) {
          return sendJson(
            { success: false, error: 'Periodo no encontrado.' },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(periodRow.companyId));

        const result = await env.DB
          .prepare(`
            SELECT
              s.*,
              e.firstName AS e_firstName,
              e.firstName2 AS e_firstName2,
              e.lastName AS e_lastName,
              e.lastName2 AS e_lastName2,
              e.taxId AS e_taxId
            FROM payroll_settlements s
            JOIN employees e ON e.id = s.employeeId
            WHERE s.periodId = ?1
            ORDER BY e.firstName ASC, e.lastName ASC
          `)
          .bind(periodId)
          .all();

        const data = (result.results || []).map((row: any) => {
          let calculation: ColombiaPayrollResult | null = null;

          try {
            calculation = JSON.parse(String(row.resultJson));
          } catch {
            calculation = null;
          }

          return {
            ...normalizePayrollSettlement(row),
            // El cálculo completo y el XML se incluyen aquí (y no en
            // el tipo compartido PayrollSettlement) para poder
            // mostrar el detalle desde el dashboard sin un endpoint
            // de detalle aparte; el volumen por periodo es pequeño.
            calculation,
            dianXmlContent: row.dianXmlContent ?? null,
            employee: {
              firstName: row.e_firstName,
              firstName2: row.e_firstName2,
              lastName: row.e_lastName,
              lastName2: row.e_lastName2,
              taxId: row.e_taxId,
            },
          };
        });

        return sendJson({ success: true, data });
      }

      if (
        url.pathname === '/api/payroll-settlements/calculate' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const periodId = String(body.periodId || '').trim();
        const employeeId = String(body.employeeId || '').trim();

        if (!periodId || !employeeId) {
          return sendJson(
            {
              success: false,
              error: 'periodId y employeeId son obligatorios.',
            },
            400
          );
        }

        const periodRow = await env.DB
          .prepare(`SELECT * FROM payroll_periods WHERE id = ?1`)
          .bind(periodId)
          .first();

        if (!periodRow) {
          return sendJson(
            { success: false, error: 'Periodo no encontrado.' },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(periodRow.companyId));

        if (periodRow.status !== 'DRAFT') {
          return sendJson(
            {
              success: false,
              error:
                'El periodo está cerrado; no se pueden calcular más liquidaciones.',
            },
            400
          );
        }

        const employeeRow = await env.DB
          .prepare(`SELECT * FROM employees WHERE id = ?1 AND active = 1`)
          .bind(employeeId)
          .first();

        if (!employeeRow) {
          return sendJson(
            {
              success: false,
              error: 'Empleado no encontrado o inactivo.',
            },
            404
          );
        }

        const employee = normalizeEmployee(employeeRow);

        if (employee.companyId !== String(periodRow.companyId)) {
          return sendJson(
            {
              success: false,
              error: 'El empleado no pertenece a la empresa del periodo.',
            },
            400
          );
        }

        const existing = await env.DB
          .prepare(`
            SELECT id, dianStatus
            FROM payroll_settlements
            WHERE periodId = ?1
              AND employeeId = ?2
          `)
          .bind(periodId, employeeId)
          .first();

        if (existing && (existing as any).dianStatus === 'GENERATED') {
          return sendJson(
            {
              success: false,
              error:
                'Esta liquidación ya tiene un XML DIAN generado y no se ' +
                'puede recalcular.',
            },
            400
          );
        }

        const daysWorked = Number(body.daysWorked ?? 30);

        if (
          !Number.isFinite(daysWorked) ||
          daysWorked < 1 ||
          daysWorked > 30
        ) {
          return sendJson(
            {
              success: false,
              error: 'Los días trabajados deben estar entre 1 y 30.',
            },
            400
          );
        }

        // Incapacidades/licencias que se solapen con el periodo: se
        // detectan aquí (no las elige el frontend), y `daysWorked` del
        // body son siempre los días NORMALES — el backend nunca los
        // sobreescribe, sólo valida que quepan junto con la licencia
        // dentro del mes.
        const overlappingLeavesResult = await env.DB
          .prepare(`
            SELECT *
            FROM employee_leaves
            WHERE employeeId = ?1
              AND startDate <= ?2
              AND endDate >= ?3
          `)
          .bind(employeeId, String(periodRow.periodEnd), String(periodRow.periodStart))
          .all();

        const overlappingLeaves = overlappingLeavesResult.results || [];

        if (overlappingLeaves.length > 1) {
          return sendJson(
            {
              success: false,
              error:
                'Hay más de una incapacidad/licencia solapando este ' +
                'periodo; liquídalas en periodos separados.',
            },
            400
          );
        }

        let leave: EmployeeLeaveInput | undefined;

        if (overlappingLeaves.length === 1) {
          const leaveRow = normalizeEmployeeLeave(overlappingLeaves[0]);

          // Ya sabemos que se solapan (la consulta SQL lo garantiza),
          // así que la intersección nunca es null aquí.
          const intersection = intersectDateRanges(
            leaveRow.startDate,
            leaveRow.endDate,
            String(periodRow.periodStart),
            String(periodRow.periodEnd)
          )!;

          const daysInPeriod = intersection.days;

          if (daysWorked + daysInPeriod > 30) {
            return sendJson(
              {
                success: false,
                error:
                  'Días trabajados + días de incapacidad/licencia no ' +
                  'pueden superar 30.',
              },
              400
            );
          }

          leave = {
            type: leaveRow.leaveType,
            daysInPeriod,
            accumulatedDaysBefore:
              leaveRow.leaveType === 'GENERAL_INCAPACITY'
                ? leaveRow.accumulatedDaysBefore
                : undefined,
          };
        }

        const overtimeHours = body.overtimeHours || {};

        const extraDiurna = Number(overtimeHours.extraDiurna ?? 0);
        const extraNocturna = Number(overtimeHours.extraNocturna ?? 0);
        const recargoNocturno = Number(overtimeHours.recargoNocturno ?? 0);
        const horasDominicalFestivo = Number(body.horasDominicalFestivo ?? 0);
        const horasExtraDominicalFestivo = Number(
          body.horasExtraDominicalFestivo ?? 0
        );

        if (
          !Number.isFinite(extraDiurna) ||
          !Number.isFinite(extraNocturna) ||
          !Number.isFinite(recargoNocturno) ||
          !Number.isFinite(horasDominicalFestivo) ||
          !Number.isFinite(horasExtraDominicalFestivo) ||
          extraDiurna < 0 ||
          extraNocturna < 0 ||
          recargoNocturno < 0 ||
          horasDominicalFestivo < 0 ||
          horasExtraDominicalFestivo < 0
        ) {
          return sendJson(
            {
              success: false,
              error: 'Las horas extras y recargos deben ser valores válidos.',
            },
            400
          );
        }

        const payrollInput: ColombiaPayrollInput = {
          companyId: employee.companyId,
          employeeId: employee.id,

          firstName: employee.firstName,
          firstName2: employee.firstName2 || undefined,

          lastName: employee.lastName,
          lastName2: employee.lastName2 || undefined,

          taxId: employee.taxId,

          baseSalaryMonthly: employee.salary,

          daysWorked,

          extraDiurna,
          extraNocturna,
          recargoNocturno,
          horasDominicalFestivo,
          horasExtraDominicalFestivo,
          isIntegralSalary: !!body.isIntegralSalary,

          leave,

          overtimeHours: {
            extraDiurna,
            extraNocturna,
            recargoNocturno,
          },
        };

        let payrollResult: ColombiaPayrollResult;

        try {
          payrollResult = ColombiaPayrollEngine.calculate(payrollInput);
        } catch (engineError) {
          if (engineError instanceof ColombiaPayrollEngineError) {
            return sendJson(
              { success: false, error: engineError.message },
              400
            );
          }

          throw engineError;
        }

        const now = new Date().toISOString();
        const settlementId = existing
          ? String((existing as any).id)
          : `PS-${crypto.randomUUID()}`;

        if (existing) {
          await env.DB
            .prepare(`
              UPDATE payroll_settlements
              SET
                daysWorked = ?1,
                extraDiurna = ?2,
                extraNocturna = ?3,
                recargoNocturno = ?4,
                grossEarnings = ?5,
                totalDeductions = ?6,
                netPay = ?7,
                resultJson = ?8,
                updatedAt = ?9
              WHERE id = ?10
            `)
            .bind(
              daysWorked,
              extraDiurna,
              extraNocturna,
              recargoNocturno,
              payrollResult.grossEarnings,
              payrollResult.employeeDeductions.totalDeductions,
              payrollResult.netPay,
              JSON.stringify(payrollResult),
              now,
              settlementId
            )
            .run();
        } else {
          await env.DB
            .prepare(`
              INSERT INTO payroll_settlements (
                id, periodId, employeeId, companyId, daysWorked,
                extraDiurna, extraNocturna, recargoNocturno,
                grossEarnings, totalDeductions, netPay, resultJson,
                dianStatus, createdAt, updatedAt
              )
              VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                'PENDING', ?13, ?13
              )
            `)
            .bind(
              settlementId,
              periodId,
              employeeId,
              employee.companyId,
              daysWorked,
              extraDiurna,
              extraNocturna,
              recargoNocturno,
              payrollResult.grossEarnings,
              payrollResult.employeeDeductions.totalDeductions,
              payrollResult.netPay,
              JSON.stringify(payrollResult),
              now
            )
            .run();
        }

        await audit(
          env,
          user,
          existing ? 'UPDATE' : 'CREATE',
          'payroll_settlement',
          settlementId,
          employee.companyId
        );

        return sendJson(
          {
            success: true,
            data: {
              id: settlementId,
              periodId,
              employeeId,
              dianStatus: 'PENDING',
              calculation: payrollResult,
            },
          },
          existing ? 200 : 201
        );
      }

      const settlementXmlMatch = url.pathname.match(
        /^\/api\/payroll-settlements\/([^/]+)\/generate-xml$/
      );

      if (
        settlementXmlMatch &&
        request.method === 'POST'
      ) {
        const settlementId = decodeURIComponent(settlementXmlMatch[1]);

        const settlementRow = await env.DB
          .prepare(`SELECT * FROM payroll_settlements WHERE id = ?1`)
          .bind(settlementId)
          .first();

        if (!settlementRow) {
          return sendJson(
            { success: false, error: 'Liquidación no encontrada.' },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(settlementRow.companyId));

        if ((settlementRow as any).dianStatus === 'GENERATED') {
          return sendJson(
            {
              success: false,
              error: 'Esta liquidación ya tiene un XML DIAN generado.',
            },
            400
          );
        }

        // El NIT, la razón social y las credenciales de software NUNCA
        // se toman del body: se resuelven en el servidor a partir de
        // la empresa dueña de la liquidación y de la configuración del
        // Worker, para que no puedan falsificarse desde el navegador.
        const companyRow = await env.DB
          .prepare(`
            SELECT nit, dv, name
            FROM companies
            WHERE id = ?1
              AND active = 1
          `)
          .bind(settlementRow.companyId)
          .first();

        if (!companyRow) {
          return sendJson(
            { success: false, error: 'Empresa no encontrada o inactiva.' },
            404
          );
        }

        const employerInfo: DianEmployerInfo = {
          nit: String(companyRow.nit || ''),
          dv: String(companyRow.dv || '0'),
          companyName: String(companyRow.name || ''),
          softwareId: env.DIAN_SOFTWARE_ID || 'SOFT-KREADU-2026',
          pinSoftware: env.DIAN_SOFTWARE_PIN || '12345',
        };

        if (!employerInfo.nit || !employerInfo.companyName) {
          return sendJson(
            {
              success: false,
              error: 'La empresa no tiene NIT o razón social configurados.',
            },
            400
          );
        }

        const body = await request.json().catch(() => ({})) as any;
        const employeeExtraInput = body?.employeeExtra || {};

        const employeeExtra: DianEmployeeExtraInfo = {
          typeDocument: employeeExtraInput.typeDocument || '13',
          typeContract: employeeExtraInput.typeContract || '1',

          /*
           * 42 = transferencia bancaria.
           * El servicio DIAN preparado acepta 10, 42 o 20.
           */
          paymentMethod: employeeExtraInput.paymentMethod || '42',

          bankName: employeeExtraInput.bankName || undefined,
          accountNumber: employeeExtraInput.accountNumber || undefined,
          accountType: employeeExtraInput.accountType || undefined,
        };

        const payrollResult: ColombiaPayrollResult = JSON.parse(
          String((settlementRow as any).resultJson)
        );

        const consecutiveNumber = await getNextDianConsecutive(
          env.DB,
          String(settlementRow.companyId),
          'NOMINA'
        );

        const xmlResult = await DianNominaXmlService.generateDSPNE(
          payrollResult,
          employerInfo,
          employeeExtra,
          consecutiveNumber
        );

        const now = new Date().toISOString();

        await env.DB
          .prepare(`
            UPDATE payroll_settlements
            SET
              dianStatus = 'GENERATED',
              dianConsecutive = ?1,
              dianCune = ?2,
              dianXmlContent = ?3,
              dianGeneratedAt = ?4,
              updatedAt = ?4
            WHERE id = ?5
          `)
          .bind(
            consecutiveNumber,
            xmlResult.cune,
            xmlResult.xmlContent,
            now,
            settlementId
          )
          .run();

        await audit(
          env,
          user,
          'UPDATE',
          'payroll_settlement',
          settlementId,
          String(settlementRow.companyId)
        );

        return sendJson({ success: true, data: xmlResult });
      }

      /*
       * ============================================================
       * NÓMINA PERSISTENTE — ARCHIVO BANCARIO DEL PERIODO
       * ============================================================
       */

      const periodBankMatch = url.pathname.match(
        /^\/api\/payroll-periods\/([^/]+)\/bank-disbursement$/
      );

      if (
        periodBankMatch &&
        request.method === 'POST'
      ) {
        const periodId = decodeURIComponent(periodBankMatch[1]);

        const periodRow = await env.DB
          .prepare(`SELECT companyId FROM payroll_periods WHERE id = ?1`)
          .bind(periodId)
          .first();

        if (!periodRow) {
          return sendJson(
            { success: false, error: 'Periodo no encontrado.' },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(periodRow.companyId));

        const result = await env.DB
          .prepare(`
            SELECT
              s.resultJson,
              e.id AS employeeId,
              e.bankName,
              e.bankAccountType,
              e.bankAccountNumber,
              e.taxId
            FROM payroll_settlements s
            JOIN employees e ON e.id = s.employeeId
            WHERE s.periodId = ?1
              AND s.dianStatus = 'GENERATED'
          `)
          .bind(periodId)
          .all();

        const rows = result.results || [];

        if (rows.length === 0) {
          return sendJson(
            {
              success: false,
              error:
                'El periodo no tiene liquidaciones con XML DIAN generado.',
            },
            400
          );
        }

        const payrolls: ColombiaPayrollResult[] = [];
        const employeesMap = new Map<string, any>();

        for (const row of rows as any[]) {
          const payrollResult: ColombiaPayrollResult = JSON.parse(
            String(row.resultJson)
          );

          payrolls.push(payrollResult);

          employeesMap.set(String(row.employeeId), {
            bankCode: row.bankName || 'N/A',
            bankAccount: row.bankAccountNumber || 'N/A',
            taxId: row.taxId || 'N/A',
          });
        }

        const csv = BankDisbursementService.generateCSV(
          payrolls,
          employeesMap
        );

        return sendJson({ success: true, data: csv });
      }

      /*
       * ============================================================
       * PERSONAL POR HORAS — PROFESIONALES (bolsa compartida)
       * ============================================================
       */

      if (
        url.pathname === '/api/professionals' &&
        request.method === 'GET'
      ) {
        requireRole(user, ['TENANT_ADMIN']);

        const q = (url.searchParams.get('q') || '').trim();
        const likeParam = `%${q}%`;

        const result = await env.DB
          .prepare(`
            SELECT *
            FROM professionals
            WHERE active = 1
              AND (?1 = '' OR firstName LIKE ?2 OR lastName LIKE ?2 OR profession LIKE ?2)
            ORDER BY firstName ASC, lastName ASC
            LIMIT 50
          `)
          .bind(q, likeParam)
          .all();

        const rows = result.results || [];

        if (user.role === 'SUPER_ADMIN') {
          return sendJson({
            success: true,
            data: rows.map(normalizeProfessional),
          });
        }

        // TENANT_ADMIN: sólo se revelan datos de contacto de los
        // profesionales con los que ya existe un engagement propio.
        const ids = rows.map((row: any) => String(row.id));
        const ownIds = new Set<string>();

        if (ids.length > 0) {
          const placeholders = ids
            .map((_, index) => `?${index + 2}`)
            .join(', ');

          const owned = await env.DB
            .prepare(`
              SELECT DISTINCT professionalId
              FROM engagements
              WHERE companyId = ?1
                AND professionalId IN (${placeholders})
            `)
            .bind(user.companyId, ...ids)
            .all();

          for (const row of owned.results || []) {
            ownIds.add(String((row as any).professionalId));
          }
        }

        const data = rows.map((row: any) =>
          ownIds.has(String(row.id))
            ? normalizeProfessional(row)
            : normalizePublicProfessional(row)
        );

        return sendJson({ success: true, data });
      }

      if (
        url.pathname === '/api/professionals' &&
        request.method === 'POST'
      ) {
        requireRole(user, ['TENANT_ADMIN']);

        const body = await request.json() as any;

        const firstName = String(body.firstName || '').trim();
        const lastName = String(body.lastName || '').trim();
        const taxId = String(body.taxId || '').trim();
        const profession = String(body.profession || '').trim();

        if (!firstName || !lastName || !taxId || !profession) {
          return sendJson(
            {
              success: false,
              error:
                'Primer nombre, primer apellido, documento y profesión son obligatorios.',
            },
            400
          );
        }

        const id = `PRO-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        try {
          await env.DB
            .prepare(`
              INSERT INTO professionals (
                id, firstName, firstName2, lastName, lastName2, taxId,
                profession, email, phone, city, bankName,
                bankAccountType, bankAccountNumber, active, createdAt
              )
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 1, ?14)
            `)
            .bind(
              id,
              firstName,
              body.firstName2 || null,
              lastName,
              body.lastName2 || null,
              taxId,
              profession,
              body.email || null,
              body.phone || null,
              body.city || null,
              body.bankName || null,
              body.bankAccountType || null,
              body.bankAccountNumber || null,
              createdAt
            )
            .run();
        } catch {
          return sendJson(
            {
              success: false,
              error: 'Ya existe un profesional con ese documento.',
            },
            409
          );
        }

        const row = await env.DB
          .prepare(`SELECT * FROM professionals WHERE id = ?1`)
          .bind(id)
          .first();

        await audit(env, user, 'CREATE', 'professional', id, null);

        return sendJson(
          { success: true, data: normalizeProfessional(row) },
          201
        );
      }

      /*
       * ============================================================
       * PERSONAL POR HORAS — VINCULACIONES (engagements)
       * ============================================================
       */

      if (
        url.pathname === '/api/engagements' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const companyId = String(body.companyId || '').trim();
        const professionalId = String(body.professionalId || '').trim();
        const vinculationType = body.vinculationType as VinculationType;

        if (!companyId || !professionalId) {
          return sendJson(
            {
              success: false,
              error: 'companyId y professionalId son obligatorios.',
            },
            400
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, companyId);

        if (vinculationType === 'EST_MISSION') {
          return sendJson(
            {
              success: false,
              error:
                'La modalidad de Empresa de Servicios Temporales no está ' +
                'disponible: requiere autorización del Ministerio del Trabajo.',
            },
            400
          );
        }

        if (
          vinculationType !== 'INDEPENDENT_SERVICES' &&
          vinculationType !== 'PART_TIME_EMPLOYEE'
        ) {
          return sendJson(
            {
              success: false,
              error: 'vinculationType no es válido.',
            },
            400
          );
        }

        const professional = await env.DB
          .prepare(`SELECT id FROM professionals WHERE id = ?1 AND active = 1`)
          .bind(professionalId)
          .first();

        if (!professional) {
          return sendJson(
            {
              success: false,
              error: 'El profesional no existe o está inactivo.',
            },
            404
          );
        }

        const company = await env.DB
          .prepare(`SELECT id FROM companies WHERE id = ?1 AND active = 1`)
          .bind(companyId)
          .first();

        if (!company) {
          return sendJson(
            {
              success: false,
              error: 'La empresa no existe o está inactiva.',
            },
            404
          );
        }

        const hourlyRate = Number(body.hourlyRate);
        const startDate = String(body.startDate || '').trim();

        if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
          return sendJson(
            {
              success: false,
              error: 'La tarifa por hora debe ser mayor que cero.',
            },
            400
          );
        }

        if (!startDate) {
          return sendJson(
            {
              success: false,
              error: 'La fecha de inicio es obligatoria.',
            },
            400
          );
        }

        let retentionConcept: RetentionConcept | null = null;
        let isIncomeTaxFiler: boolean | null = null;
        let deliverableDescription: string | null = null;
        let weeklyHours: number | null = null;
        let contractType: string | null = null;

        if (vinculationType === 'INDEPENDENT_SERVICES') {
          retentionConcept = body.retentionConcept as RetentionConcept;

          if (
            retentionConcept !== 'SERVICIOS' &&
            retentionConcept !== 'HONORARIOS'
          ) {
            return sendJson(
              {
                success: false,
                error:
                  "retentionConcept debe ser 'SERVICIOS' u 'HONORARIOS'.",
              },
              400
            );
          }

          isIncomeTaxFiler = !!body.isIncomeTaxFiler;
          deliverableDescription = String(
            body.deliverableDescription || ''
          ).trim();

          if (!deliverableDescription) {
            return sendJson(
              {
                success: false,
                error:
                  'Describe el objeto/entregable del contrato: es lo que ' +
                  'sustenta la autonomía del contratista frente a un posible ' +
                  'reclamo de "contrato realidad".',
              },
              400
            );
          }
        } else {
          weeklyHours = Number(body.weeklyHours);

          if (
            !Number.isFinite(weeklyHours) ||
            weeklyHours <= 0 ||
            weeklyHours > CONSTANTS_2026.LEGAL_WEEKLY_HOURS
          ) {
            return sendJson(
              {
                success: false,
                error:
                  `Las horas semanales deben estar entre 1 y ` +
                  `${CONSTANTS_2026.LEGAL_WEEKLY_HOURS} (jornada máxima legal).`,
              },
              400
            );
          }

          if (hourlyRate < MIN_HOURLY_WAGE) {
            return sendJson(
              {
                success: false,
                error: `La tarifa por hora no puede ser menor al salario mínimo legal por hora ($${MIN_HOURLY_WAGE.toFixed(2)}).`,
              },
              400
            );
          }

          contractType = body.contractType || '1';
        }

        const id = `ENG-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO engagements (
              id, professionalId, companyId, vinculationType, hourlyRate,
              startDate, endDate, active, retentionConcept,
              isIncomeTaxFiler, deliverableDescription, weeklyHours,
              contractType, createdAt
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?10, ?11, ?12, ?13)
          `)
          .bind(
            id,
            professionalId,
            companyId,
            vinculationType,
            hourlyRate,
            startDate,
            body.endDate || null,
            retentionConcept,
            isIncomeTaxFiler === null ? null : (isIncomeTaxFiler ? 1 : 0),
            deliverableDescription,
            weeklyHours,
            contractType,
            createdAt
          )
          .run();

        const row = await env.DB
          .prepare(`SELECT * FROM engagements WHERE id = ?1`)
          .bind(id)
          .first();

        await audit(env, user, 'CREATE', 'engagement', id, companyId);

        return sendJson(
          { success: true, data: normalizeEngagement(row) },
          201
        );
      }

      if (
        url.pathname === '/api/engagements' &&
        request.method === 'GET'
      ) {
        const companyId = url.searchParams.get('companyId');

        if (!companyId) {
          return sendJson(
            {
              success: false,
              error: 'companyId es obligatorio.',
            },
            400
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, companyId);

        const result = await env.DB
          .prepare(`
            SELECT
              e.*,
              p.firstName AS p_firstName,
              p.firstName2 AS p_firstName2,
              p.lastName AS p_lastName,
              p.lastName2 AS p_lastName2,
              p.profession AS p_profession,
              p.taxId AS p_taxId
            FROM engagements e
            JOIN professionals p ON p.id = e.professionalId
            WHERE e.companyId = ?1
              AND e.active = 1
            ORDER BY p.firstName ASC, p.lastName ASC
          `)
          .bind(companyId)
          .all();

        const data = (result.results || []).map((row: any) => ({
          ...normalizeEngagement(row),
          professional: {
            firstName: row.p_firstName,
            firstName2: row.p_firstName2,
            lastName: row.p_lastName,
            lastName2: row.p_lastName2,
            profession: row.p_profession,
            taxId: row.p_taxId,
          },
        }));

        return sendJson({ success: true, data });
      }

      const engagementMatch =
        url.pathname.match(/^\/api\/engagements\/([^/]+)$/);

      if (
        engagementMatch &&
        request.method === 'PUT'
      ) {
        const engagementId = decodeURIComponent(engagementMatch[1]);
        const body = await request.json() as any;

        const existing = await env.DB
          .prepare(`SELECT * FROM engagements WHERE id = ?1`)
          .bind(engagementId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Vinculación no encontrada.',
            },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(existing.companyId));

        const hourlyRate = Number(body.hourlyRate ?? existing.hourlyRate);

        if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
          return sendJson(
            {
              success: false,
              error: 'La tarifa por hora debe ser mayor que cero.',
            },
            400
          );
        }

        // vinculationType, professionalId y companyId son inmutables:
        // un cambio de modalidad o de empresa debe ser una vinculación
        // nueva, no una edición, para no perder el rastro legal.
        await env.DB
          .prepare(`
            UPDATE engagements
            SET
              hourlyRate = ?1,
              endDate = ?2,
              active = ?3,
              weeklyHours = ?4,
              deliverableDescription = ?5
            WHERE id = ?6
          `)
          .bind(
            hourlyRate,
            body.endDate ?? existing.endDate ?? null,
            body.active === undefined ? existing.active : (body.active ? 1 : 0),
            body.weeklyHours ?? existing.weeklyHours ?? null,
            body.deliverableDescription ?? existing.deliverableDescription ?? null,
            engagementId
          )
          .run();

        const row = await env.DB
          .prepare(`SELECT * FROM engagements WHERE id = ?1`)
          .bind(engagementId)
          .first();

        await audit(
          env,
          user,
          'UPDATE',
          'engagement',
          engagementId,
          String(existing.companyId)
        );

        return sendJson({ success: true, data: normalizeEngagement(row) });
      }

      if (
        engagementMatch &&
        request.method === 'DELETE'
      ) {
        const engagementId = decodeURIComponent(engagementMatch[1]);

        const existing = await env.DB
          .prepare(`SELECT id, companyId FROM engagements WHERE id = ?1 AND active = 1`)
          .bind(engagementId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Vinculación no encontrada.',
            },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(existing.companyId));

        await env.DB
          .prepare(`UPDATE engagements SET active = 0 WHERE id = ?1`)
          .bind(engagementId)
          .run();

        await audit(
          env,
          user,
          'DELETE',
          'engagement',
          engagementId,
          String(existing.companyId)
        );

        return sendJson({
          success: true,
          message: 'Vinculación finalizada correctamente.',
        });
      }

      /*
       * ============================================================
       * PERSONAL POR HORAS — REGISTRO DE HORAS
       * ============================================================
       */

      if (
        url.pathname === '/api/time-entries' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const engagementId = String(body.engagementId || '').trim();
        const periodStart = String(body.periodStart || '').trim();
        const periodEnd = String(body.periodEnd || '').trim();
        const hours = Number(body.hours);

        if (!engagementId || !periodStart || !periodEnd) {
          return sendJson(
            {
              success: false,
              error: 'engagementId, periodStart y periodEnd son obligatorios.',
            },
            400
          );
        }

        if (!Number.isFinite(hours) || hours <= 0) {
          return sendJson(
            {
              success: false,
              error: 'Las horas deben ser mayores que cero.',
            },
            400
          );
        }

        const engagement = await env.DB
          .prepare(`SELECT id, companyId FROM engagements WHERE id = ?1 AND active = 1`)
          .bind(engagementId)
          .first();

        if (!engagement) {
          return sendJson(
            {
              success: false,
              error: 'Vinculación no encontrada o inactiva.',
            },
            404
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(engagement.companyId));

        const id = `TE-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO time_entries (
              id, engagementId, periodStart, periodEnd, hours, notes, createdAt
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          `)
          .bind(
            id,
            engagementId,
            periodStart,
            periodEnd,
            hours,
            body.notes || null,
            createdAt
          )
          .run();

        await audit(
          env,
          user,
          'CREATE',
          'time_entry',
          id,
          String(engagement.companyId)
        );

        return sendJson(
          {
            success: true,
            data: {
              id,
              engagementId,
              periodStart,
              periodEnd,
              hours,
              notes: body.notes || null,
              createdAt,
            },
          },
          201
        );
      }

      /*
       * ============================================================
       * PERSONAL POR HORAS — VERIFICACIÓN PILA (contratistas)
       *
       * Materializa el deber legal del contratante de verificar el
       * pago de aportes a seguridad social del independiente antes
       * de pagarle (Ley 1955/2019 art. 244).
       * ============================================================
       */

      if (
        url.pathname === '/api/pila-verifications' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const engagementId = String(body.engagementId || '').trim();
        const period = String(body.period || '').trim();
        const declaredIbc = Number(body.declaredIbc);

        if (!engagementId || !/^\d{4}-\d{2}$/.test(period)) {
          return sendJson(
            {
              success: false,
              error: "engagementId y period ('YYYY-MM') son obligatorios.",
            },
            400
          );
        }

        if (!Number.isFinite(declaredIbc) || declaredIbc <= 0) {
          return sendJson(
            {
              success: false,
              error: 'El IBC declarado debe ser mayor que cero.',
            },
            400
          );
        }

        const engagement = await env.DB
          .prepare(`
            SELECT id, companyId, vinculationType
            FROM engagements
            WHERE id = ?1
              AND active = 1
          `)
          .bind(engagementId)
          .first();

        if (!engagement) {
          return sendJson(
            {
              success: false,
              error: 'Vinculación no encontrada o inactiva.',
            },
            404
          );
        }

        if (engagement.vinculationType !== 'INDEPENDENT_SERVICES') {
          return sendJson(
            {
              success: false,
              error:
                'La verificación de PILA sólo aplica a contratistas independientes.',
            },
            400
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, String(engagement.companyId));

        const id = `PILA-${crypto.randomUUID()}`;
        const now = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO pila_verifications (
              id, engagementId, period, declaredIbc, verified,
              verifiedBy, verifiedAt, planillaReference, createdAt
            )
            VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8)
            ON CONFLICT(engagementId, period) DO UPDATE SET
              declaredIbc = excluded.declaredIbc,
              verified = 1,
              verifiedBy = excluded.verifiedBy,
              verifiedAt = excluded.verifiedAt,
              planillaReference = excluded.planillaReference
          `)
          .bind(
            id,
            engagementId,
            period,
            declaredIbc,
            user.id,
            now,
            body.planillaReference || null,
            now
          )
          .run();

        await audit(
          env,
          user,
          'CREATE',
          'pila_verification',
          engagementId,
          String(engagement.companyId)
        );

        return sendJson({
          success: true,
          message: 'Verificación de PILA registrada correctamente.',
        });
      }

      /*
       * ============================================================
       * PERSONAL POR HORAS — LIQUIDACIÓN
       *
       * Enruta automáticamente al motor y al documento DIAN correcto
       * según la modalidad de la vinculación.
       * ============================================================
       */

      if (
        url.pathname === '/api/hourly/settlements/calculate' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const engagementId = String(body.engagementId || '').trim();
        const periodStart = String(body.periodStart || '').trim();
        const periodEnd = String(body.periodEnd || '').trim();

        if (!engagementId || !periodStart || !periodEnd) {
          return sendJson(
            {
              success: false,
              error: 'engagementId, periodStart y periodEnd son obligatorios.',
            },
            400
          );
        }

        const engagementRow = await env.DB
          .prepare(`
            SELECT
              e.*,
              p.firstName AS p_firstName,
              p.firstName2 AS p_firstName2,
              p.lastName AS p_lastName,
              p.lastName2 AS p_lastName2,
              p.taxId AS p_taxId
            FROM engagements e
            JOIN professionals p ON p.id = e.professionalId
            WHERE e.id = ?1
              AND e.active = 1
          `)
          .bind(engagementId)
          .first();

        if (!engagementRow) {
          return sendJson(
            {
              success: false,
              error: 'Vinculación no encontrada o inactiva.',
            },
            404
          );
        }

        const engagement = normalizeEngagement(engagementRow);

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, engagement.companyId);

        const hoursResult = await env.DB
          .prepare(`
            SELECT COALESCE(SUM(hours), 0) AS totalHours
            FROM time_entries
            WHERE engagementId = ?1
              AND periodStart >= ?2
              AND periodEnd <= ?3
          `)
          .bind(engagementId, periodStart, periodEnd)
          .first();

        const totalHours = Number((hoursResult as any)?.totalHours ?? 0);

        if (totalHours <= 0) {
          return sendJson(
            {
              success: false,
              error: 'No hay horas registradas para ese periodo.',
            },
            400
          );
        }

        const companyRow = await env.DB
          .prepare(`SELECT nit, dv, name FROM companies WHERE id = ?1 AND active = 1`)
          .bind(engagement.companyId)
          .first();

        if (!companyRow) {
          return sendJson(
            {
              success: false,
              error: 'Empresa no encontrada o inactiva.',
            },
            404
          );
        }

        if (engagement.vinculationType === 'EST_MISSION') {
          return sendJson(
            {
              success: false,
              error: 'Módulo EST no disponible.',
            },
            400
          );
        }

        let grossAmount: number;
        let retentionAmount: number;
        let netAmount: number;
        let calculation: unknown;
        let dianDocument: unknown;

        try {
          if (engagement.vinculationType === 'PART_TIME_EMPLOYEE') {
            const input: PartTimeEmployeeInput = {
              companyId: engagement.companyId,
              engagementId: engagement.id,
              professionalId: engagement.professionalId,
              firstName: String(engagementRow.p_firstName || ''),
              firstName2: engagementRow.p_firstName2 ? String(engagementRow.p_firstName2) : undefined,
              lastName: String(engagementRow.p_lastName || ''),
              lastName2: engagementRow.p_lastName2 ? String(engagementRow.p_lastName2) : undefined,
              taxId: String(engagementRow.p_taxId || ''),
              hourlyRate: engagement.hourlyRate,
              weeklyHours: Number(engagement.weeklyHours || 0),
              hoursWorked: totalHours,
            };

            const payrollResult = PartTimeEmployeeEngine.calculate(input);

            const employerInfo = {
              nit: String(companyRow.nit || ''),
              dv: String(companyRow.dv || '0'),
              companyName: String(companyRow.name || ''),
              softwareId: env.DIAN_SOFTWARE_ID || 'SOFT-KREADU-2026',
              pinSoftware: env.DIAN_SOFTWARE_PIN || '12345',
            };

            const nominaConsecutive = await getNextDianConsecutive(
              env.DB,
              engagement.companyId,
              'NOMINA'
            );

            const xmlResult = await DianNominaXmlService.generateDSPNE(
              payrollResult,
              employerInfo,
              {
                typeDocument: '13',
                typeContract: '1',
                paymentMethod: '42',
              },
              nominaConsecutive
            );

            grossAmount = payrollResult.grossEarnings;
            retentionAmount = payrollResult.employeeDeductions.totalDeductions;
            netAmount = payrollResult.netPay;
            calculation = payrollResult;
            dianDocument = xmlResult;

          } else {
            // INDEPENDENT_SERVICES
            const period = periodStart.substring(0, 7);

            const verification = await env.DB
              .prepare(`
                SELECT verified
                FROM pila_verifications
                WHERE engagementId = ?1
                  AND period = ?2
              `)
              .bind(engagementId, period)
              .first();

            if (!verification || !(verification as any).verified) {
              return sendJson(
                {
                  success: false,
                  error:
                    'Debes verificar el pago de seguridad social del ' +
                    `contratista para el periodo ${period} antes de liquidar ` +
                    '(deber legal del contratante, Ley 1955/2019 art. 244).',
                },
                400
              );
            }

            const input: IndependentContractorInput = {
              companyId: engagement.companyId,
              engagementId: engagement.id,
              professionalId: engagement.professionalId,
              firstName: String(engagementRow.p_firstName || ''),
              firstName2: engagementRow.p_firstName2 ? String(engagementRow.p_firstName2) : undefined,
              lastName: String(engagementRow.p_lastName || ''),
              lastName2: engagementRow.p_lastName2 ? String(engagementRow.p_lastName2) : undefined,
              taxId: String(engagementRow.p_taxId || ''),
              hourlyRate: engagement.hourlyRate,
              hoursWorked: totalHours,
              retentionConcept:
                (engagement.retentionConcept as RetentionConcept) || 'SERVICIOS',
              isIncomeTaxFiler: !!engagement.isIncomeTaxFiler,
              // Sólo aplica (y es obligatoria) para concepto HONORARIOS:
              // la tabla es progresiva por tramos de UVT, así que la
              // captura quien liquida en vez de calcularla el sistema.
              manualRetentionRate:
                body.retentionRate === undefined || body.retentionRate === null
                  ? undefined
                  : Number(body.retentionRate),
            };

            const settlementResult = IndependentContractorEngine.calculate(input);

            const payerInfo: DocumentoSoportePayerInfo = {
              nit: String(companyRow.nit || ''),
              dv: String(companyRow.dv || '0'),
              companyName: String(companyRow.name || ''),
              softwareId: env.DIAN_SOFTWARE_ID || 'SOFT-KREADU-2026',
              pinSoftware: env.DIAN_SOFTWARE_PIN || '12345',
            };

            const beneficiaryInfo: DocumentoSoporteBeneficiaryInfo = {
              typeDocument: '13',
              concept: settlementResult.retentionConcept,
            };

            const soporteConsecutive = await getNextDianConsecutive(
              env.DB,
              engagement.companyId,
              'DOCUMENTO_SOPORTE'
            );

            const documentoSoporte = await DocumentoSoporteService.generate(
              settlementResult,
              payerInfo,
              beneficiaryInfo,
              soporteConsecutive
            );

            grossAmount = settlementResult.grossAmount;
            retentionAmount = settlementResult.retentionAmount;
            netAmount = settlementResult.netAmount;
            calculation = settlementResult;
            dianDocument = documentoSoporte;
          }
        } catch (engineError) {
          if (
            engineError instanceof PartTimeEmployeeEngineError ||
            engineError instanceof IndependentContractorEngineError
          ) {
            return sendJson(
              { success: false, error: engineError.message },
              400
            );
          }

          throw engineError;
        }

        const settlementId = `SET-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        const resultJson = JSON.stringify({ calculation, dianDocument });

        await env.DB
          .prepare(`
            INSERT INTO settlements (
              id, engagementId, periodStart, periodEnd, totalHours,
              grossAmount, retentionAmount, netAmount, resultJson, createdAt
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          `)
          .bind(
            settlementId,
            engagementId,
            periodStart,
            periodEnd,
            totalHours,
            grossAmount,
            retentionAmount,
            netAmount,
            resultJson,
            createdAt
          )
          .run();

        await audit(
          env,
          user,
          'CREATE',
          'settlement',
          settlementId,
          engagement.companyId
        );

        return sendJson(
          {
            success: true,
            data: {
              id: settlementId,
              engagementId,
              periodStart,
              periodEnd,
              totalHours,
              grossAmount,
              retentionAmount,
              netAmount,
              calculation,
              dianDocument,
            },
          },
          201
        );
      }

      /*
       * ============================================================
       * USUARIOS - LISTAR
       *
       * SUPER_ADMIN ve todos los usuarios; TENANT_ADMIN sólo los de
       * su propia empresa.
       * ============================================================
       */

      if (
        url.pathname === '/api/users' &&
        request.method === 'GET'
      ) {
        requireRole(user, ['TENANT_ADMIN']);

        const result = await env.DB
          .prepare(`
            SELECT id, email, role, companyId, employeeId, active, createdAt
            FROM users
            WHERE active = 1
              AND (?1 IS NULL OR companyId = ?1)
            ORDER BY email ASC
          `)
          .bind(user.role === 'SUPER_ADMIN' ? null : user.companyId)
          .all();

        return sendJson({
          success: true,
          data: result.results || [],
        });
      }

      /*
       * ============================================================
       * USUARIOS - CREAR
       *
       * Da de alta el acceso de un administrador de empresa (o de
       * otro SUPER_ADMIN). El enlace con la cuenta de Firebase se
       * completa solo, en el primer login, por email.
       * ============================================================
       */

      if (
        url.pathname === '/api/users' &&
        request.method === 'POST'
      ) {
        requireRole(user, ['TENANT_ADMIN']);

        const body = await request.json() as any;

        const email = String(body.email || '').trim().toLowerCase();
        const role = body.role as UserRole;

        if (!email) {
          return sendJson(
            {
              success: false,
              error: 'El correo es obligatorio.',
            },
            400
          );
        }

        if (
          role !== 'SUPER_ADMIN' &&
          role !== 'TENANT_ADMIN' &&
          role !== 'EMPLOYEE'
        ) {
          return sendJson(
            {
              success: false,
              error: 'El rol indicado no es válido.',
            },
            400
          );
        }

        if (role === 'SUPER_ADMIN') {
          // Sólo un SUPER_ADMIN puede crear a otro.
          requireRole(user, []);
        }

        const requiresCompany =
          role === 'TENANT_ADMIN' || role === 'EMPLOYEE';

        const companyId = body.companyId
          ? String(body.companyId).trim()
          : null;

        if (requiresCompany && !companyId) {
          return sendJson(
            {
              success: false,
              error: `El rol ${role} requiere una empresa (companyId).`,
            },
            400
          );
        }

        if (requiresCompany) {
          // Un TENANT_ADMIN sólo puede dar de alta usuarios de su
          // propia empresa; SUPER_ADMIN puede para cualquiera.
          requireCompanyAccess(user, companyId);

          const company = await env.DB
            .prepare(`
              SELECT id
              FROM companies
              WHERE id = ?1
                AND active = 1
            `)
            .bind(companyId)
            .first();

          if (!company) {
            return sendJson(
              {
                success: false,
                error: 'La empresa indicada no existe o está inactiva.',
              },
              404
            );
          }
        }

        const id = `USR-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        try {
          await env.DB
            .prepare(`
              INSERT INTO users (
                id, email, role, companyId, employeeId, active, createdAt
              )
              VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)
            `)
            .bind(
              id,
              email,
              role,
              companyId,
              body.employeeId || null,
              createdAt
            )
            .run();
        } catch {
          return sendJson(
            {
              success: false,
              error: 'Ya existe un usuario con ese correo.',
            },
            409
          );
        }

        await audit(env, user, 'CREATE', 'user', id, companyId);

        return sendJson(
          {
            success: true,
            data: { id, email, role, companyId },
          },
          201
        );
      }

      /*
       * ============================================================
       * USUARIOS - ELIMINAR (deshabilitar acceso)
       * ============================================================
       */

      const userMatch =
        url.pathname.match(/^\/api\/users\/([^/]+)$/);

      if (
        userMatch &&
        request.method === 'DELETE'
      ) {
        requireRole(user, ['TENANT_ADMIN']);

        const targetUserId = decodeURIComponent(userMatch[1]);

        const existing = await env.DB
          .prepare(`
            SELECT id, companyId
            FROM users
            WHERE id = ?1
              AND active = 1
          `)
          .bind(targetUserId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Usuario no encontrado.',
            },
            404
          );
        }

        // Un TENANT_ADMIN sólo puede deshabilitar usuarios de su
        // propia empresa (y nunca a un SUPER_ADMIN, que no tiene
        // companyId).
        requireCompanyAccess(user, existing.companyId as string | null);

        await env.DB
          .prepare(`
            UPDATE users
            SET active = 0
            WHERE id = ?1
          `)
          .bind(targetUserId)
          .run();

        await audit(
          env,
          user,
          'DELETE',
          'user',
          targetUserId,
          existing.companyId as string | null
        );

        return sendJson({
          success: true,
          message: 'Usuario deshabilitado correctamente.',
        });
      }

      /*
       * ============================================================
       * 404
       * ============================================================
       */

      return sendJson(
        {
          success: false,
          error: 'Ruta no encontrada.',
        },
        404
      );

    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(
          {
            success: false,
            error: error.message,
          },
          error.status
        );
      }

      console.error('Worker error:', error);

      return sendJson(
        {
          success: false,
          error: 'Error interno del servidor.',
        },
        500
      );
    }
  },
};
