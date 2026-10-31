import { describe, test, expect } from '@jest/globals';
import { DianNominaXmlService } from '../src/services/dianNominaXmlService';
import { parseXml, findElements, getAttribute, textContent, walk, type XmlElement } from '../src/services/xmlC14n';
import { PartTimeEmployeeEngine } from '../src/engine/hourly/partTimeEmployeeEngine';
import { ColombiaPayrollEngine } from '../src/engine/countries/colombiaEngine';

const NS = 'dian:gov:co:facturaelectronica:NominaIndividual';
const employer = { nit: '900123456', dv: '7', companyName: 'Mi Temporal', softwareId: 's', pinSoftware: '1' };
const extra = { typeDocument: '13' as const, typeContract: '2' as const, paymentMethod: '42' as const };

async function xmlOf(payroll: any) {
  const result = await DianNominaXmlService.generateDSPNE(payroll, employer, extra, 1, '2026-10-12', '10:00:00-05:00',
    { periodStart: '2026-10-05', periodEnd: '2026-10-11' });
  return parseXml(result.xmlContent);
}

const one = (root: XmlElement, name: string) => findElements(root, NS, name)[0];
const num = (el: XmlElement, attr: string) => Number(getAttribute(el, attr));

/** Suma de todos los atributos de pago dentro de un nodo (Devengados o Deducciones). */
function sumPayments(group: XmlElement): number {
  const paymentAttrs = ['SueldoTrabajado', 'AuxilioTransporte', 'Pago', 'Deduccion', 'DeduccionSP'];
  let total = 0;
  for (const el of walk(group)) {
    for (const attr of paymentAttrs) {
      const value = getAttribute(el, attr);
      if (value !== null) total += Number(value);
    }
    if (el.localName === 'RetencionFuente') total += Number(textContent(el));
  }
  return Math.round(total * 100) / 100;
}

