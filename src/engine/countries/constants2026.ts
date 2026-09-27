/**
 * CONSTANTES LEGALES COLOMBIA 2026
 *
 * Fuente única de constantes usadas por todos los motores de cálculo
 * (nómina mensual, jornada parcial por horas, contratistas
 * independientes). Se centralizan aquí para no duplicarlas ni
 * desincronizarlas entre motores.
 *
 * Revisar y actualizar cada vez que cambie el SMMLV, la UVT, o el
 * cronograma de reducción de jornada de la Ley 2101 de 2021.
 */

export const CONSTANTS_2026 = {
  SMMLV: 1_750_905,

  AUXILIO_TRANSPORTE: 249_095,

  SMMLV_LIMIT_AUX:
    2 * 1_750_905,

  /**
   * Jornada mensual utilizada para el cálculo del valor hora en el
   * motor de nómina mensual tradicional (empleados de tiempo
   * completo). No confundir con LEGAL_WEEKLY_HOURS: este divisor es
   * una convención de nómina, no el tope legal de jornada.
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

  /**
   * Unidad de Valor Tributario 2026 (Resolución DIAN 000238 de
   * 2025). Se usa para las bases mínimas de retención en la fuente.
   */
  UVT: 52_374,

  /**
   * Jornada laboral máxima legal semanal (Ley 2101 de 2021, art. que
   * modifica el art. 161 CST). Cronograma de reducción gradual:
   * 48h (hasta jul-2023) → 47h (jul-2023) → 46h (jul-2024) →
   * 44h (jul-2025) → 42h (desde el 15 de julio de 2026, vigente).
   *
   * Actualizar esta constante si la ley vuelve a cambiar el tope.
   */
  LEGAL_WEEKLY_HOURS: 42,

  /**
   * Contratistas independientes (prestación de servicios): el IBC
   * mínimo para su propio aporte a salud/pensión es el 40% del
   * valor mensualizado del contrato (Decreto 1273 de 2018), nunca
   * inferior a 1 SMMLV.
   */
  INDEPENDENT_IBC_FACTOR: 0.4,

  /**
   * Retención en la fuente 2026 sobre pagos a independientes,
   * concepto "servicios" (predomina lo técnico/manual sobre lo
   * intelectual). Base mínima 2 UVT.
   */
  RETENTION_SERVICIOS_DECLARANTE: 0.04,
  RETENTION_SERVICIOS_NO_DECLARANTE: 0.06,
  RETENTION_SERVICIOS_MIN_BASE_UVT: 2,

  /**
   * Retención en la fuente sobre honorarios (predomina el trabajo
   * intelectual/profesional). La tabla real es progresiva por
   * tramos de UVT; esta es una tarifa plana simplificada para el
   * MVP y DEBE validarse con el contador antes de producción.
   */
  RETENTION_HONORARIOS_FLAT_RATE: 0.11,
} as const;

export default CONSTANTS_2026;
