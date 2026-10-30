/**
 * Aritmética de rangos de fechas (formato "AAAA-MM-DD").
 *
 * Se usa para calcular cuántos días de una incapacidad/licencia
 * (employee_leaves) caen dentro de un periodo de nómina, cuando
 * ambos rangos se solapan parcialmente (la incapacidad puede
 * empezar antes del periodo, o terminar después).
 */

/**
 * Días entre dos fechas ISO "AAAA-MM-DD", AMBAS inclusive.
 * `daysInclusive('2026-01-01', '2026-01-01')` es 1, no 0.
 */
export function daysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/**
 * Intersección de dos rangos de fechas ISO, ambos inclusive.
 * Devuelve `null` si no se solapan.
 *
 * Las fechas "AAAA-MM-DD" se pueden comparar como texto: el orden
 * lexicográfico coincide con el cronológico.
 */
export function intersectDateRanges(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): { start: string; end: string; days: number } | null {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;

  if (start > end) {
    return null;
  }

  return { start, end, days: daysInclusive(start, end) };
}
