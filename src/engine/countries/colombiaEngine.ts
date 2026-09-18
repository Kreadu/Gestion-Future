/**
 * TIPOS Y INTERFACES PARA API DE NÓMINA COLOMBIA 2026
 */

// ============================================
// INPUT: Datos del Empleado
// ============================================
export interface ColombiaEmployeeInput {
  employeeId: string; // ID único del empleado (ej: EMP-001)
  firstName: string; // Nombre
  lastName: string; // Apellido
  taxId: string; // Cédula / NIT (ej: 1098765432)
  baseSalaryMonthly: number; // Salario base mensual en COP
  daysWorked: number; // Días trabajados en el período (1-30)
  extraDiurna: number; // Horas extras diurnas (+25%)
  extraNocturna: number; // Horas extras nocturnas (+75%)
  recargoNocturno: number; // Recargo nocturno en horas (+35%)
  isExempt114_1?: boolean; // Exención Art. 114-1 LFT (opcional)
}

// ============================================
// OUTPUT: Resultado de Cálculo de Nómina
// ============================================
export interface PayrollResult {
  employeeId: string;
  employeeName: string;
  taxId: string;
  periodDate: string; // ISO date
  daysWorked: number;

  // DEVENGOS (Percepciones)
  baseSalaryEarned: number; // Sueldo básico devengado
  auxTransporte: number; // Auxilio de transporte
  extraDiurnaValue: number; // Valor horas extras diurnas
  extraNocturnaValue: number; // Valor horas extras nocturnas
  recargoNocturnoValue: number; // Valor recargo nocturno
  otherBenefits: number; // Otros beneficios
  grossEarnings: number; // Total devengado

  // IBC Y APORTES
  ibc: number; // Ingreso Base de Cotización
  healthContribution: number; // Aporte salud (4%)
  pensionContribution: number; // Aporte pensión (4%)
  totalEmployeeDeductions: number; // Total deducciones empleado

  // NETO
  netPay: number; // Neto a pagar

  // COSTOS EMPLEADOR
  employerHealthContribution: number; // Aporte salud empleador (8.5%)
  employerPensionContribution: number; // Aporte pensión empleador (12%)
  senaContribution: number; // Aporte SENA (0.522%)
  icbfContribution: number; // Aporte ICBF (4%)
  provisionsDeduction: number; // Provisión de cesantías, prima, vacaciones
  totalEmployerCost: number; // Costo total empleador
}

// ============================================
// DIAN: Información del Empleador
// ============================================
export interface DianEmployerInfo {
  companyName: string; // Razón social
  nit: string; // NIT (sin dígito verificador)
  nitVerifier: string; // Dígito verificador NIT
  address: string; // Dirección
  city: string; // Ciudad
  department: string; // Departamento
  country: string; // País (ej: CO)
  email: string; // Email
  phone?: string; // Teléfono
  industryCode?: string; // Código CIIU
  softwareProvider: {
    nit: string; // NIT del proveedor de software
    name: string; // Nombre proveedor
    pin: string; // PIN del software
  };
}

// ============================================
// DIAN: Información Adicional del Empleado
// ============================================
export interface DianEmployeeExtraInfo {
  departmentCode: string; // Código DANE del departamento
  municipalityCode: string; // Código DANE del municipio
  bank?: string; // Banco para transferencia
  bankAccountType?: 'Ahorros' | 'Corriente'; // Tipo de cuenta
  bankAccountNumber?: string; // Número de cuenta
  contractType:
    | 'Indefinido'
    | 'Fijo'
    | 'Obra o Labor'
    | 'Aprendizaje'
    | 'Por Horas';
  workPosition: string; // Cargo del empleado
  startDate: string; // Fecha de inicio (ISO)
  departmentName: string; // Nombre del departamento interno
  entitlement?: {
    // Derecho a prestaciones sociales
    vacationDays?: number;
    bonusMonths?: number;
  };
}

// ============================================
// DIAN: Resultado XML de Nómina Electrónica
// ============================================
export interface DianNominaXmlResult {
  success: boolean;
  xml: string; // XML completo en formato string
  cune: string; // CUNE (SHA-384 de referencia)
  consecutiveNumber: number; // Número consecutivo
  validationErrors: string[]; // Array de errores de validación
  generatedAt: string; // ISO timestamp
  filename: string; // Nombre sugerido del archivo
  fileSize: number; // Tamaño en bytes
}

