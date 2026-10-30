import { describe, test, expect } from '@jest/globals';
import {
  buildPilaFile,
  fieldSpan,
  HEADER_FIELDS,
  EMPLOYEE_FIELDS,
  HEADER_LENGTH,
  EMPLOYEE_LENGTH,
  ceil100,
  type PilaEmployeeInput,
  type PilaFileInput,
} from '../src/services/pilaFile';

const SMMLV = 1_750_905;

function employee(extra: Partial<PilaEmployeeInput> = {}): PilaEmployeeInput {
  return {
    documentType: 'CC',
    documentNumber: '1061000111',
    contributorType: '01',
    contributorSubtype: '00',
    firstName: 'Ana',
    firstName2: 'María',
    lastName: 'Gómez',
    lastName2: 'Peña',
    divipolaCode: '19001',
    epsCode: 'EPS037',
    afpCode: '230301',
    ccfCode: 'CCF22',
    salary: 2_000_000,
    isIntegralSalary: false,
    arlRiskClass: 1,
    isExempt: false,
    hireDate: '2025-01-01',
    terminationDate: null,
    daysWorked: 30,
    ibc: 2_000_000,
    fspRate: 0,
    leaves: [],
    ...extra,
  };
}

function input(employees: PilaEmployeeInput[], extra: Partial<PilaFileInput['company']> = {}): PilaFileInput {
  return {
    company: {
      name: 'Panadería La Espiga S.A.S.',
      nit: '900123456',
      dv: '7',
      contributorType: '01',
      arlCode: '14-23',
      ...extra,
    },
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    employees,
  };
}

/** Valor del campo `name` (posiciones de la resolución) en una línea. */
function get(line: string, layout: typeof EMPLOYEE_FIELDS, name: string): string {
  const { start, length } = fieldSpan(layout, name);
  return line.slice(start - 1, start - 1 + length);
}

const H = (line: string, name: string) => get(line, HEADER_FIELDS, name);
const E = (line: string, name: string) => get(line, EMPLOYEE_FIELDS, name);

