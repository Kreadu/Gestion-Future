/**
 * TIPOS UNIFICADOS - GESTION-FUTURE
 * Fuente única de tipos para:
 * - Empresas
 * - Empleados
 * - Nómina Colombia
 * - DIAN Nómina Electrónica
 * - API
 *
 * IMPORTANTE:
 * Este archivo NO debe importar tipos desde ColombiaPayrollEngine
 * ni desde DianNominaXmlService.
 */

// ============================================================
// ENUMS
// ============================================================

export enum RiskClass {
  CLASS_I = 0.00522,
  CLASS_II = 0.01044,
  CLASS_III = 0.02436,
  CLASS_IV = 0.04350,
  CLASS_V = 0.06960,
}

// ============================================================
// MODELOS DE NEGOCIO
// ============================================================

export interface Tenant {
  id: string;
  name: string;
  taxId: string;
  bankAccount?: string;
  createdAt: string;

  address?: string;
  city?: string;
  department?: string;
  country?: string;
  email?: string;
  phone?: string;
  industryCode?: string;
}

// ============================================================
// EMPLEADO
// ============================================================

export interface Employee {
  id: string;

  /**
   * companyId es el identificador utilizado actualmente
   * por la aplicación Gestión-Future.
   */
  companyId: string;

  firstName: string;
  firstName2?: string;

  lastName: string;
  lastName2?: string;

  taxId: string;

  position?: string;
  jobTitle?: string;

  baseSalaryMonthly: number;

  bankAccount?: string;
  bankCode?: string;

  contractType?:
    | 'Indefinido'
    | 'Fijo'
    | 'Obra o Labor'
    | 'Aprendizaje'
    | 'Por Horas';

  startDate?: string;
  hireDate?: string;

  departmentName?: string;

  address?: string;
  city?: string;
  country?: string;

  phone?: string;
  whatsapp?: string;

  isExempt114_1?: boolean;

  active?: boolean;

  createdAt?: string;
}

// ============================================================
// CONCEPTOS DE NÓMINA
// ============================================================

export interface PayrollDetailConcept {
  concept: string;
  conceptType: 'earning' | 'deduction';
  amount: number;
  taxable: boolean;
}

// ============================================================
// REGISTRO DE NÓMINA
// ============================================================

export interface PayrollRecord {
  payrollId: string;
  employeeId: string;
  employeeName: string;
  periodDate: string;

  daysWorked: number;

  baseSalaryEarned: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;

  employerContributions: number;

  details: PayrollDetailConcept[];

  cune?: string;

  dianStatus?: 'pending' | 'transmitted' | 'rejected';
}

// ============================================================
// INPUT DEL MOTOR DE NÓMINA COLOMBIA
// ============================================================

export interface ColombiaPayrollInput {
  companyId?: string;

  employeeId: string;

  firstName: string;
  firstName2?: string;

  lastName: string;
  lastName2?: string;

  taxId: string;

  baseSalaryMonthly: number;

  /**
   * Días trabajados del período.
   * Rango permitido: 1 a 30.
   */
  daysWorked: number;

  /**
   * Clase de riesgo ARL.
   */
  riskClass?: RiskClass;

  /**
   * Novedades de horas.
   */
  extraDiurna?: number;
  extraNocturna?: number;
  recargoNocturno?: number;

  /**
   * Formato alternativo de novedades.
   * Se conserva para compatibilidad con pruebas
   * y clientes existentes.
   */
  overtimeHours?: {
    extraDiurna?: number;
    extraNocturna?: number;
    recargoNocturno?: number;
  };

  /**
   * Exención Art. 114-1 E.T.
   */
  isExempt114_1?: boolean;
}

// ============================================================
// RESULTADO DEL MOTOR DE NÓMINA
// ============================================================

export interface ColombiaPayrollResult {
  companyId?: string;

  employeeId: string;

  employeeName: string;

  firstName: string;
  firstName2?: string;

  lastName: string;
  lastName2?: string;

  taxId: string;

  periodDate: string;

  daysWorked: number;

  // ----------------------------------------------------------
  // DEVENGADOS
  // ----------------------------------------------------------

  baseSalaryEarned: number;

  earnedAuxTransporte: number;

  extraDiurnaValue: number;

  extraNocturnaValue: number;

  recargoNocturnoValue: number;

  overtimeTotal: number;

  grossEarnings: number;

  // ----------------------------------------------------------
  // IBC
  // ----------------------------------------------------------

  ibcSecuritySocial: number;

  // ----------------------------------------------------------
  // DEDUCCIONES DEL TRABAJADOR
  // ----------------------------------------------------------

  employeeDeductions: {
    health4pct: number;
    pension4pct: number;

    fspPct: number;
    fspValue: number;

    /**
     * Alias de compatibilidad.
     */
    fsp: number;

    totalDeductions: number;
  };

  // ----------------------------------------------------------
  // NETO
  // ----------------------------------------------------------

  netPay: number;

