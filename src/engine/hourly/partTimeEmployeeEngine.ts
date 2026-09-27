/**
 * MOTOR DE CÁLCULO — EMPLEADO DE JORNADA PARCIAL (POR HORAS)
 *
 * Un empleado de jornada parcial es, legalmente, un empleado más:
 * tiene contrato de trabajo, seguridad social compartida
 * empleado/empleador, parafiscales, y todas las prestaciones
 * sociales (cesantías, prima, vacaciones), sólo que proporcionales
 * a las horas realmente trabajadas en vez de a 30 días de mes.
 *
 * Reutiliza las mismas tasas de CONSTANTS_2026 que
 * ColombiaPayrollEngine (nómina mensual tradicional) y devuelve un
 * resultado con la misma forma (ColombiaPayrollResult) para poder
 * generar el XML de Nómina Electrónica con el mismo
 * DianNominaXmlService ya existente.
 */

import { CONSTANTS_2026 } from '../countries/constants2026';
import { RiskClass, type ColombiaPayrollResult } from '../../types/payroll';
import type { PartTimeEmployeeInput } from '../../types/hourly';

// ============================================================
// JORNADA LEGAL EQUIVALENTE
// ============================================================

/**
 * Horas legales de un mes, derivadas de la jornada semanal máxima
 * (Ley 2101 de 2021) con el método de conversión semana→mes usado
 * habitualmente en nómina colombiana (semana × 30 / 7).
 */
export const MONTHLY_LEGAL_HOURS =
  CONSTANTS_2026.LEGAL_WEEKLY_HOURS * (30 / 7);

/**
 * Salario mínimo legal por hora, derivado del SMMLV y de la jornada
 * legal mensual vigente. Ningún `hourlyRate` puede estar por debajo
 * de este valor.
 */
export const MIN_HOURLY_WAGE =
  CONSTANTS_2026.SMMLV / MONTHLY_LEGAL_HOURS;

export class PartTimeEmployeeEngineError extends Error {}

export class PartTimeEmployeeEngine {

  private static calculateFspRate(ibc: number): number {
    const smmlvCount = ibc / CONSTANTS_2026.SMMLV;

    if (smmlvCount < 4) return 0;
    if (smmlvCount < 16) return 0.01;
    if (smmlvCount < 17) return 0.012;
    if (smmlvCount < 18) return 0.014;
    if (smmlvCount < 19) return 0.016;
    if (smmlvCount < 20) return 0.018;

    return 0.02;
  }