describe('Estructura del archivo (Res. 2388 de 2016)', () => {
  test('longitudes fijas: encabezado 358 y cotizante 693', () => {
    expect(HEADER_LENGTH).toBe(358);
    expect(EMPLOYEE_LENGTH).toBe(693);
  });

  test('posiciones clave del registro tipo 2', () => {
    expect(fieldSpan(EMPLOYEE_FIELDS, 'tipoDocumento')).toEqual({ start: 8, length: 2 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'ing')).toEqual({ start: 137, length: 1 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'irl')).toEqual({ start: 152, length: 2 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'codigoAfp')).toEqual({ start: 154, length: 6 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'diasPension')).toEqual({ start: 184, length: 2 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'salarioBasico')).toEqual({ start: 192, length: 9 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'tarifaArl')).toEqual({ start: 381, length: 9 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'exonerado')).toEqual({ start: 506, length: 1 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'fechaIngreso')).toEqual({ start: 515, length: 10 });
    expect(fieldSpan(EMPLOYEE_FIELDS, 'ibcOtrosParafiscales')).toEqual({ start: 665, length: 9 });
  });

  test('posiciones clave del encabezado', () => {
    expect(fieldSpan(HEADER_FIELDS, 'razonSocial')).toEqual({ start: 7, length: 200 });
    expect(fieldSpan(HEADER_FIELDS, 'codigoArl')).toEqual({ start: 298, length: 6 });
    expect(fieldSpan(HEADER_FIELDS, 'periodoOtros')).toEqual({ start: 304, length: 7 });
    expect(fieldSpan(HEADER_FIELDS, 'totalCotizantes')).toEqual({ start: 338, length: 5 });
  });

  test('cada línea mide exactamente lo que dice la resolución y van separadas por CRLF', () => {
    const file = buildPilaFile(input([employee(), employee({ documentNumber: '2' })]));
    const lines = file.content.split('\r\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveLength(HEADER_LENGTH);
    expect(lines[1]).toHaveLength(EMPLOYEE_LENGTH);
    expect(lines[2]).toHaveLength(EMPLOYEE_LENGTH);
    expect(/^[\x20-\x7e\r\n]*$/.test(file.content)).toBe(true);
  });
});

describe('Encabezado (registro tipo 1)', () => {
  test('aportante, periodos de pensión (mes vencido) y salud (mes siguiente) y totales', () => {
    const file = buildPilaFile(input([employee(), employee({ documentNumber: '2', ibc: 3_000_000, salary: 3_000_000 })]));
    const header = file.lines[0];

    expect(header.slice(0, 6)).toBe('110001');
    expect(H(header, 'razonSocial').trim()).toBe('PANADERIA LA ESPIGA S.A.S.');
    expect(H(header, 'tipoDocumento')).toBe('NI');
    expect(H(header, 'nit')).toBe('900123456       ');
    expect(H(header, 'dv')).toBe('7');
    expect(H(header, 'tipoPlanilla')).toBe('E');
    expect(H(header, 'formaPresentacion')).toBe('U');
    expect(H(header, 'codigoArl')).toBe('14-23 ');
    expect(H(header, 'periodoOtros')).toBe('2026-10');
    expect(H(header, 'periodoSalud')).toBe('2026-11');
    expect(H(header, 'totalCotizantes')).toBe('00002');
    expect(H(header, 'valorNomina')).toBe('000005000000');
    expect(H(header, 'tipoAportante')).toBe('01');
  });

  test('diciembre: la salud se paga con periodo de enero del año siguiente', () => {
    const file = buildPilaFile({ ...input([employee()]), periodStart: '2026-12-01', periodEnd: '2026-12-31' });
    expect(H(file.lines[0], 'periodoSalud')).toBe('2027-01');
  });
});

describe('Cotizante sin novedades', () => {
  const file = buildPilaFile(input([employee()]));
  const line = file.lines[1];

  test('identificación, nombres sin tildes y administradoras', () => {
    expect(E(line, 'tipoRegistro')).toBe('02');
    expect(E(line, 'secuencia')).toBe('00001');
    expect(E(line, 'tipoDocumento')).toBe('CC');
    expect(E(line, 'numeroDocumento')).toBe('1061000111      ');
    expect(E(line, 'tipoCotizante')).toBe('01');
    expect(E(line, 'subtipoCotizante')).toBe('00');
    expect(E(line, 'departamento')).toBe('19');
    expect(E(line, 'municipio')).toBe('001');
    expect(E(line, 'primerApellido').trim()).toBe('GOMEZ');
    expect(E(line, 'segundoApellido').trim()).toBe('PENA');
    expect(E(line, 'primerNombre').trim()).toBe('ANA');
    expect(E(line, 'segundoNombre').trim()).toBe('MARIA');
    expect(E(line, 'codigoAfp')).toBe('230301');
    expect(E(line, 'codigoEps')).toBe('EPS037');
    expect(E(line, 'codigoCcf')).toBe('CCF22 ');
  });

  test('días, IBC, tarifas y aportes redondeados al múltiplo de 100 superior', () => {
    expect(E(line, 'diasPension')).toBe('30');
    expect(E(line, 'diasSalud')).toBe('30');
    expect(E(line, 'diasArl')).toBe('30');
    expect(E(line, 'diasCcf')).toBe('30');
    expect(E(line, 'salarioBasico')).toBe('002000000');
    expect(E(line, 'salarioIntegral')).toBe('F');
    expect(E(line, 'ibcPension')).toBe('002000000');
    expect(E(line, 'ibcArl')).toBe('002000000');
    expect(E(line, 'tarifaPension')).toBe('0.16000');
    expect(E(line, 'aportePension')).toBe('000320000');
    expect(E(line, 'totalPension')).toBe('000320000');
    expect(E(line, 'tarifaSalud')).toBe('0.12500');
    expect(E(line, 'aporteSalud')).toBe('000250000');
    expect(E(line, 'tarifaArl')).toBe('0.0052200');
    expect(E(line, 'aporteArl')).toBe('000010500'); // 10.440 → 10.500
    expect(E(line, 'claseRiesgo')).toBe('1');
    expect(E(line, 'tarifaCcf')).toBe('0.04000');
    expect(E(line, 'aporteCcf')).toBe('000080000');
    expect(E(line, 'aporteSena')).toBe('000040000');
    expect(E(line, 'aporteIcbf')).toBe('000060000');
    expect(E(line, 'exonerado')).toBe('N');
    expect(E(line, 'codigoArl')).toBe('14-23 ');
    expect(E(line, 'ibcOtrosParafiscales')).toBe('002000000');
  });

  test('sin ING/RET ni fechas de novedades', () => {
    expect(E(line, 'ing')).toBe(' ');
    expect(E(line, 'ret')).toBe(' ');
    expect(E(line, 'fechaIngreso').trim()).toBe('');
    expect(E(line, 'fechaRetiro').trim()).toBe('');
  });

  test('totales por subsistema', () => {
    expect(file.totals).toMatchObject({
      pension: 320_000,
      health: 250_000,
      arl: 10_500,
      ccf: 80_000,
      sena: 40_000,
      icbf: 60_000,
      total: 760_500,
    });
  });
});

describe('Novedades', () => {
  test('ING y RET dentro del periodo con sus fechas', () => {
    const file = buildPilaFile(input([
      employee({ hireDate: '2026-10-11', terminationDate: '2026-10-25', daysWorked: 15, ibc: 1_000_000 }),
    ]));
    const line = file.lines[1];

    expect(E(line, 'ing')).toBe('X');
    expect(E(line, 'ret')).toBe('X');
    expect(E(line, 'fechaIngreso')).toBe('2026-10-11');
    expect(E(line, 'fechaRetiro')).toBe('2026-10-25');
    expect(E(line, 'diasSalud')).toBe('15');
  });

  test('incapacidad general: una línea adicional con IGE, sus días y fechas, sin ARL ni parafiscales', () => {
    const file = buildPilaFile(input([
      employee({
        daysWorked: 25,
        ibc: 1_666_667 + 291_818,
        leaves: [{ type: 'GENERAL_INCAPACITY', startDate: '2026-10-10', endDate: '2026-10-14', days: 5, value: 291_818 }],
      }),
    ]));

    expect(file.lines).toHaveLength(3);
    const [, main, ige] = file.lines;

    expect(E(main, 'diasSalud')).toBe('25');
    expect(E(main, 'ibcSalud')).toBe('001666667');
    expect(E(main, 'ige')).toBe(' ');

    expect(E(ige, 'secuencia')).toBe('00002');
    expect(E(ige, 'ige')).toBe('X');
    expect(E(ige, 'fechaInicioIge')).toBe('2026-10-10');
    expect(E(ige, 'fechaFinIge')).toBe('2026-10-14');
    expect(E(ige, 'diasPension')).toBe('05');
    expect(E(ige, 'diasSalud')).toBe('05');
    expect(E(ige, 'diasArl')).toBe('00');
    expect(E(ige, 'diasCcf')).toBe('00');
    expect(E(ige, 'ibcSalud')).toBe('000291818');
    expect(E(ige, 'ibcArl')).toBe('000000000');
    expect(E(ige, 'aporteArl')).toBe('000000000');
    expect(E(ige, 'aporteCcf')).toBe('000000000');
    expect(E(ige, 'aportePension')).toBe('000046700'); // 46.690,88 → 46.700

    // El cotizante cuenta una sola vez en el encabezado.
    expect(H(file.lines[0], 'totalCotizantes')).toBe('00001');
  });

  test('incapacidad laboral: el campo IRL lleva los días', () => {
    const file = buildPilaFile(input([
      employee({
        daysWorked: 27,
        ibc: 1_800_000 + 200_000,
        leaves: [{ type: 'WORK_INCAPACITY', startDate: '2026-10-02', endDate: '2026-10-04', days: 3, value: 200_000 }],
      }),
    ]));
    const irl = file.lines[2];

    expect(E(irl, 'irl')).toBe('03');
    expect(E(irl, 'fechaInicioIrl')).toBe('2026-10-02');
    expect(E(irl, 'fechaFinIrl')).toBe('2026-10-04');
  });

  test('licencia de maternidad o paternidad: LMA', () => {
    const file = buildPilaFile(input([
      employee({
        daysWorked: 22,
        ibc: 1_466_667 + 533_333,
        leaves: [{ type: 'PATERNITY_LEAVE', startDate: '2026-10-20', endDate: '2026-10-27', days: 8, value: 533_333 }],
      }),
    ]));
    const lma = file.lines[2];

    expect(E(lma, 'lma')).toBe('X');
    expect(E(lma, 'fechaInicioLma')).toBe('2026-10-20');
    expect(E(lma, 'diasArl')).toBe('00');
  });

  test('vacaciones: VAC con CCF y parafiscales pero sin ARL', () => {
    const file = buildPilaFile(input([
      employee({
        daysWorked: 20,
        ibc: 2_000_000,
        leaves: [{ type: 'VACATION', startDate: '2026-10-01', endDate: '2026-10-10', days: 10, value: 666_667 }],
      }),
    ]));
    const [, main, vac] = file.lines;

    expect(E(main, 'ibcArl')).toBe('001333333');
    expect(E(vac, 'vac')).toBe('X');
    expect(E(vac, 'fechaInicioVac')).toBe('2026-10-01');
    expect(E(vac, 'fechaFinVac')).toBe('2026-10-10');
    expect(E(vac, 'diasArl')).toBe('00');
    expect(E(vac, 'diasCcf')).toBe('10');
    expect(E(vac, 'ibcCcf')).toBe('000666667');
    expect(E(vac, 'aporteCcf')).toBe('000026700');
  });

  test('mes completo en licencia: no hay línea de días trabajados', () => {
    const file = buildPilaFile(input([
      employee({
        daysWorked: 0,
        ibc: 2_000_000,
        leaves: [{ type: 'MATERNITY_LEAVE', startDate: '2026-10-01', endDate: '2026-10-30', days: 30, value: 2_000_000 }],
      }),
    ]));

    expect(file.lines).toHaveLength(2);
    expect(E(file.lines[1], 'lma')).toBe('X');
    expect(E(file.lines[1], 'diasSalud')).toBe('30');
  });
});

describe('Casos especiales', () => {
  test('empresa exonerada (114-1): salud 4 %, sin SENA ni ICBF', () => {
    const file = buildPilaFile(input([employee({ isExempt: true })]));
    const line = file.lines[1];

    expect(E(line, 'exonerado')).toBe('S');
    expect(E(line, 'tarifaSalud')).toBe('0.04000');
    expect(E(line, 'aporteSalud')).toBe('000080000');
    expect(E(line, 'tarifaSena')).toBe('0.00000');
    expect(E(line, 'aporteSena')).toBe('000000000');
    expect(E(line, 'aporteIcbf')).toBe('000000000');
  });

  test('fondo de solidaridad pensional: 0,5 % solidaridad y el resto subsistencia', () => {
    const ibc = 8_000_000;
    const file = buildPilaFile(input([employee({ salary: ibc, ibc, fspRate: 0.01 })]));
    const line = file.lines[1];

    expect(E(line, 'fspSolidaridad')).toBe('000040000');
    expect(E(line, 'fspSubsistencia')).toBe('000040000');
  });

  test('salario integral y clase de riesgo V', () => {
    const file = buildPilaFile(input([
      employee({ isIntegralSalary: true, salary: 30_000_000, ibc: 21_000_000, arlRiskClass: 5 }),
    ]));
    const line = file.lines[1];

    expect(E(line, 'salarioIntegral')).toBe('X');
    expect(E(line, 'tarifaArl')).toBe('0.0696000');
    expect(E(line, 'claseRiesgo')).toBe('5');
  });

  test('IBC por debajo del mínimo proporcional se sube y se advierte', () => {
    const file = buildPilaFile(input([employee({ salary: SMMLV, ibc: 1_000_000 })]));
    expect(E(file.lines[1], 'ibcSalud')).toBe('001750905');
    expect(file.warnings.join(' ')).toMatch(/mínimo/);
  });

  test('advierte los códigos de administradora que faltan', () => {
    const file = buildPilaFile(input([employee({ epsCode: '', afpCode: null, ccfCode: '', divipolaCode: null })], { arlCode: '' }));

    const text = file.warnings.join(' | ');
    expect(text).toMatch(/ARL/);
    expect(text).toMatch(/EPS/);
    expect(text).toMatch(/pensiones/);
    expect(text).toMatch(/caja/);
    expect(text).toMatch(/municipio/);
  });

  test('ceil100 redondea al múltiplo de 100 superior', () => {
    expect(ceil100(10_440)).toBe(10_500);
    expect(ceil100(10_400)).toBe(10_400);
    expect(ceil100(0)).toBe(0);
    expect(ceil100(10_400.0000001)).toBe(10_400);
  });

  test('nombre del archivo', () => {
    expect(buildPilaFile(input([employee()])).fileName).toBe('PILA_900123456_2026-10.txt');
  });
});
