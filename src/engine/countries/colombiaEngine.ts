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

import { CONSTANTS_2026 } from './constants2026';

// Las constantes legales viven en constants2026.ts, compartidas con
// los motores de personal por horas (jornada parcial, contratistas
// independientes). Se re-exporta aquí para no romper importadores
// existentes de `CONSTANTS_2026` desde este módulo.
export { CONSTANTS_2026 };

export class ColombiaPayrollEngineError extends Error {}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
  // RETENCIÓN EN LA FUENTE (procedimiento 1, simplificado)
  //
  // IMPORTANTE: depuración simplificada — renta exenta general al
  // 25% sin el tope real de 240 UVT/mes, y sin modelar deducciones
  // por dependientes, intereses de vivienda ni aportes voluntarios.
  // Validar con el contador antes de usar para retenciones reales.
  // ==========================================================

  private static calculateRetentionEmployee(
    taxableIncome: number,
    mandatoryDeductions: number
  ): number {

    const ingresoGravable =
      Math.max(taxableIncome - mandatoryDeductions, 0);

    const rentaExenta =
      ingresoGravable *
      CONSTANTS_2026.RETENCION_EMPLEADOS_RENTA_EXENTA_PCT;

    const baseGravable =
      Math.max(ingresoGravable - rentaExenta, 0);

    const baseGravableUVT =
      baseGravable / CONSTANTS_2026.UVT;

    const table = CONSTANTS_2026.RETENCION_EMPLEADOS_TABLE;

    const tramo =
      table.find(t => baseGravableUVT <= t.hastaUVT) ??
      table[table.length - 1];

    const retentionUVT =
      (baseGravableUVT - tramo.desdeUVT) *
      tramo.tarifa +
      tramo.uvtBase;

    return Math.max(retentionUVT * CONSTANTS_2026.UVT, 0);
  }

  // ==========================================================
  // INCAPACIDADES Y LICENCIAS
  //
  // Incapacidad general (enfermedad común): 66.67% del salario
  // diario durante los primeros 90 días acumulados de incapacidad
  // continua, 50% entre el día 91 y 180 (nunca menos de 1 SMMLV
  // diario), y desde el día 181 no hay pago a cargo de la empresa
  // (pasa al Fondo de Pensiones). Incapacidad laboral (ARL) y
  // licencias de maternidad/paternidad: 100% del salario diario,
  // sin tramos, desde el día 1.
  // ==========================================================

  private static calculateLeaveValue(
    baseSalary: number,
    leave: NonNullable<ColombiaPayrollInput['leave']>
  ): number {

    const dailyRate = baseSalary / 30;

    if (leave.type !== 'GENERAL_INCAPACITY') {
      return leave.daysInPeriod * dailyRate;
    }

    const before = leave.accumulatedDaysBefore ?? 0;

    const dias90 = clamp(90 - before, 0, leave.daysInPeriod);
    const dias180 = clamp(
      180 - Math.max(before, 90),
      0,
      leave.daysInPeriod - dias90
    );

    const pisoDiario = CONSTANTS_2026.SMMLV / 30;

    return (
      dias90 * Math.max(dailyRate * 0.6667, pisoDiario) +
      dias180 * Math.max(dailyRate * 0.50, pisoDiario)
    );
    // Los días restantes (> 180 acumulados) no suman: no los paga
    // la empresa, pasan a cargo del Fondo de Pensiones.
  }

  /**
   * Cuánto del valor pagado por incapacidad/licencia es recobrable a
   * EPS/ARL. Sólo informativo: no afecta lo que recibe el empleado.
   */
  private static calculateReimbursableAmount(
    baseSalary: number,
    leaveValue: number,
    leave: NonNullable<ColombiaPayrollInput['leave']>
  ): number {

    if (leave.type !== 'GENERAL_INCAPACITY') {
      // Incapacidad laboral y licencias de maternidad/paternidad son
      // 100% recobrables desde el día 1.
      return leaveValue;
    }

    // Los primeros 2 días de la incapacidad general (posición
    // absoluta, no necesariamente los primeros días de ESTE
    // período) los asume el empleador y no son recobrables.
    const before = leave.accumulatedDaysBefore ?? 0;
    const dailyRate = baseSalary / 30;
    const pisoDiario = CONSTANTS_2026.SMMLV / 30;

    const diasNoRecobrables = clamp(2 - before, 0, leave.daysInPeriod);

    // Los días no recobrables siempre caen en el tramo del 66.67%
    // (2 < 90), así que se valoran con esa misma tarifa.
    const valorNoRecobrable =
      diasNoRecobrables * Math.max(dailyRate * 0.6667, pisoDiario);

    return Math.max(leaveValue - valorNoRecobrable, 0);
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

    // 0 días normales sólo es válido cuando hay una incapacidad/
    // licencia que cubre el resto del período (ej. licencia de
    // maternidad de mes completo). Sin `leave`, 0 sigue sin ser un
    // valor válido y cae al default de 30.
    const minDaysWorked = input.leave ? 0 : 1;

    const daysWorked =
      Number.isFinite(daysWorkedRaw) &&
      daysWorkedRaw >= minDaysWorked &&
      daysWorkedRaw <= 30
        ? Math.floor(daysWorkedRaw)
        : 30;

    if (
      input.leave &&
      daysWorked + input.leave.daysInPeriod > 30
    ) {
      throw new ColombiaPayrollEngineError(
        'Los días trabajados y los días de incapacidad/licencia del ' +
        'período no pueden sumar más de 30.'
      );
    }

    const isIntegralSalary =
      input.isIntegralSalary ?? false;

    if (isIntegralSalary) {
      const minIntegralSalary =
        CONSTANTS_2026.SMMLV *
        CONSTANTS_2026.INTEGRAL_SALARY_MIN_SMMLV_MULTIPLE;

      if (baseSalary < minIntegralSalary) {
        throw new ColombiaPayrollEngineError(
          `El salario integral debe ser de al menos ` +
          `${CONSTANTS_2026.INTEGRAL_SALARY_MIN_SMMLV_MULTIPLE} SMMLV ` +
          `($${minIntegralSalary.toLocaleString('es-CO')}).`
        );
      }
    }

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
    // HORAS DOMINICALES/FESTIVAS (Ley 2466 de 2025)
    //
    // No se modela la combinación nocturna + dominical/festiva
    // simultáneas: quien liquide debe ajustar manualmente ese caso.
    // --------------------------------------------------------

    const horasDominicalFestivo =
      Number(input.horasDominicalFestivo ?? 0) || 0;

    const horasExtraDominicalFestivo =
      Number(input.horasExtraDominicalFestivo ?? 0) || 0;

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

    // Horas ordinarias en domingo/festivo: sólo el recargo (90%).
    const dominicalFestivoOrdinarioValue =
      horasDominicalFestivo *
      hourlyRate *
      CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE;

    // Horas extra en domingo/festivo: los recargos se suman
    // (25% de extra diurna + 90% dominical/festivo), no se
    // multiplican — así lo trata el Ministerio de Trabajo.
    const dominicalFestivoExtraValue =
      horasExtraDominicalFestivo *
      hourlyRate *
      (
        (CONSTANTS_2026.EXTRA_DIURNA_MULTIPLIER - 1) +
        CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE
      );

    const dominicalFestivoValue =
      dominicalFestivoOrdinarioValue +
      dominicalFestivoExtraValue;

    const overtimeTotal =
      extraDiurnaValue +
      extraNocturnaValue +
      recargoNocturnoValue;

    // --------------------------------------------------------
    // INCAPACIDAD / LICENCIA
    // --------------------------------------------------------

    const leaveValue =
      input.leave
        ? this.calculateLeaveValue(baseSalary, input.leave)
        : 0;

    const reimbursableAmount =
      input.leave
        ? this.calculateReimbursableAmount(baseSalary, leaveValue, input.leave)
        : 0;

    // --------------------------------------------------------
    // TOTAL DEVENGADO
    // --------------------------------------------------------

    const grossEarnings =
      baseSalaryEarned +
      earnedAuxTransporte +
      overtimeTotal +
      dominicalFestivoValue +
      leaveValue;

    // --------------------------------------------------------
    // IBC
    //
    // El auxilio de transporte no hace parte del IBC. Para salario
    // integral, el IBC es el 70% del devengado (art. 132 CST). Tope
    // de 25 SMMLV en cualquier caso; piso de 1 SMMLV sólo si el
    // período es completo (30 días) y no es salario integral — con
    // novedades el IBC proporcional puede ser legítimamente menor.
    // --------------------------------------------------------

    let ibcUncapped =
      baseSalaryEarned +
      overtimeTotal +
      dominicalFestivoValue +
      leaveValue;

    if (isIntegralSalary) {
      ibcUncapped =
        ibcUncapped *
        CONSTANTS_2026.INTEGRAL_SALARY_IBC_FACTOR;
    }

    const ibcMax =
      CONSTANTS_2026.SMMLV *
      CONSTANTS_2026.IBC_MAX_SMMLV_MULTIPLE;

    let ibcSecuritySocial =
      Math.min(ibcUncapped, ibcMax);

    const daysCoveredInPeriod =
      daysWorked + (input.leave?.daysInPeriod ?? 0);

    if (daysCoveredInPeriod === 30 && !isIntegralSalary) {
      ibcSecuritySocial =
        Math.max(ibcSecuritySocial, CONSTANTS_2026.SMMLV);
    }

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

    const mandatoryDeductions =
      health4pct +
      pension4pct +
      fspValue;

    // El auxilio de transporte no es ingreso gravable para efectos
    // de retención en la fuente.
    const retencionFuente =
      this.calculateRetentionEmployee(
        grossEarnings - earnedAuxTransporte,
        mandatoryDeductions
      );

    const totalDeductions =
      mandatoryDeductions +
      retencionFuente;

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
    //
    // El salario integral ya incluye el factor prestacional (30%):
    // no se provisionan cesantías/prima/vacaciones aparte.
    // --------------------------------------------------------

    const cesantias =
      isIntegralSalary
        ? 0
        : grossEarnings * CONSTANTS_2026.CESANTIAS_RATE;

    const interesesCesantias =
      isIntegralSalary
        ? 0
        : cesantias * CONSTANTS_2026.INTERESES_CESANTIAS_RATE;

    const primaServicios =
      isIntegralSalary
        ? 0
        : grossEarnings * CONSTANTS_2026.PRIMA_RATE;

    const vacaciones =
      isIntegralSalary
        ? 0
        : ibcSecuritySocial * CONSTANTS_2026.VACACIONES_RATE;

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
    // ADVERTENCIAS DE CUMPLIMIENTO
    // --------------------------------------------------------

    const complianceNotes: string[] = [];

    if (retencionFuente > 0) {
      complianceNotes.push(
        'Retención en la fuente calculada con una depuración ' +
        'simplificada (25% de renta exenta general, sin el tope ' +
        'real de 240 UVT/mes, sin deducciones por dependientes ni ' +
        'intereses de vivienda). Valídala con tu contador antes de ' +
        'aplicarla en una nómina real.'
      );
    }

    if (input.leave?.type === 'GENERAL_INCAPACITY') {
      const before = input.leave.accumulatedDaysBefore ?? 0;
      const diasCubiertos = clamp(
        180 - before,
        0,
        input.leave.daysInPeriod
      );

      if (diasCubiertos < input.leave.daysInPeriod) {
        complianceNotes.push(
          `${input.leave.daysInPeriod - diasCubiertos} día(s) de esta ` +
          'incapacidad superan los 180 días acumulados: no se pagan ' +
          'desde nómina, pasan a cargo del Fondo de Pensiones.'
        );
      }
    }

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

      dominicalFestivoValue:
        round(dominicalFestivoValue),

      leaveValue:
        round(leaveValue),

      reimbursableAmount:
        round(reimbursableAmount),

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

        retencionFuente:
          round(retencionFuente),

        totalDeductions:
          round(totalDeductions),
      },

      // NETO

      netPay:
        round(netPay),

      complianceNotes,

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
