/**
 * Festivos de Colombia (Ley 51 de 1983, "Ley Emiliani") y conteo de
 * días hábiles para vacaciones.
 *
 * Fechas como texto 'AAAA-MM-DD' y aritmética en UTC, igual que el
 * resto del sistema (src/services/dateRanges.ts).
 */

function toDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z');
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** Lunes siguiente (o el mismo día si ya es lunes). */
function nextMonday(date: Date): Date {
  const day = date.getUTCDay();
  const offset = (8 - day) % 7;
  return addDays(date, offset);
}

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const cache = new Map<number, Set<string>>();

/** Festivos del año como conjunto de fechas 'AAAA-MM-DD'. */
export function colombianHolidays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const fixed = ['01-01', '05-01', '07-20', '08-07', '12-08', '12-25'];
  const movedToMonday = ['01-06', '03-19', '06-29', '08-15', '10-12', '11-01', '11-11'];

  const easter = easterSunday(year);
  const dates: Date[] = [
    ...fixed.map(md => toDate(`${year}-${md}`)),
    ...movedToMonday.map(md => nextMonday(toDate(`${year}-${md}`))),
    addDays(easter, -3), // Jueves Santo
    addDays(easter, -2), // Viernes Santo
    nextMonday(addDays(easter, 39)), // Ascensión
    nextMonday(addDays(easter, 60)), // Corpus Christi
    nextMonday(addDays(easter, 68)), // Sagrado Corazón
  ];

  const set = new Set(dates.map(toIso));
  cache.set(year, set);
  return set;
}

export function isColombianHoliday(iso: string): boolean {
  return colombianHolidays(Number(iso.slice(0, 4))).has(iso);
}

/**
 * Días hábiles entre dos fechas, ambas incluidas: lunes a sábado que
 * no sean festivo (el sábado es hábil salvo pacto en contrario). Con
 * `saturdayIsBusinessDay: false` cuenta lunes a viernes.
 */
export function businessDaysBetween(
  startIso: string,
  endIso: string,
  saturdayIsBusinessDay = true
): number {
  let count = 0;
  const end = toDate(endIso);

  for (let d = toDate(startIso); d <= end; d = addDays(d, 1)) {
    const weekday = d.getUTCDay();
    if (weekday === 0) continue;
    if (weekday === 6 && !saturdayIsBusinessDay) continue;
    if (isColombianHoliday(toIso(d))) continue;
    count++;
  }

  return count;
}
