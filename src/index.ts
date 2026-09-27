import ColombiaPayrollEngine from './engine/countries/colombiaEngine';
import type {
  ColombiaPayrollInput,
  ColombiaPayrollResult,
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
  audit,
  HttpError,
  type AuthUser,
  type UserRole,
} from './auth/authz';

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
  active: boolean | number;
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
    active: !!row.active,
    createdAt: row.createdAt ?? null,
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
              hireDate = ?14
            WHERE id = ?15
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
       * NÓMINA COLOMBIA 2026
       *
       * IMPORTANTE:
       * El cálculo NO se hace aquí.
       * Se delega completamente al motor ColombiaPayrollEngine.
       * ============================================================
       */

      if (
        url.pathname === '/api/colombia/payroll/calculate' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;
        const employeeInput = body?.employeeInput || {};

        const employeeId = String(
          employeeInput.employeeId || ''
        ).trim();

        if (!employeeId) {
          return sendJson(
            {
              success: false,
              error: 'employeeId es obligatorio.',
            },
            400
          );
        }

        const employeeRow = await env.DB
          .prepare(`
            SELECT *
            FROM employees
            WHERE id = ?1
              AND active = 1
          `)
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

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, employee.companyId);

        const daysWorked = Number(
          employeeInput.daysWorked ?? 30
        );

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

        const overtimeHours =
          employeeInput.overtimeHours || {};

        const extraDiurna = Number(
          overtimeHours.extraDiurna ?? 0
        );

        const extraNocturna = Number(
          overtimeHours.extraNocturna ?? 0
        );

        const recargoNocturno = Number(
          overtimeHours.recargoNocturno ?? 0
        );

        if (
          !Number.isFinite(extraDiurna) ||
          !Number.isFinite(extraNocturna) ||
          !Number.isFinite(recargoNocturno) ||
          extraDiurna < 0 ||
          extraNocturna < 0 ||
          recargoNocturno < 0
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
          firstName2:
            employee.firstName2 || undefined,

          lastName: employee.lastName,
          lastName2:
            employee.lastName2 || undefined,

          taxId: employee.taxId,

          baseSalaryMonthly: employee.salary,

          daysWorked,

          extraDiurna,
          extraNocturna,
          recargoNocturno,

          overtimeHours: {
            extraDiurna,
            extraNocturna,
            recargoNocturno,
          },
        };

        const payrollResult: ColombiaPayrollResult =
          ColombiaPayrollEngine.calculate(
            payrollInput
          );

        return sendJson({
          success: true,
          data: payrollResult,
        });
      }

      /*
       * ============================================================
       * DIAN - GENERAR XML
       * ============================================================
       */

      if (
        url.pathname === '/api/colombia/dian/xml' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const payrollData =
          body?.payrollData as ColombiaPayrollResult;

        if (
          !payrollData ||
          !payrollData.employeeId ||
          !payrollData.taxId
        ) {
          return sendJson(
            {
              success: false,
              error: 'Los datos de nómina son obligatorios.',
            },
            400
          );
        }

        const dianCompanyId = String(
          payrollData.companyId || ''
        ).trim();

        if (!dianCompanyId) {
          return sendJson(
            {
              success: false,
              error:
                'Los datos de nómina no tienen una empresa asociada.',
            },
            400
          );
        }

        requireRole(user, ['TENANT_ADMIN']);
        requireCompanyAccess(user, dianCompanyId);

        // El NIT, la razón social y las credenciales de software NUNCA
        // se toman del body: se resuelven en el servidor a partir de
        // la empresa dueña de la nómina y de la configuración del
        // Worker, para que no puedan falsificarse desde el navegador.
        const companyRow = await env.DB
          .prepare(`
            SELECT nit, dv, name
            FROM companies
            WHERE id = ?1
              AND active = 1
          `)
          .bind(dianCompanyId)
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

        const employeeInput =
          body?.employeeExtra || {};

        const employerInfo: DianEmployerInfo = {
          nit: String(companyRow.nit || ''),
          dv: String(companyRow.dv || '0'),
          companyName: String(companyRow.name || ''),

          softwareId:
            env.DIAN_SOFTWARE_ID || 'SOFT-KREADU-2026',

          pinSoftware:
            env.DIAN_SOFTWARE_PIN || '12345',

          testSetId:
            body?.employerInfo?.testSetId ||
            undefined,
        };

        if (
          !employerInfo.nit ||
          !employerInfo.companyName
        ) {
          return sendJson(
            {
              success: false,
              error:
                'La empresa no tiene NIT o razón social configurados.',
            },
            400
          );
        }

        const employeeExtra: DianEmployeeExtraInfo = {
          typeDocument:
            employeeInput.typeDocument || '13',

          typeContract:
            employeeInput.typeContract || '1',

          /*
           * 42 = transferencia bancaria.
           * El servicio DIAN preparado acepta 10, 42 o 20.
           */
          paymentMethod:
            employeeInput.paymentMethod || '42',

          bankName:
            employeeInput.bankName ||
            undefined,

          accountNumber:
            employeeInput.accountNumber ||
            undefined,

          accountType:
            employeeInput.accountType ||
            undefined,
        };

        const consecutiveNumber = Math.max(
          1,
          Number(body?.consecutiveNumber || 1)
        );

        const xmlResult =
          await DianNominaXmlService.generateDSPNE(
            payrollData,
            employerInfo,
            employeeExtra,
            consecutiveNumber
          );

        return sendJson({
          success: true,
          data: xmlResult,
        });
      }

      /*
       * ============================================================
       * BANCOS
       *
       * Se conserva conectado al servicio existente.
       * ============================================================
       */

      if (
        url.pathname === '/api/colombia/bank-disbursement' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const bankCompanyId = String(body?.companyId || '').trim();

        if (
          !bankCompanyId ||
          !body?.companyInfo ||
          !Array.isArray(body?.records)
        ) {
          return sendJson(
            {
              success: false,
              error:
                'companyId, companyInfo y records son obligatorios.',
            },
            400
          );
        }

          requireRole(user, ['TENANT_ADMIN']);
          requireCompanyAccess(user, bankCompanyId);

          const requestedPayrolls = Array.isArray(body.records)
            ? body.records
            : [];

          const requestedEmployeeIds: string[] = requestedPayrolls
            .map((record: any) => String(record?.employeeId || ''))
            .filter((id: string) => id.length > 0);

          // Sólo se admiten registros de empleados que de verdad
          // pertenecen a la empresa autorizada: evita que alguien
          // cuele el employeeId de otro cliente en el archivo bancario.
          const allowedEmployeeIds = new Set<string>();

          if (requestedEmployeeIds.length > 0) {
            const placeholders = requestedEmployeeIds
              .map((_, index) => `?${index + 2}`)
              .join(', ');

            const allowedRows = await env.DB
              .prepare(`
                SELECT id
                FROM employees
                WHERE companyId = ?1
                  AND id IN (${placeholders})
              `)
              .bind(bankCompanyId, ...requestedEmployeeIds)
              .all();

            for (const row of allowedRows.results || []) {
              allowedEmployeeIds.add(String((row as any).id));
            }
          }

          const payrolls = requestedPayrolls.filter(
            (record: any) =>
              record?.employeeId &&
              allowedEmployeeIds.has(String(record.employeeId))
          );

          const employeesMap = new Map<string, any>();

          for (const record of payrolls) {
            if (!record?.employeeId) continue;

            employeesMap.set(record.employeeId, {
              bankCode: record.bankCode || record.bankName || 'N/A',
              bankAccount: record.bankAccount || record.accountNumber || 'N/A',
              taxId: record.taxId || 'N/A',
            });
          }

          const result = BankDisbursementService.generateCSV(
            payrolls,
            employeesMap
          );

          return sendJson({
            success: true,
            data: result,
          });
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
