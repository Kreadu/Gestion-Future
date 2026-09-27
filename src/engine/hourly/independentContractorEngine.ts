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
 * IMPORTANTE: la tarifa de retención por "honorarios" implementada
 * aquí es una tarifa plana simplificada para el MVP. La tabla real
 * de retención por honorarios es progresiva por tramos de UVT y
 * depende de si el beneficiario es persona natural o jurídica.
 * Validar con el contador antes de usar en producción.
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
      return CONSTANTS_2026.RETENTION_HONORARIOS_FLAT_RATE;
    }

    // SERVICIOS: sólo aplica si supera la base mínima de 2 UVT.
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