describe('XML de nómina con recargos, extras, novedades y retención detallados', () => {
  test('pago por horas: cada tipo de hora va en su nodo del anexo y suma el total devengado', async () => {
    const payroll = PartTimeEmployeeEngine.calculate({
      companyId: 'C', engagementId: 'E', professionalId: 'P', firstName: 'Iván', lastName: 'Lara', taxId: '1',
      hourlyRate: 10000, weeklyHours: 42, hoursWorked: 0,
      hours: { ordinary: 20, night: 4, sunday: 6, sundayNight: 2, extraDay: 3, extraNight: 1, extraSundayDay: 1, extraSundayNight: 2 },
    });
    const root = await xmlOf(payroll);

    const expectations: [string, number, number, number][] = [
      ['HED', 3, 25, 10000 * 1.25 * 3],
      ['HEN', 1, 75, 10000 * 1.75 * 1],
      ['HRN', 4, 35, 10000 * 0.35 * 4],
      ['HEDDF', 1, 115, 10000 * 2.15 * 1],
      ['HRDDF', 6, 90, 10000 * 0.90 * 6],
      ['HENDF', 2, 165, 10000 * 2.65 * 2],
      ['HRNDF', 2, 125, 10000 * 1.25 * 2],
    ];
    for (const [tag, cantidad, porcentaje, pago] of expectations) {
      const el = one(root, tag);
      expect({ tag, cantidad: num(el, 'Cantidad'), porcentaje: num(el, 'Porcentaje'), pago: num(el, 'Pago') })
        .toEqual({ tag, cantidad, porcentaje, pago: expect.closeTo(pago, 1) });
    }

    expect(num(one(root, 'Transporte'), 'AuxilioTransporte')).toBeCloseTo(payroll.earnedAuxTransporte, 2);
    expect(findElements(root, NS, 'AuxilioTransporte')).toHaveLength(0);

    const devengados = one(root, 'Devengados');
    expect(sumPayments(devengados)).toBeCloseTo(payroll.grossEarnings, 2);
    expect(Number(textContent(one(root, 'DevengadosTotal')))).toBeCloseTo(payroll.grossEarnings, 2);
    expect(sumPayments(one(root, 'Deducciones'))).toBeCloseTo(Number(textContent(one(root, 'DeduccionesTotal'))), 2);

    // Orden del esquema: Basico, Transporte, HEDs, HENs, HRNs, HEDDFs, HRDDFs, HENDFs, HRNDFs.
    const order = devengados.children.filter((c): c is XmlElement => c.type === 'element').map(c => c.localName);
    expect(order).toEqual(['Basico', 'Transporte', 'HEDs', 'HENs', 'HRNs', 'HEDDFs', 'HRDDFs', 'HENDFs', 'HRNDFs']);
  });

  test('nómina mensual: incapacidad, licencia, vacaciones, dominicales y retención en la fuente', async () => {
    const payroll = ColombiaPayrollEngine.calculate({
      employeeId: 'E1', firstName: 'Ana', lastName: 'Gómez', taxId: '1061',
      baseSalary: 9_000_000, daysWorked: 15,
      extraDiurna: 2, recargoNocturno: 3, horasDominicalFestivo: 8, horasExtraDominicalFestivo: 1,
      leaves: [
        { type: 'GENERAL_INCAPACITY', daysInPeriod: 5, startDate: '2026-10-05', endDate: '2026-10-09' },
        { type: 'PATERNITY_LEAVE', daysInPeriod: 5, startDate: '2026-10-12', endDate: '2026-10-16' },
        { type: 'VACATION', daysInPeriod: 5, startDate: '2026-10-19', endDate: '2026-10-23' },
      ],
    } as any);
    const root = await xmlOf(payroll);

    const incapacidad = one(root, 'Incapacidad');
    expect(getAttribute(incapacidad, 'Tipo')).toBe('1');
    expect(getAttribute(incapacidad, 'FechaInicio')).toBe('2026-10-05');
    expect(num(incapacidad, 'Cantidad')).toBe(5);
    expect(one(root, 'LicenciaMP')).toBeTruthy();
    expect(one(root, 'VacacionesComunes')).toBeTruthy();
    expect(one(root, 'HRDDF')).toBeTruthy();
    expect(one(root, 'HEDDF')).toBeTruthy();

    expect(sumPayments(one(root, 'Devengados'))).toBeCloseTo(payroll.grossEarnings, 2);
    if (payroll.employeeDeductions.retencionFuente > 0) {
      expect(Number(textContent(one(root, 'RetencionFuente')))).toBeCloseTo(payroll.employeeDeductions.retencionFuente, 2);
    }
    expect(sumPayments(one(root, 'Deducciones'))).toBeCloseTo(payroll.employeeDeductions.totalDeductions, 2);
  });

  test('liquidaciones guardadas antes del desglose: deduce las horas del valor', async () => {
    const payroll = PartTimeEmployeeEngine.calculate({
      companyId: 'C', engagementId: 'E', professionalId: 'P', firstName: 'A', lastName: 'B', taxId: '1',
      hourlyRate: 10000, weeklyHours: 42, hoursWorked: 0, hours: { ordinary: 10, extraDay: 2 },
    });
    delete (payroll as any).hoursBreakdown;
    const root = await xmlOf(payroll);
    expect(num(one(root, 'HED'), 'Cantidad')).toBe(2);
    expect(sumPayments(one(root, 'Devengados'))).toBeCloseTo(payroll.grossEarnings, 2);
  });

  test('si algo pagado no se puede detallar, no genera un XML que no cuadra', async () => {
    const payroll = PartTimeEmployeeEngine.calculate({
      companyId: 'C', engagementId: 'E', professionalId: 'P', firstName: 'A', lastName: 'B', taxId: '1',
      hourlyRate: 10000, weeklyHours: 42, hoursWorked: 10,
    });
    payroll.grossEarnings += 50000;
    await expect(xmlOf(payroll)).rejects.toThrow('no cuadran');
  });
});
