/**
 * TIPOS UNIFICADOS
 * Combina tipos de BD + API + Colombia/DIAN
 */

// ============================================
// MODELOS DE NEGOCIO (Base de Datos)
// ============================================

export interface Tenant {
  id: string;
  name: string;
  taxId: string; // NIT empresa
  bankAccount: string;
  createdAt: string;
  // Adicionales para DIAN
  address?: string;
  city?: string;
  department?: string;
  country?: string;
  email?: string;
  phone?: string;
  industryCode?: string; // Código CIIU
}

export interface Employee {
  id: string; // ID de BD
  tenantId: string;
  firstName: string;
  lastName: string;
  taxId: string; // Cédula
  jobTitle: string;
  baseSalaryMonthly: number;
  bankAccount: string;
  bankCode: string;
  // Adicionales para nómina
  contractType?: 'Indefinido' | 'Fijo' | 'Obra o Labor' | 'Aprendizaje' | 'Por Horas';
  startDate?: string;
  departmentName?: string;
  isExempt114_1?: boolean; // Exención Art 114-1 Colombia
}

export interface PayrollDetailConcept {
  concept: string;
  conceptType: 'earning' | 'deduction';
  amount: number;
  taxable: boolean;
}

export interface PayrollRecord {
  payrollId: string;
  employeeId: string;
  employeeName: string;
  periodDate: string; // Fecha del período
  daysWorked: number;
  baseSalaryEarned: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  employerContributions: number;
  details: PayrollDetailConcept[];
  // Adicionales para DIAN
  cune?: string; // Código DIAN
  dianStatus?: 'pending' | 'transmitted' | 'rejected';
}

// ============================================
// INPUT/OUTPUT DE API
// ============================================

/**
 * Input para calcular nómina Colombia
 * Se obtiene combinando Employee + período específico
 */
export interface ColombiaPayrollInput {
  employeeId: string; // Del Employee.id
  firstName: string;
  lastName: string;
  taxId: string; // Del Employee.taxId
  baseSalaryMonthly: number;
  daysWorked: number; // Específico del período (1-30)
  // Novedades del período
  extraDiurna: number; // Horas extras diurnas
  extraNocturna: number; // Horas extras nocturnas
  recargoNocturno: number; // Recargo nocturno
  isExempt114_1?: boolean;
}

/**
 * Output después de calcular
 * Contiene el desglose completo de la nómina
 */
export interface ColombiaPayrollResult {
  employeeId: string;
  employeeName: string;
  taxId: string;
  periodDate: string; // ISO date

  // PERCEPCIONES (Devengos)
  baseSalaryEarned: number;
  auxTransporte: number;
  extraDiurnaValue: number;
  extraNocturnaValue: number;
  recargoNocturnoValue: number;
  otherBenefits: number;
  grossEarnings: number; // Total devengado

  // IBC Y APORTES
  ibc: number; // Ingreso Base de Cotización
  healthContribution: number; // Aporte salud empleado (4%)
  pensionContribution: number; // Aporte pensión empleado (4%)
  totalEmployeeDeductions: number;

  // NETO
  netPay: number;

  // COSTOS EMPLEADOR
  employerHealthContribution: number; // 8.5%
  employerPensionContribution: number; // 12%
  senaContribution: number; // 0.522%
  icbfContribution: number; // 4%
  provisionsDeduction: number; // Cesantías + Prima + Vacaciones
  totalEmployerCost: number;
}

// ============================================
// DIAN - NÓMINA ELECTRÓNICA
// ============================================

export interface DianEmployerInfo {
  companyName: string; // Razón social
  nit: string; // NIT (sin verificador)
  nitVerifier: string; // Dígito verificador
  address: string;
  city: string;
  department: string;
  country: string;
  email: string;
  phone?: string;
  industryCode?: string; // CIIU
  softwareProvider: {
    nit: string;
    name: string;
    pin: string;
  };
}

export interface DianEmployeeExtraInfo {
  departmentCode: string; // Código DANE departamento
  municipalityCode: string; // Código DANE municipio
  bank?: string;
  bankAccountType?: 'Ahorros' | 'Corriente';
  bankAccountNumber?: string;
  contractType: 'Indefinido' | 'Fijo' | 'Obra o Labor' | 'Aprendizaje' | 'Por Horas';
  workPosition: string;
  startDate: string; // ISO
  departmentName: string;
  entitlement?: {
    vacationDays?: number;
    bonusMonths?: number;
  };
}

export interface DianNominaXmlResult {
  success: boolean;
  xml: string; // XML completo
  cune: string; // CUNE (SHA-384)
  consecutiveNumber: number;
  validationErrors: string[];
  generatedAt: string; // ISO
  filename: string;
  fileSize: number;
}