  // ----------------------------------------------------------
  // APORTES EMPLEADOR
  // ----------------------------------------------------------

  employerContributions: {
    health8_5pct: number;
    pension12pct: number;

    arlValue: number;

    sena2pct: number;
    icbf3pct: number;
    ccf4pct: number;

    totalContributions: number;
  };

  // ----------------------------------------------------------
  // PROVISIONES
  // ----------------------------------------------------------

  provisions: {
    cesantias: number;
    interesesCesantias: number;
    primaServicios: number;
    vacaciones: number;

    totalProvisions: number;
  };

  // ----------------------------------------------------------
  // VALOR HORA
  // ----------------------------------------------------------

  hourlyRate: number;
}

// ============================================================
// DIAN - INFORMACIÓN DEL EMPLEADOR
// ============================================================

export interface DianEmployerInfo {
  nit: string;

  /**
   * Dígito de verificación.
   */
  dv: string;

  companyName: string;

  softwareId: string;

  pinSoftware: string;

  /**
   * Identifica ambiente de pruebas/habilitación DIAN.
   */
  testSetId?: string;

  address?: string;
  city?: string;
  department?: string;
  country?: string;

  email?: string;
  phone?: string;

  industryCode?: string;
}

// ============================================================
// DIAN - INFORMACIÓN ADICIONAL DEL EMPLEADO
// ============================================================

export interface DianEmployeeExtraInfo {
  /**
   * 13 = Cédula de ciudadanía
   * 31 = NIT
   * 22 = Cédula de extranjería
   * 41 = Pasaporte
   * 42 = Documento extranjero
   */
  typeDocument: '13' | '31' | '22' | '41' | '42';

  /**
   * Tipo de contrato según estructura DIAN.
   */
  typeContract: '1' | '2' | '3' | '4' | '5';

  /**
   * Medio de pago.
   */
  paymentMethod: '10' | '42' | '20';

  bankName?: string;

  accountNumber?: string;

  accountType?: 'AHORROS' | 'CORRIENTE';

  departmentCode?: string;

  municipalityCode?: string;

  departmentName?: string;

  workPosition?: string;

  startDate?: string;

  entitlement?: {
    vacationDays?: number;
    bonusMonths?: number;
  };
}

// ============================================================
// RESULTADO GENERACIÓN XML DIAN
// ============================================================

export interface DianXmlGenerationResult {
  cune: string;

  consecutive: string;

  issueDate: string;

  issueTime: string;

  xmlContent: string;

  totalDevengado: number;

  totalDeducciones: number;

  totalComprobante: number;
}

// ============================================================
// RESULTADO COMPATIBLE CON API / DIAN
// ============================================================

export interface DianNominaXmlResult {
  success: boolean;

  xml: string;

  cune: string;

  consecutiveNumber: number;

  validationErrors: string[];

  generatedAt: string;

  filename: string;

  fileSize: number;
}

// ============================================================
// REQUEST / RESPONSE API
// ============================================================

export interface PayrollCalculateRequest {
  employeeInput: ColombiaPayrollInput;
}

export interface PayrollCalculateResponse {
  success: boolean;

  data: ColombiaPayrollResult;

  error?: string;
}

export interface DianXmlGenerateRequest {
  employeeInput: ColombiaPayrollInput;

  employerInfo: DianEmployerInfo;

  employeeExtraInfo: DianEmployeeExtraInfo;

  consecutiveNumber?: number;
}

export interface DianXmlGenerateResponse {
  success: boolean;

  payrollSummary: ColombiaPayrollResult;

  dianDocument: DianNominaXmlResult;

  error?: string;
}

// ============================================================
// CONVERSIÓN EMPLEADO → INPUT NÓMINA
// ============================================================

export function employeeToColombiaPayrollInput(
  employee: Employee,
  daysWorked: number = 30,
  extraDiurna: number = 0,
  extraNocturna: number = 0,
  recargoNocturno: number = 0
): ColombiaPayrollInput {
  return {
    companyId: employee.companyId,

    employeeId: employee.id,

    firstName: employee.firstName,
    firstName2: employee.firstName2,

    lastName: employee.lastName,
    lastName2: employee.lastName2,

    taxId: employee.taxId,

    baseSalaryMonthly: employee.baseSalaryMonthly,

    daysWorked,

    extraDiurna,
    extraNocturna,
    recargoNocturno,

    overtimeHours: {
      extraDiurna,
      extraNocturna,
      recargoNocturno,
    },

    isExempt114_1: employee.isExempt114_1,
  };
}

// ============================================================
// RESULTADO → CONCEPTOS
// ============================================================

