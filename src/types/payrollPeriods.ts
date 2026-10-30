/**
 * TIPOS — NÓMINA PERSISTENTE (periodos y liquidaciones)
 *
 * Antes, calcular una nómina no guardaba nada: el resultado vivía
 * sólo en memoria del navegador hasta generar el XML en el mismo
 * instante. Estos tipos representan lo que ahora sí se persiste:
 * el periodo de nómina de una empresa, y la liquidación de cada
 * empleado dentro de ese periodo (con su estado frente a la DIAN).
 */

export type PayrollPeriodStatus = 'DRAFT' | 'CLOSED';

export interface PayrollPeriod {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollPeriodStatus;
  createdAt?: string | null;
  closedAt?: string | null;
}

export type DianSettlementStatus = 'PENDING' | 'GENERATED';

export interface PayrollSettlement {
  id: string;
  periodId: string;
  employeeId: string;
  companyId: string;

  daysWorked: number;
  extraDiurna: number;
  extraNocturna: number;
  recargoNocturno: number;

  grossEarnings: number;
  totalDeductions: number;
  netPay: number;

  dianStatus: DianSettlementStatus;
  dianConsecutive?: number | null;
  dianCune?: string | null;
  dianGeneratedAt?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;
}
