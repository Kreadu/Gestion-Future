/**
 * MOTOR DE CÁLCULO — CONTRATISTA INDEPENDIENTE (PRESTACIÓN DE
 * SERVICIOS POR HORAS)
 *
 * A diferencia del empleado (de nómina mensual o de jornada
 * parcial), un contratista independiente NO tiene relación laboral:
 * no hay prestaciones sociales, ni aportes patronales, ni
 * parafiscales. Lo único que se calcula es el bruto, la retención en
 * la fuente, y el neto — y se sugiere (informativamente) el IBC
 * mínimo que el propio contratista debe cotizar.
 *
 * RETENCIÓN SEGÚN EL CONCEPTO:
 * - "SERVICIOS": tarifa fija de ley (4% declarante / 6% no
 *   declarante, base mínima 2 UVT) — no depende del negocio, se
 *   calcula automáticamente a partir de `isIncomeTaxFiler`.
 * - "HONORARIOS": la tabla real es progresiva por tramos de UVT y el
 *   tramo aplicable depende del monto de CADA pago, no es una tarifa
 *   fija. Por eso aquí NO se calcula sola: quien liquida debe
 *   capturar la tarifa vigente (`manualRetentionRate`), revisándola
 *   en la tabla oficial de la DIAN para ese monto y ese contratista.
 */

import { CONSTANTS_2026 } from '../countries/constants2026';
import type {
  IndependentContractorInput,
  IndependentContractorResult,
} from '../../types/hourly';

export class IndependentContractorEngineError extends Error {}

export class IndependentContractorEngine {

  private static resolveRetentionRate(
    input: IndependentContractorInput,
    grossAmount: number
  ): number {

    if (input.retentionConcept === 'HONORARIOS') {
      const manualRate = input.manualRetentionRate;

      if (
        manualRate === undefined ||
        manualRate === null ||
        !Number.isFinite(manualRate) ||
        manualRate < 0 ||
        manualRate > 1
      ) {
        throw new IndependentContractorEngineError(
          'Para el concepto "Honorarios" debes indicar la tarifa de ' +
          'retención vigente (la tabla es progresiva por tramos de UVT ' +
          'y depende del monto de cada pago; consúltala en la tabla ' +
          'oficial de la DIAN).'
        );
      }

      return manualRate;
    }

    // SERVICIOS: tarifa fija de ley, sólo aplica si supera la base
    // mínima de 2 UVT.
    const minBase =
      CONSTANTS_2026.RETENTION_SERVICIOS_MIN_BASE_UVT * CONSTANTS_2026.UVT;

    if (grossAmount < minBase) {
      return 0;
    }

    return input.isIncomeTaxFiler
      ? CONSTANTS_2026.RETENTION_SERVICIOS_DECLARANTE
      : CONSTANTS_2026.RETENTION_SERVICIOS_NO_DECLARANTE;
  }

  static calculate(
    input: IndependentContractorInput
  ): IndependentContractorResult {

    const round = (value: number): number =>
      Math.round(value * 100) / 100;

    if (input.hoursWorked < 0) {
      throw new IndependentContractorEngineError(
        'Las horas trabajadas no pueden ser negativas.'
      );
    }

    if (input.hourlyRate <= 0) {
      throw new IndependentContractorEngineError(
        'La tarifa por hora debe ser mayor que cero.'
      );
    }

    const grossAmount = input.hourlyRate * input.hoursWorked;

    const retentionRate = this.resolveRetentionRate(input, grossAmount);
    const retentionAmount = grossAmount * retentionRate;
    const netAmount = grossAmount - retentionAmount;

    const suggestedMinimumIbc = Math.max(
      grossAmount * CONSTANTS_2026.INDEPENDENT_IBC_FACTOR,
      CONSTANTS_2026.SMMLV
    );

    const professionalName = [
      input.firstName,
      input.firstName2,
      input.lastName,
      input.lastName2,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');

    return {
      companyId: input.companyId,
      engagementId: input.engagementId,
      professionalId: input.professionalId,

      professionalName,
      taxId: input.taxId,

      periodDate: new Date().toISOString().split('T')[0],

      hoursWorked: input.hoursWorked,
      hourlyRate: round(input.hourlyRate),

      grossAmount: round(grossAmount),

      retentionConcept: input.retentionConcept,
      retentionRate,
      retentionAmount: round(retentionAmount),

      netAmount: round(netAmount),

      suggestedMinimumIbc: round(suggestedMinimumIbc),
    };
  }
}

export default IndependentContractorEngine;
