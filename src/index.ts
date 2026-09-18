import { ColombiaPayrollEngine, ColombiaEmployeeInput } from './engine/countries/colombiaEngine';
import { DianNominaXmlService, DianEmployerInfo, DianEmployeeExtraInfo } from './services/dianNominaXmlService';

interface PayrollCalculateRequest {
  employeeInput: ColombiaEmployeeInput;
}

interface DianXmlGenerateRequest {
  employeeInput: ColombiaEmployeeInput;
  employerInfo: DianEmployerInfo;
  employeeExtraInfo: DianEmployeeExtraInfo;
  consecutiveNumber?: number;
}

interface ApiResponse<T = any> {
  success?: boolean;
  status?: string;
  service?: string;
  data?: T;
  error?: string;
  payrollSummary?: any;
  dianDocument?: any;
}

/**
 * API Server para Gestión-Future Payroll & DIAN
 * Endpoints:
 * - GET /api/health -> Healthcheck
 * - POST /api/colombia/payroll/calculate -> Calcula nómina Colombia
 * - POST /api/dian/nomina-xml -> Genera XML de nómina electrónica DIAN
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Preflight CORS
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
        status: 204,
      });
    }

    try {
      // ============================================
      // ENDPOINT: Health Check
      // ============================================
      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(
          {
            status: 'ok',
            service: 'Gestión-Future Payroll & DIAN API',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            region: 'edge-compute',
          },
          200,
          corsHeaders
        );
      }

      // ============================================
      // ENDPOINT: Cálculo de Nómina Colombia
      // ============================================
      if (pathname === '/api/colombia/payroll/calculate' && method === 'POST') {
        try {
          const body = (await request.json()) as PayrollCalculateRequest;

          // Validar input
          if (!body.employeeInput) {
            return sendJson(
              { error: 'Campo requerido: employeeInput' },
              400,
              corsHeaders
            );
          }

          // Calcular nómina
          const result = ColombiaPayrollEngine.calculate(body.employeeInput);

          return sendJson(
            {
              success: true,
              data: result,
            },
            200,
            corsHeaders
          );
        } catch (err: any) {
          return sendJson(
            {
              success: false,
              error: err.message || 'Error al calcular nómina',
            },
            400,
            corsHeaders
          );
        }
      }

      // ============================================
      // ENDPOINT: Generación de XML Nómina Electrónica DIAN
      // ============================================
      if (pathname === '/api/dian/nomina-xml' && method === 'POST') {
        try {
          const body = (await request.json()) as DianXmlGenerateRequest;

          // Validar inputs requeridos
          if (!body.employeeInput) {
            return sendJson(
              { error: 'Campo requerido: employeeInput' },
              400,
              corsHeaders
            );
          }
          if (!body.employerInfo) {
            return sendJson(
              { error: 'Campo requerido: employerInfo' },
              400,
              corsHeaders
            );
          }
          if (!body.employeeExtraInfo) {
            return sendJson(
              { error: 'Campo requerido: employeeExtraInfo' },
              400,
              corsHeaders
            );
          }

          // 1. Calcular nómina con el motor de Colombia
          const payrollResult = ColombiaPayrollEngine.calculate(
            body.employeeInput
          );

          // 2. Generar XML y CUNE
          const xmlResult = await DianNominaXmlService.generateDSPNE(
            payrollResult,
            body.employerInfo,
            body.employeeExtraInfo,
            body.consecutiveNumber || 1
          );

          return sendJson(
            {
              success: true,
              payrollSummary: payrollResult,
              dianDocument: xmlResult,
            },
            200,
            corsHeaders
          );
        } catch (err: any) {
          return sendJson(
            {
              success: false,
              error: err.message || 'Error al generar XML de nómina',
            },
            400,
            corsHeaders
          );
        }
      }

      // ============================================
      // ENDPOINT: Listado de endpoints (información)
      // ============================================
      if (pathname === '/api' || pathname === '/api/' || pathname === '/') {
        return sendJson(
          {
            service: 'Gestión-Future Payroll & DIAN API',
            version: '1.0.0',
            endpoints: [
              {
                method: 'GET',
                path: '/api/health',
                description: 'Verificar estado del servicio',
              },
              {
                method: 'POST',
                path: '/api/colombia/payroll/calculate',
                description: 'Calcular liquidación de nómina (Colombia 2026)',
                body: {
                  employeeInput: {
                    employeeId: 'string',
                    firstName: 'string',
                    lastName: 'string',
                    taxId: 'string',
                    baseSalaryMonthly: 'number',
                    daysWorked: 'number (1-30)',
                    extraDiurna: 'number',
                    extraNocturna: 'number',
                    recargoNocturno: 'number',
                    isExempt114_1: 'boolean',
                  },
                },
              },
              {
                method: 'POST',
                path: '/api/dian/nomina-xml',
                description:
                  'Generar XML de nómina electrónica para DIAN (Documento Soporte de Pago de Nómina Electrónica)',
                body: {
                  employeeInput: 'ColombiaEmployeeInput',
                  employerInfo: 'DianEmployerInfo',
                  employeeExtraInfo: 'DianEmployeeExtraInfo',
                  consecutiveNumber: 'number (opcional)',
                },
              },
            ],
          },
          200,
          corsHeaders
        );
      }

      // ============================================
      // 404: Endpoint no encontrado
      // ============================================
      return sendJson(
        {
          error: 'Endpoint no encontrado',
          path: pathname,
          method: method,
          availableEndpoints: ['/api/health', '/api/colombia/payroll/calculate', '/api/dian/nomina-xml'],
        },
        404,
        corsHeaders
      );
    } catch (err: any) {
      console.error('Unhandled error:', err);
      return sendJson(
        {
          error: 'Error interno del servidor',
          message: err.message,
        },
        500,
        corsHeaders
      );
    }
  },
};

/**
 * Helper: Enviar respuesta JSON con headers CORS
 */
function sendJson(
  data: any,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
