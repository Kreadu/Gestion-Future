/**
 * MOTOR DE CÁLCULO DE NÓMINA COLOMBIA 2026
 *
 * La definición de tipos está centralizada en:
 *
 * src/types/payroll.ts
 *
 * Este archivo contiene únicamente:
 * - constantes
 * - reglas de cálculo
 * - motor de nómina
 */

import {
  ColombiaPayrollInput,
  ColombiaPayrollResult,
  RiskClass,
} from '../../types/payroll';

// ============================================================
// CONSTANTES COLOMBIA 2026
// ============================================================

export const CONSTANTS_2026 = {
  SMMLV: 1_750_905,

  AUXILIO_TRANSPORTE: 249_095,

  SMMLV_LIMIT_AUX:
    2 * 1_750_905,

  /**
   * Jornada mensual utilizada para cálculo
   * de valor hora.
   */
  MONTHLY_ORDINARY_HOURS: 210,

  EXTRA_DIURNA_MULTIPLIER: 1.25,

  EXTRA_NOCTURNA_MULTIPLIER: 1.75,

  RECARGO_NOCTURNO_FACTOR: 0.35,

  HEALTH_EMPLOYEE: 0.04,

  PENSION_EMPLOYEE: 0.04,

  HEALTH_EMPLOYER: 0.085,

  PENSION_EMPLOYER: 0.12,

  SENA: 0.02,

  ICBF: 0.03,

  CCF: 0.04,

  CESANTIAS_RATE:
    1 / 12,

  INTERESES_CESANTIAS_RATE:
    0.01,

  PRIMA_RATE:
    1 / 12,

  VACACIONES_RATE:
    1 / 24,
};

// ============================================================
// MOTOR
// ============================================================

export class ColombiaPayrollEngine {

  // ==========================================================
  // FONDO DE SOLIDARIDAD PENSIONAL
  // ==========================================================

  private static calculateFspRate(
    ibc: number
  ): number {

    const smmlvCount =
      ibc /
      CONSTANTS_2026.SMMLV;

    if (smmlvCount < 4) {
      return 0;
    }

    if (smmlvCount < 16) {
      return 0.01;
    }

    if (smmlvCount < 17) {
      return 0.012;
    }

    if (smmlvCount < 18) {
      return 0.014;
    }

    if (smmlvCount < 19) {
      return 0.016;
    }

    if (smmlvCount < 20) {
      return 0.018;
    }

    return 0.02;
  }

  // ==========================================================
  // CÁLCULO PRINCIPAL
  // ==========================================================