  static calculate(
    input: PartTimeEmployeeInput
  ): ColombiaPayrollResult {

    const round = (value: number): number =>
      Math.round(value * 100) / 100;

    // --------------------------------------------------------
    // VALIDACIONES LEGALES
    // --------------------------------------------------------

    if (input.weeklyHours <= 0 || input.weeklyHours > CONSTANTS_2026.LEGAL_WEEKLY_HOURS) {
      throw new PartTimeEmployeeEngineError(
        `Las horas semanales deben estar entre 1 y ${CONSTANTS_2026.LEGAL_WEEKLY_HOURS} ` +
        `(jornada máxima legal vigente desde el 15 de julio de 2026, Ley 2101 de 2021).`
      );
    }

    if (input.hourlyRate < MIN_HOURLY_WAGE) {
      throw new PartTimeEmployeeEngineError(
        `La tarifa por hora ($${round(input.hourlyRate)}) está por debajo del ` +
        `salario mínimo legal por hora ($${round(MIN_HOURLY_WAGE)}).`
      );
    }

    if (input.hoursWorked < 0) {
      throw new PartTimeEmployeeEngineError(
        'Las horas trabajadas no pueden ser negativas.'
      );
    }

    // --------------------------------------------------------
    // DEVENGADOS
    // --------------------------------------------------------

    const baseSalaryEarned =
      input.hourlyRate * input.hoursWorked;

    /*
     * Salario mensual equivalente (proyectado a jornada completa
     * dentro de sus horas semanales pactadas) para decidir si aplica
     * auxilio de transporte, igual umbral que en nómina mensual.
     */
    const monthlyEquivalentSalary =
      input.hourlyRate * MONTHLY_LEGAL_HOURS;

    let earnedAuxTransporte = 0;

    if (monthlyEquivalentSalary <= CONSTANTS_2026.SMMLV_LIMIT_AUX) {
      earnedAuxTransporte =
        (CONSTANTS_2026.AUXILIO_TRANSPORTE / MONTHLY_LEGAL_HOURS) *
        input.hoursWorked;
    }

    const grossEarnings =
      baseSalaryEarned + earnedAuxTransporte;

    // El auxilio de transporte no hace parte del IBC.
    const ibcSecuritySocial = baseSalaryEarned;

    // --------------------------------------------------------
    // DEDUCCIONES TRABAJADOR
    // --------------------------------------------------------

    const health4pct =
      ibcSecuritySocial * CONSTANTS_2026.HEALTH_EMPLOYEE;

    const pension4pct =
      ibcSecuritySocial * CONSTANTS_2026.PENSION_EMPLOYEE;

    const fspPct = this.calculateFspRate(ibcSecuritySocial);
    const fspValue = ibcSecuritySocial * fspPct;

    const totalDeductions =
      health4pct + pension4pct + fspValue;

    const netPay = grossEarnings - totalDeductions;

    // --------------------------------------------------------
    // APORTES EMPLEADOR
    // --------------------------------------------------------

    const isExempt = input.isExempt114_1 ?? false;
    const arlRate = input.riskClass ?? RiskClass.CLASS_I;

    const health8_5pct =
      isExempt ? 0 : ibcSecuritySocial * CONSTANTS_2026.HEALTH_EMPLOYER;

    const pension12pct =
      ibcSecuritySocial * CONSTANTS_2026.PENSION_EMPLOYER;

    // El ARL nunca se prorratea por horas: cubre el riesgo mientras
    // dura la exposición, no es proporcional al tiempo trabajado.
    const arlValue = ibcSecuritySocial * arlRate;

    const sena2pct =
      isExempt ? 0 : ibcSecuritySocial * CONSTANTS_2026.SENA;

    const icbf3pct =
      isExempt ? 0 : ibcSecuritySocial * CONSTANTS_2026.ICBF;

    const ccf4pct =
      ibcSecuritySocial * CONSTANTS_2026.CCF;

    const totalContributions =
      health8_5pct + pension12pct + arlValue + sena2pct + icbf3pct + ccf4pct;

    // --------------------------------------------------------
    // PROVISIONES
    // --------------------------------------------------------

    const cesantias = grossEarnings * CONSTANTS_2026.CESANTIAS_RATE;
    const interesesCesantias = cesantias * CONSTANTS_2026.INTERESES_CESANTIAS_RATE;
    const primaServicios = grossEarnings * CONSTANTS_2026.PRIMA_RATE;
    const vacaciones = ibcSecuritySocial * CONSTANTS_2026.VACACIONES_RATE;

    const totalProvisions =
      cesantias + interesesCesantias + primaServicios + vacaciones;

    // --------------------------------------------------------
    // NOMBRE Y "DÍAS" EQUIVALENTES (para el XML de nómina)
    // --------------------------------------------------------

    const fullName = [
      input.firstName,
      input.firstName2,
      input.lastName,
      input.lastName2,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');

    /*
     * El esquema de Nómina Electrónica de la DIAN expresa
     * `TiempoLaborado` en días. Para un empleado por horas se usa un
     * equivalente (horas trabajadas / horas legales por día), sólo
     * para ese campo del XML — el cálculo económico real siempre se
     * hace por horas. Revisar con el contador el tratamiento exacto
     * que da la DIAN a trabajadores por horas antes de producción.
     */
    const legalDailyHours = CONSTANTS_2026.LEGAL_WEEKLY_HOURS / 7;
    const daysWorkedEquivalent = Math.round(input.hoursWorked / legalDailyHours);

    return {
      companyId: input.companyId,
      employeeId: input.engagementId,
      employeeName: fullName,

      firstName: input.firstName,
      firstName2: input.firstName2,
      lastName: input.lastName,
      lastName2: input.lastName2,

      taxId: input.taxId,

      periodDate: new Date().toISOString().split('T')[0],

      daysWorked: daysWorkedEquivalent,

      baseSalaryEarned: round(baseSalaryEarned),
      earnedAuxTransporte: round(earnedAuxTransporte),
      extraDiurnaValue: 0,
      extraNocturnaValue: 0,
      recargoNocturnoValue: 0,
      overtimeTotal: 0,
      grossEarnings: round(grossEarnings),

      ibcSecuritySocial: round(ibcSecuritySocial),

      employeeDeductions: {
        health4pct: round(health4pct),
        pension4pct: round(pension4pct),
        fspPct,
        fspValue: round(fspValue),
        fsp: round(fspValue),
        totalDeductions: round(totalDeductions),
      },

      netPay: round(netPay),

      employerContributions: {
        health8_5pct: round(health8_5pct),
        pension12pct: round(pension12pct),
        arlValue: round(arlValue),
        sena2pct: round(sena2pct),
        icbf3pct: round(icbf3pct),
        ccf4pct: round(ccf4pct),
        totalContributions: round(totalContributions),
      },

      provisions: {
        cesantias: round(cesantias),
        interesesCesantias: round(interesesCesantias),
        primaServicios: round(primaServicios),
        vacaciones: round(vacaciones),
        totalProvisions: round(totalProvisions),
      },

      hourlyRate: round(input.hourlyRate),
    };
  }
}

export default PartTimeEmployeeEngine;