// ============================================
// REQUEST/RESPONSE DE ENDPOINTS
// ============================================

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

// ============================================
// HELPERS Y CONVERSIONES
// ============================================

/**
 * Convierte Employee (BD) → ColombiaPayrollInput (Cálculo)
 * Útil cuando tienes un empleado guardado y quieres calcular su nómina
 */
export function employeeToColombiPayrollInput(
  employee: Employee,
  daysWorked: number,
  extraDiurna: number = 0,
  extraNocturna: number = 0,
  recargoNocturno: number = 0
): ColombiaPayrollInput {
  return {
    employeeId: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    taxId: employee.taxId,
    baseSalaryMonthly: employee.baseSalaryMonthly,
    daysWorked,
    extraDiurna,
    extraNocturna,
    recargoNocturno,
    isExempt114_1: employee.isExempt114_1,
  };
}

/**
 * Convierte ColombiaPayrollResult (Cálculo) → PayrollDetailConcept[] (BD)
 * Útil para guardar el desglose en la BD
 */
export function payrollResultToDetailConcepts(
  result: ColombiaPayrollResult
): PayrollDetailConcept[] {
  return [
    // INGRESOS
    {
      concept: 'Sueldo Básico',
      conceptType: 'earning',
      amount: result.baseSalaryEarned,
      taxable: true,
    },
    {
      concept: 'Auxilio de Transporte',
      conceptType: 'earning',
      amount: result.auxTransporte,
      taxable: false,
    },
    {
      concept: 'Extras Diurnas',
      conceptType: 'earning',
      amount: result.extraDiurnaValue,
      taxable: true,
    },
    {
      concept: 'Extras Nocturnas',
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
    // DEDUCCIONES
    {
      concept: 'Aporte Salud (4%)',
      conceptType: 'deduction',
      amount: result.healthContribution,
      taxable: false,
    },
    {
      concept: 'Aporte Pensión (4%)',
      conceptType: 'deduction',
      amount: result.pensionContribution,
      taxable: false,
    },
  ];
}

/**
 * Convierte Tenant (BD) → DianEmployerInfo (DIAN)
 * Útil para generar XML DIAN desde datos guardados
 */
export function tenantToDianEmployerInfo(
  tenant: Tenant,
  softwareProvider: { nit: string; name: string; pin: string }
): DianEmployerInfo {
  return {
    companyName: tenant.name,
    nit: tenant.taxId.split('-')[0] || tenant.taxId, // Remover verificador si lo tiene
    nitVerifier: calculateNitVerifier(tenant.taxId),
    address: tenant.address || '',
    city: tenant.city || 'Bogotá',
    department: tenant.department || 'Cundinamarca',
    country: tenant.country || 'CO',
    email: tenant.email || '',
    phone: tenant.phone,
    industryCode: tenant.industryCode,
    softwareProvider,
  };
}

// ============================================
// VALIDACIONES
// ============================================

export function validateEmployee(employee: Employee): string[] {
  const errors: string[] = [];
  if (!employee.id) errors.push('id requerido');
  if (!employee.firstName) errors.push('firstName requerido');
  if (!employee.lastName) errors.push('lastName requerido');
  if (!employee.taxId) errors.push('taxId requerido');
  if (employee.baseSalaryMonthly <= 0)
    errors.push('baseSalaryMonthly debe ser > 0');
  return errors;
}

export function validatePayrollInput(input: ColombiaPayrollInput): string[] {
  const errors: string[] = [];
  if (!input.employeeId) errors.push('employeeId requerido');
  if (!input.firstName) errors.push('firstName requerido');
  if (!input.lastName) errors.push('lastName requerido');
  if (!input.taxId) errors.push('taxId requerido');
  if (input.baseSalaryMonthly <= 0)
    errors.push('baseSalaryMonthly debe ser > 0');
  if (input.daysWorked < 1 || input.daysWorked > 30)
    errors.push('daysWorked entre 1-30');
  return errors;
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Calcula dígito verificador del NIT según DIAN
 */
export function calculateNitVerifier(nit: string): string {
  const weights = [3, 7, 13, 17, 19, 23, 29, 31, 37];
  const cleanNit = nit.replace(/[^0-9]/g, '').slice(0, 9);
  const reversedNit = cleanNit.split('').reverse();
  let sum = 0;

  for (let i = 0; i < reversedNit.length; i++) {
    sum += parseInt(reversedNit[i]) * weights[i];
  }

  const remainder = sum % 11;
  const verifier = remainder === 0 ? '0' : remainder === 1 ? '9' : String(11 - remainder);

  return verifier;
}

/**
 * Formatea a moneda COP
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Obtiene fecha actual en ISO
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}