  static calculate(
    input: ColombiaPayrollInput
  ): ColombiaPayrollResult {

    // --------------------------------------------------------
    // NORMALIZACIÓN
    // --------------------------------------------------------

    const baseSalary =
      Number(input.baseSalaryMonthly) || 0;

    const daysWorkedRaw =
      Number(input.daysWorked);

    const daysWorked =
      Number.isFinite(daysWorkedRaw) &&
      daysWorkedRaw >= 1 &&
      daysWorkedRaw <= 30
        ? Math.floor(daysWorkedRaw)
        : 30;

    // --------------------------------------------------------
    // SALARIO BÁSICO
    // --------------------------------------------------------

    const baseSalaryEarned =
      (baseSalary / 30) *
      daysWorked;

    // --------------------------------------------------------
    // AUXILIO DE TRANSPORTE
    // --------------------------------------------------------

    let earnedAuxTransporte = 0;

    if (
      baseSalary <=
      CONSTANTS_2026.SMMLV_LIMIT_AUX
    ) {
      earnedAuxTransporte =
        (
          CONSTANTS_2026.AUXILIO_TRANSPORTE /
          30
        ) *
        daysWorked;
    }

    // --------------------------------------------------------
    // VALOR HORA
    // --------------------------------------------------------

    const hourlyRate =
      baseSalary /
      CONSTANTS_2026.MONTHLY_ORDINARY_HOURS;

    // --------------------------------------------------------
    // HORAS EXTRAS
    // --------------------------------------------------------

    const extraDiurnaHours =
      Number(
        input.extraDiurna ??
        input.overtimeHours?.extraDiurna ??
        0
      ) || 0;

    const extraNocturnaHours =
      Number(
        input.extraNocturna ??
        input.overtimeHours?.extraNocturna ??
        0
      ) || 0;

    const recargoNocturnoHours =
      Number(
        input.recargoNocturno ??
        input.overtimeHours?.recargoNocturno ??
        0
      ) || 0;

    // --------------------------------------------------------
    // VALOR HORAS EXTRAS
    // --------------------------------------------------------

    const extraDiurnaValue =
      extraDiurnaHours *
      hourlyRate *
      CONSTANTS_2026.EXTRA_DIURNA_MULTIPLIER;

    const extraNocturnaValue =
      extraNocturnaHours *
      hourlyRate *
      CONSTANTS_2026.EXTRA_NOCTURNA_MULTIPLIER;

    const recargoNocturnoValue =
      recargoNocturnoHours *
      hourlyRate *
      CONSTANTS_2026.RECARGO_NOCTURNO_FACTOR;

    const overtimeTotal =
      extraDiurnaValue +
      extraNocturnaValue +
      recargoNocturnoValue;

    // --------------------------------------------------------
    // TOTAL DEVENGADO
    // --------------------------------------------------------

    const grossEarnings =
      baseSalaryEarned +
      earnedAuxTransporte +
      overtimeTotal;

    // --------------------------------------------------------
    // IBC
    //
    // El auxilio de transporte no hace parte del IBC.
    // --------------------------------------------------------

    const ibcSecuritySocial =
      baseSalaryEarned +
      overtimeTotal;

    // --------------------------------------------------------
    // DEDUCCIONES TRABAJADOR
    // --------------------------------------------------------

    const health4pct =
      ibcSecuritySocial *
      CONSTANTS_2026.HEALTH_EMPLOYEE;

    const pension4pct =
      ibcSecuritySocial *
      CONSTANTS_2026.PENSION_EMPLOYEE;

    const fspPct =
      this.calculateFspRate(
        ibcSecuritySocial
      );

    const fspValue =
      ibcSecuritySocial *
      fspPct;

    const totalDeductions =
      health4pct +
      pension4pct +
      fspValue;

    const netPay =
      grossEarnings -
      totalDeductions;

    // --------------------------------------------------------
    // APORTES EMPLEADOR
    // --------------------------------------------------------

    const isExempt =
      input.isExempt114_1 ??
      false;

    const arlRate =
      input.riskClass ??
      RiskClass.CLASS_I;

    const health8_5pct =
      isExempt
        ? 0
        : ibcSecuritySocial *
          CONSTANTS_2026.HEALTH_EMPLOYER;

    const pension12pct =
      ibcSecuritySocial *
      CONSTANTS_2026.PENSION_EMPLOYER;

    const arlValue =
      ibcSecuritySocial *
      arlRate;

    const sena2pct =
      isExempt
        ? 0
        : ibcSecuritySocial *
          CONSTANTS_2026.SENA;

    const icbf3pct =
      isExempt
        ? 0
        : ibcSecuritySocial *
          CONSTANTS_2026.ICBF;

    const ccf4pct =
      ibcSecuritySocial *
      CONSTANTS_2026.CCF;

    const totalContributions =
      health8_5pct +
      pension12pct +
      arlValue +
      sena2pct +
      icbf3pct +
      ccf4pct;

    // --------------------------------------------------------
    // PROVISIONES
    // --------------------------------------------------------

    const cesantias =
      grossEarnings *
      CONSTANTS_2026.CESANTIAS_RATE;

    const interesesCesantias =
      cesantias *
      CONSTANTS_2026.INTERESES_CESANTIAS_RATE;

    const primaServicios =
      grossEarnings *
      CONSTANTS_2026.PRIMA_RATE;

    const vacaciones =
      ibcSecuritySocial *
      CONSTANTS_2026.VACACIONES_RATE;

    const totalProvisions =
      cesantias +
      interesesCesantias +
      primaServicios +
      vacaciones;

    // --------------------------------------------------------
    // REDONDEO
    // --------------------------------------------------------

    const round = (
      value: number
    ): number => {
      return Math.round(value * 100) / 100;
    };

    // --------------------------------------------------------
    // NOMBRE COMPLETO
    // --------------------------------------------------------

    const fullName = [
      input.firstName,
      input.firstName2,
      input.lastName,
      input.lastName2,
    ]
      .filter(
        (
          value
        ): value is string =>
          Boolean(value)
      )
      .join(' ');

    // --------------------------------------------------------
    // RESULTADO
    // --------------------------------------------------------

    return {
      companyId:
        input.companyId,

      employeeId:
        input.employeeId,

      employeeName:
        fullName,

      firstName:
        input.firstName,

      firstName2:
        input.firstName2,

      lastName:
        input.lastName,

      lastName2:
        input.lastName2,

      taxId:
        input.taxId,

      periodDate:
        new Date()
          .toISOString()
          .split('T')[0],

      daysWorked,

      // DEVENGADOS

      baseSalaryEarned:
        round(baseSalaryEarned),

      earnedAuxTransporte:
        round(earnedAuxTransporte),

      extraDiurnaValue:
        round(extraDiurnaValue),

      extraNocturnaValue:
        round(extraNocturnaValue),

      recargoNocturnoValue:
        round(recargoNocturnoValue),

      overtimeTotal:
        round(overtimeTotal),

      grossEarnings:
        round(grossEarnings),

      // IBC

      ibcSecuritySocial:
        round(ibcSecuritySocial),

      // DEDUCCIONES

      employeeDeductions: {
        health4pct:
          round(health4pct),

        pension4pct:
          round(pension4pct),

        fspPct,

        fspValue:
          round(fspValue),

        fsp:
          round(fspValue),

        totalDeductions:
          round(totalDeductions),
      },

      // NETO

      netPay:
        round(netPay),

      // EMPLEADOR

      employerContributions: {
        health8_5pct:
          round(health8_5pct),

        pension12pct:
          round(pension12pct),

        arlValue:
          round(arlValue),

        sena2pct:
          round(sena2pct),

        icbf3pct:
          round(icbf3pct),

        ccf4pct:
          round(ccf4pct),

        totalContributions:
          round(totalContributions),
      },

      // PROVISIONES

      provisions: {
        cesantias:
          round(cesantias),

        interesesCesantias:
          round(interesesCesantias),

        primaServicios:
          round(primaServicios),

        vacaciones:
          round(vacaciones),

        totalProvisions:
          round(totalProvisions),
      },

      hourlyRate:
        round(hourlyRate),
    };
  }
}

export default ColombiaPayrollEngine;