// ============================================
// EJEMPLOS DE REQUESTS/RESPONSES
// ============================================

export const EXAMPLE_EMPLOYEE_INPUT: ColombiaEmployeeInput = {
  employeeId: 'EMP-001',
  firstName: 'Juan',
  lastName: 'Pérez García',
  taxId: '1234567890',
  baseSalaryMonthly: 1750905, // 1 SMMLV 2026
  daysWorked: 30,
  extraDiurna: 4,
  extraNocturna: 2,
  recargoNocturno: 10,
  isExempt114_1: false,
};

export const EXAMPLE_EMPLOYER_INFO: DianEmployerInfo = {
  companyName: 'Empresa Ejemplo S.A.S.',
  nit: '900123456',
  nitVerifier: '1',
  address: 'Cra. 10 # 20-30',
  city: 'Bogotá',
  department: 'Cundinamarca',
  country: 'CO',
  email: 'nominaelectronica@empresa.com',
  phone: '+57 1 2345678',
  industryCode: '6209',
  softwareProvider: {
    nit: '800123456',
    name: 'Gestión-Future Software',
    pin: 'gf-2024-001',
  },
};

export const EXAMPLE_EMPLOYEE_EXTRA_INFO: DianEmployeeExtraInfo = {
  departmentCode: '08001', // Bogotá
  municipalityCode: '08001000', // Bogotá
  bank: 'Banco Colombiano',
  bankAccountType: 'Corriente',
  bankAccountNumber: '123456789',
  contractType: 'Indefinido',
  workPosition: 'Desarrollador Senior',
  startDate: '2023-01-15',
  departmentName: 'Tecnología',
  entitlement: {
    vacationDays: 15,
    bonusMonths: 2,
  },
};

// ============================================
// HELPERS Y UTILIDADES
// ============================================

/**
 * Calcula el dígito verificador del NIT según algoritmo DIAN
 */
export function calculateNitVerifier(nit: string): string {
  const weights = [3, 7, 13, 17, 19, 23, 29, 31, 37];
  const reversedNit = nit.split('').reverse();
  let sum = 0;

  for (let i = 0; i < reversedNit.length; i++) {
    sum += parseInt(reversedNit[i]) * weights[i];
  }

  const remainder = sum % 11;
  const verifier = remainder === 0 ? '0' : remainder === 1 ? '9' : String(11 - remainder);

  return verifier;
}

/**
 * Valida formato de NIT
 */
export function validateNit(nit: string): boolean {
  return /^\d{8,11}$/.test(nit);
}

/**
 * Valida formato de cédula de identidad
 */
export function validateTaxId(taxId: string): boolean {
  return /^\d{8,12}$/.test(taxId);
}

/**
 * Calcula CUNE (Código Único de Nómina Electrónica)
 * Basado en SHA-384 del documento
 */
export async function calculateCUNE(xmlContent: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(xmlContent);
  const hashBuffer = await crypto.subtle.digest('SHA-384', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 40); // Primeros 40 caracteres
}

/**
 * Genera fecha en formato ISO
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Formatea número a moneda COP
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Valida input de empleado
 */
export function validateEmployeeInput(input: ColombiaEmployeeInput): string[] {
  const errors: string[] = [];

  if (!input.employeeId) errors.push('employeeId es requerido');
  if (!input.firstName) errors.push('firstName es requerido');
  if (!input.lastName) errors.push('lastName es requerido');
  if (!input.taxId) errors.push('taxId es requerido');
  if (input.baseSalaryMonthly <= 0)
    errors.push('baseSalaryMonthly debe ser mayor a 0');
  if (input.daysWorked < 1 || input.daysWorked > 30)
    errors.push('daysWorked debe estar entre 1 y 30');
  if (input.extraDiurna < 0) errors.push('extraDiurna no puede ser negativo');
  if (input.extraNocturna < 0) errors.push('extraNocturna no puede ser negativo');
  if (input.recargoNocturno < 0)
    errors.push('recargoNocturno no puede ser negativo');

  return errors;
}