export function payrollResultToDetailConcepts(
  result: ColombiaPayrollResult
): PayrollDetailConcept[] {
  const concepts: PayrollDetailConcept[] = [
    {
      concept: 'Sueldo Básico',
      conceptType: 'earning',
      amount: result.baseSalaryEarned,
      taxable: true,
    },

    {
      concept: 'Auxilio de Transporte',
      conceptType: 'earning',
      amount: result.earnedAuxTransporte,
      taxable: false,
    },

    {
      concept: 'Horas Extras Diurnas',
      conceptType: 'earning',
      amount: result.extraDiurnaValue,
      taxable: true,
    },

    {
      concept: 'Horas Extras Nocturnas',
      conceptType: 'earning',
      amount: result.extraNocturnaValue,
      taxable: true,
    },

    {
      concept: 'Recargo Nocturno',
      conceptType: 'earning',
      amount: result.recargoNocturnoValue,
      taxable: true,
    },

    {
      concept: 'Aporte Salud 4%',
      conceptType: 'deduction',
      amount: result.employeeDeductions.health4pct,
      taxable: false,
    },

    {
      concept: 'Aporte Pensión 4%',
      conceptType: 'deduction',
      amount: result.employeeDeductions.pension4pct,
      taxable: false,
    },
  ];

  if (result.employeeDeductions.fspValue > 0) {
    concepts.push({
      concept: 'Fondo de Solidaridad Pensional',
      conceptType: 'deduction',
      amount: result.employeeDeductions.fspValue,
      taxable: false,
    });
  }

  return concepts;
}

// ============================================================
// CONVERSIÓN TENANT → DIAN
// ============================================================

export function tenantToDianEmployerInfo(
  tenant: Tenant,
  softwareProvider: {
    nit: string;
    name: string;
    pin: string;
    softwareId?: string;
  }
): DianEmployerInfo {
  const cleanNit = tenant.taxId.replace(/[^0-9]/g, '');

  const nitWithoutVerifier =
    cleanNit.length > 1
      ? cleanNit.slice(0, -1)
      : cleanNit;

  const dv =
    cleanNit.length > 1
      ? cleanNit.slice(-1)
      : calculateNitVerifier(cleanNit);

  return {
    companyName: tenant.name,

    nit: nitWithoutVerifier,

    dv,

    softwareId:
      softwareProvider.softwareId ||
      softwareProvider.nit,

    pinSoftware: softwareProvider.pin,

    address: tenant.address || '',
    city: tenant.city || '',
    department: tenant.department || '',
    country: tenant.country || 'CO',

    email: tenant.email || '',
    phone: tenant.phone,

    industryCode: tenant.industryCode,
  };
}

// ============================================================
// VALIDACIÓN EMPLEADO
// ============================================================

export function validateEmployee(employee: Employee): string[] {
  const errors: string[] = [];

  if (!employee.id) {
    errors.push('id requerido');
  }

  if (!employee.companyId) {
    errors.push('companyId requerido');
  }

  if (!employee.firstName) {
    errors.push('firstName requerido');
  }

  if (!employee.lastName) {
    errors.push('lastName requerido');
  }

  if (!employee.taxId) {
    errors.push('taxId requerido');
  }

  if (
    !Number.isFinite(employee.baseSalaryMonthly) ||
    employee.baseSalaryMonthly <= 0
  ) {
    errors.push('baseSalaryMonthly debe ser > 0');
  }

  return errors;
}

// ============================================================
// VALIDACIÓN INPUT NÓMINA
// ============================================================

export function validatePayrollInput(
  input: ColombiaPayrollInput
): string[] {
  const errors: string[] = [];

  if (!input.employeeId) {
    errors.push('employeeId requerido');
  }

  if (!input.firstName) {
    errors.push('firstName requerido');
  }

  if (!input.lastName) {
    errors.push('lastName requerido');
  }

  if (!input.taxId) {
    errors.push('taxId requerido');
  }

  if (
    !Number.isFinite(input.baseSalaryMonthly) ||
    input.baseSalaryMonthly <= 0
  ) {
    errors.push('baseSalaryMonthly debe ser > 0');
  }

  if (
    !Number.isInteger(input.daysWorked) ||
    input.daysWorked < 1 ||
    input.daysWorked > 30
  ) {
    errors.push('daysWorked debe estar entre 1 y 30');
  }

  return errors;
}

// ============================================================
// NIT - DÍGITO VERIFICADOR
// ============================================================

export function calculateNitVerifier(nit: string): string {
  const weights = [
    3,
    7,
    13,
    17,
    19,
    23,
    29,
    31,
    37,
  ];

  const cleanNit = nit
    .replace(/[^0-9]/g, '')
    .slice(0, 9);

  if (!cleanNit) {
    return '';
  }

  const reversedNit = cleanNit
    .split('')
    .reverse();

  let sum = 0;

  for (let i = 0; i < reversedNit.length; i++) {
    sum +=
      Number(reversedNit[i]) *
      weights[i];
  }

  const remainder = sum % 11;

  if (remainder === 0) {
    return '0';
  }

  if (remainder === 1) {
    return '9';
  }

  return String(11 - remainder);
}

// ============================================================
// FORMATO COP
// ============================================================

export function formatCOP(
  amount: number
): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================================
// FECHA ACTUAL
// ============================================================

export function getCurrentDate(): string {
  return new Date()
    .toISOString()
    .split('T')[0];
}