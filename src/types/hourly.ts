/**
 * TIPOS - MÓDULO "PERSONAL POR HORAS"
 *
 * Bolsa de talento compartida entre empresas: profesionales
 * (identidad única) vinculados a empresas cliente mediante
 * `engagements`, bajo dos modalidades activas:
 *
 * - INDEPENDENT_SERVICES: contratista independiente (prestación de
 *   servicios), sin subordinación.
 * - PART_TIME_EMPLOYEE: empleado de jornada parcial, con contrato
 *   laboral real y prestaciones proporcionales a las horas.
 *
 * EST_MISSION (trabajador en misión vía Empresa de Servicios
 * Temporales) está contemplado en el modelo de datos pero
 * deshabilitado a nivel de API hasta que la empresa confirme tener
 * la autorización del Ministerio del Trabajo.
 */

import type { RiskClass } from './payroll';

export type VinculationType =
  | 'INDEPENDENT_SERVICES'
  | 'PART_TIME_EMPLOYEE'
  | 'EST_MISSION';

export type RetentionConcept = 'SERVICIOS' | 'HONORARIOS';

// ============================================================
// ENTIDADES (formas normalizadas, tal como las devuelve la API)
// ============================================================

export interface Professional {
  id: string;
  firstName: string;
  firstName2?: string | null;
  lastName: string;
  lastName2?: string | null;
  taxId: string;
  profession: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  bankName?: string | null;
  bankAccountType?: string | null;
  bankAccountNumber?: string | null;
  active: boolean;
  createdAt?: string | null;
}

/**
 * Versión pública (sin datos de contacto ni bancarios) que se
 * devuelve cuando quien consulta no tiene un engagement propio con
 * ese profesional — ver `GET /api/professionals`.
 */
export interface PublicProfessional {
  id: string;
  firstName: string;
  lastName: string;
  profession: string;
  city?: string | null;
}

export interface Engagement {
  id: string;
  professionalId: string;
  companyId: string;
  vinculationType: VinculationType;

  hourlyRate: number;
  startDate: string;
  endDate?: string | null;
  active: boolean;

  // Sólo INDEPENDENT_SERVICES
  retentionConcept?: RetentionConcept | null;
  isIncomeTaxFiler?: boolean | null;
  deliverableDescription?: string | null;

  // Sólo PART_TIME_EMPLOYEE
  weeklyHours?: number | null;
  contractType?: string | null;

  createdAt?: string | null;
}

export interface TimeEntry {
  id: string;
  engagementId: string;
  periodStart: string;
  periodEnd: string;
  hours: number;
  notes?: string | null;
  createdAt?: string | null;
}

export interface PilaVerification {
  id: string;
  engagementId: string;
  period: string;
  declaredIbc: number;
  verified: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  planillaReference?: string | null;
  createdAt?: string | null;
}

export interface Settlement {
  id: string;
  engagementId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  grossAmount: number;
  retentionAmount: number;
  netAmount: number;
  createdAt?: string | null;
}

// ============================================================
// MOTOR — EMPLEADO DE JORNADA PARCIAL
// ============================================================

export interface PartTimeEmployeeInput {
  companyId: string;
  engagementId: string;
  professionalId: string;

  firstName: string;
  firstName2?: string;
  lastName: string;
  lastName2?: string;
  taxId: string;

  hourlyRate: number;
  weeklyHours: number;
  hoursWorked: number;

  riskClass?: RiskClass;
  isExempt114_1?: boolean;
}

// ============================================================
// MOTOR — CONTRATISTA INDEPENDIENTE
// ============================================================

export interface IndependentContractorInput {
  companyId: string;
  engagementId: string;
  professionalId: string;

  firstName: string;
  firstName2?: string;
  lastName: string;
  lastName2?: string;
  taxId: string;

  hourlyRate: number;
  hoursWorked: number;

  retentionConcept: RetentionConcept;
  isIncomeTaxFiler: boolean;
}

export interface IndependentContractorResult {
  companyId: string;
  engagementId: string;
  professionalId: string;

  professionalName: string;
  taxId: string;

  periodDate: string;

  hoursWorked: number;
  hourlyRate: number;

  grossAmount: number;

  retentionConcept: RetentionConcept;
  retentionRate: number;
  retentionAmount: number;

  netAmount: number;

  /**
   * IBC mínimo sugerido para que el contratista cotice su propia
   * seguridad social (40% del bruto, piso de 1 SMMLV). Informativo:
   * el pago de este aporte lo hace el contratista, no nosotros.
   */
  suggestedMinimumIbc: number;
}

// ============================================================
// DIAN — DOCUMENTO SOPORTE (PAGOS A NO OBLIGADOS A FACTURAR)
// ============================================================

export interface DocumentoSoportePayerInfo {
  nit: string;
  dv: string;
  companyName: string;
  softwareId: string;
  pinSoftware: string;
}

export interface DocumentoSoporteBeneficiaryInfo {
  /**
   * 13 = Cédula de ciudadanía, 31 = NIT, 22 = Cédula de extranjería,
   * 41 = Pasaporte, 42 = Documento extranjero.
   */
  typeDocument: '13' | '31' | '22' | '41' | '42';
  concept: RetentionConcept;
}

export interface DocumentoSoporteResult {
  /**
   * Código único del documento, calculado con la misma estrategia
   * (hash SHA-384 de los campos clave) que el CUNE de nómina
   * electrónica. NO es el "CUDS" oficial de la DIAN para este tipo
   * de documento: no se ha validado contra el anexo técnico oficial.
   */
  documentKey: string;
  consecutive: string;
  issueDate: string;
  issueTime: string;
  xmlContent: string;
  grossAmount: number;
  retentionAmount: number;
  netAmount: number;
  disclaimer: string;
}
