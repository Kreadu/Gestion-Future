/**
 * CLIENTE HTTP PARA API DE NÓMINA COLOMBIA
 * Ejemplos de uso con fetch, axios, etc.
 */

import {
  ColombiaEmployeeInput,
  DianEmployerInfo,
  DianEmployeeExtraInfo,
  PayrollResult,
  DianNominaXmlResult,
} from './payrollApiTypes';

// ============================================
// CONFIGURACIÓN
// ============================================

const API_BASE_URL = process.env.REACT_APP_PAYROLL_API_URL || 'http://localhost:8787/api';
const API_TIMEOUT = 30000; // 30 segundos

// ============================================
// CLIENTE API
// ============================================

export class PayrollApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = API_BASE_URL, timeout: number = API_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Verificar estado del servicio
   */
  async health(): Promise<{ status: string; service: string }> {
    return this.get('/health');
  }

  /**
   * Calcular liquidación de nómina
   */
  async calculatePayroll(
    employeeInput: ColombiaEmployeeInput
  ): Promise<PayrollResult> {
    return this.post('/colombia/payroll/calculate', {
      employeeInput,
    });
  }

  /**
   * Generar XML de nómina electrónica DIAN
   */
  async generateDianNominaXml(
    employeeInput: ColombiaEmployeeInput,
    employerInfo: DianEmployerInfo,
    employeeExtraInfo: DianEmployeeExtraInfo,
    consecutiveNumber?: number
  ): Promise<DianNominaXmlResult> {
    return this.post('/dian/nomina-xml', {
      employeeInput,
      employerInfo,
      employeeExtraInfo,
      consecutiveNumber,
    });
  }

  /**
   * Request GET
   */
  private async get(endpoint: string): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw this.handleError(error, url);
    }
  }

  /**
   * Request POST
   */
  private async post(endpoint: string, payload: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw this.handleError(error, url);
    }
  }

  /**
   * Manejo de errores
   */
  private handleError(error: any, url: string): Error {
    if (error instanceof TypeError) {
      return new Error(`Error de conexión a ${url}: ${error.message}`);
    }
    if (error.name === 'AbortError') {
      return new Error(`Timeout: La solicitud excedió ${this.timeout}ms`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

// ============================================
// INSTANCIA GLOBAL
// ============================================

export const payrollApi = new PayrollApiClient();

// ============================================
// EJEMPLOS DE USO
// ============================================

/**
 * Ejemplo 1: Calcular nómina simple
 */
export async function exampleCalculatePayroll() {
  try {
    const employeeData: ColombiaEmployeeInput = {
      employeeId: 'EMP-001',
      firstName: 'Carlos',
      lastName: 'Rodríguez',
      taxId: '1098765432',
      baseSalaryMonthly: 1750905,
      daysWorked: 30,
      extraDiurna: 4,
      extraNocturna: 2,
      recargoNocturno: 10,
    };

    const result = await payrollApi.calculatePayroll(employeeData);
    console.log('Nómina calculada:', result);
    console.log('Neto a pagar:', result.netPay);
    console.log('Costo empleador:', result.totalEmployerCost);

    return result;
  } catch (error) {
    console.error('Error calculando nómina:', error);
    throw error;
  }
}

/**
 * Ejemplo 2: Generar XML DIAN completo
 */
export async function exampleGenerateDianXml() {
  try {
    const employeeInput: ColombiaEmployeeInput = {
      employeeId: 'EMP-001',
      firstName: 'Juan',
      lastName: 'Pérez',
      taxId: '1234567890',
      baseSalaryMonthly: 2500000,
      daysWorked: 30,
      extraDiurna: 0,
      extraNocturna: 0,
      recargoNocturno: 0,
    };

    const employerInfo: DianEmployerInfo = {
      companyName: 'Tech Solutions S.A.S.',
      nit: '900123456',
      nitVerifier: '1',
      address: 'Cra. 15 # 100-50',
      city: 'Medellín',
      department: 'Antioquia',
      country: 'CO',
      email: 'rrhh@techsolutions.com',
      softwareProvider: {
        nit: '800987654',
        name: 'Gestión-Future',
        pin: 'gf-2024-prod',
      },
    };

    const employeeExtraInfo: DianEmployeeExtraInfo = {
      departmentCode: '05001', // Medellín
      municipalityCode: '05001000',
      contractType: 'Indefinido',
      workPosition: 'Ingeniero de Sistemas',
      startDate: '2022-06-01',
      departmentName: 'Desarrollo',
    };

    const xmlResult = await payrollApi.generateDianNominaXml(
      employeeInput,
      employerInfo,
      employeeExtraInfo,
      1
    );

    console.log('XML DIAN generado exitosamente');
    console.log('CUNE:', xmlResult.cune);
    console.log('Archivo:', xmlResult.filename);
    console.log('Tamaño:', xmlResult.fileSize, 'bytes');

    // Descargar XML
    if (typeof window !== 'undefined') {
      downloadFile(xmlResult.xml, xmlResult.filename, 'application/xml');
    }

    return xmlResult;
  } catch (error) {
    console.error('Error generando XML DIAN:', error);
    throw error;
  }
}

/**
 * Ejemplo 3: Obtener estado del servicio
 */
export async function exampleHealthCheck() {
  try {
    const status = await payrollApi.health();
    console.log('Estado del servicio:', status);
    return status;
  } catch (error) {
    console.error('Servicio no disponible:', error);
    throw error;
  }
}

/**
 * Ejemplo 4: Calcular múltiples empleados (lote)
 */
export async function exampleBatchPayroll(employees: ColombiaEmployeeInput[]) {
  try {
    const results = await Promise.all(
      employees.map((emp) => payrollApi.calculatePayroll(emp))
    );

    const totalNetPay = results.reduce((sum, r) => sum + r.netPay, 0);
    const totalEmployerCost = results.reduce(
      (sum, r) => sum + r.totalEmployerCost,
      0
    );

    console.log('Lote procesado:');
    console.log('- Empleados:', results.length);
    console.log('- Total neto:', totalNetPay);
    console.log('- Costo total empleador:', totalEmployerCost);

    return {
      employees: results,
      summary: {
        count: results.length,
        totalNetPay,
        totalEmployerCost,
        averageNetPay: totalNetPay / results.length,
      },
    };
  } catch (error) {
    console.error('Error procesando lote:', error);
    throw error;
  }
}

/**
 * Ejemplo 5: Integración en React (Hook)
 */
export function usePayrollCalculation() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<PayrollResult | null>(null);

  const calculate = async (employeeInput: ColombiaEmployeeInput) => {
    setLoading(true);
    setError(null);
    try {
      const payrollResult = await payrollApi.calculatePayroll(employeeInput);
      setResult(payrollResult);
      return payrollResult;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, result, calculate };
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Descargar archivo desde blob
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validar conexión a API
 */
export async function validateApiConnection(
  baseUrl: string = API_BASE_URL
): Promise<boolean> {
  try {
    const client = new PayrollApiClient(baseUrl, 5000);
    await client.health();
    return true;
  } catch {
    return false;
  }
}

/**
 * Retry con exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.warn(
          `Intento ${attempt} fallido. Reintentando en ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Exportar para TypeScript
import React from 'react';
