import { describe, it, expect, jest } from '@jest/globals';
import { DianNominaXmlService } from '../src/services/dianNominaXmlService';
import { parseXml, findElements, getAttribute } from '../src/services/xmlC14n';

const NS = 'dian:gov:co:facturaelectronica:NominaIndividual';
// tsconfig no incluye los tipos de Node (igual que tests/helpers/api.ts).
declare const require: (id: string) => any;
const { createHash } = require('crypto');
const sha384 = (s: string): string => createHash('sha384').update(s, 'utf8').digest('hex');

const payroll: any = {
  employeeId: 'emp-1',
  firstName: 'Ana',
  lastName: 'Pérez',
  taxId: '1020304050',
  daysWorked: 30,
  baseSalaryEarned: 2000000,
  earnedAuxTransporte: 200000,
  extraDiurnaValue: 0,
  extraNocturnaValue: 0,
  recargoNocturnoValue: 0,
  ibcSecuritySocial: 2000000,
  grossEarnings: 2200000,
  netPay: 2040000,
  employeeDeductions: { health4pct: 80000, pension4pct: 80000, fspValue: 0, totalDeductions: 160000 },
};

const employer = {
  nit: '900123456',
  dv: '7',
  companyName: 'Empresa & Cía S.A.S.',
  softwareId: 'soft-abc',
  pinSoftware: '75315',
};

const extra = { typeDocument: '13' as const, typeContract: '1' as const, paymentMethod: '42' as const, startDate: '2026-01-15' };

describe('CUNE y SoftwareSC según el anexo técnico de nómina electrónica', () => {
  it('concatena NumNE+FecNE+HorNE+ValDev+ValDed+ValTolNE+NitNE+DocEmp+TipoXML+PIN+TipAmb', async () => {
    const cune = await DianNominaXmlService.calculateCUNE(
      'NE00000101', '2026-09-30', '10:00:00-05:00', 2200000, 160000, 2040000,
      '900123456', '1020304050', '102', '75315', '2'
    );
    expect(cune).toBe(sha384(
      'NE00000101' + '2026-09-30' + '10:00:00-05:00' + '2200000.00' + '160000.00' + '2040000.00' +
      '900123456' + '1020304050' + '102' + '75315' + '2'
    ));
    expect(cune).toHaveLength(96);
  });

  it('SoftwareSC es SHA-384 de SoftwareID + PIN + número del documento', async () => {
    expect(await DianNominaXmlService.calculateSoftwareSC('soft-abc', '75315', 'NE00000101'))
      .toBe(sha384('soft-abc75315NE00000101'));
  });

  it('el XML usa el CUNE del anexo, el periodo real, el ambiente y deja lugar para la firma', async () => {
    const result = await DianNominaXmlService.generateDSPNE(
      payroll, employer, extra, 101, '2026-03-01', '10:00:00-05:00',
      { periodStart: '2026-02-01', periodEnd: '2026-02-28', environment: '2' }
    );

    const expected = sha384(
      'NE00000101' + '2026-03-01' + '10:00:00-05:00' + '2200000.00' + '160000.00' + '2040000.00' +
      '900123456' + '1020304050' + '102' + '75315' + '2'
    );
    expect(result.cune).toBe(expected);

    const root = parseXml(result.xmlContent);
    const one = (name: string) => findElements(root, NS, name)[0];

    expect(getAttribute(one('InformacionGeneral'), 'CUNE')).toBe(expected);
    expect(getAttribute(one('InformacionGeneral'), 'Ambiente')).toBe('2');
    expect(getAttribute(one('InformacionGeneral'), 'EncripCUNE')).toBe('CUNE-SHA384');
    expect(getAttribute(one('ProveedorXML'), 'SoftwareSC')).toBe(sha384('soft-abc75315NE00000101'));
    expect(getAttribute(one('Periodo'), 'FechaLiquidacionInicio')).toBe('2026-02-01');
    expect(getAttribute(one('Periodo'), 'FechaLiquidacionFin')).toBe('2026-02-28');
    // Del 15-ene al 28-feb de 2026: 45 días.
    expect(getAttribute(one('Periodo'), 'TiempoLaborado')).toBe('45');
    expect(getAttribute(one('Empleador'), 'RazonSocial')).toBe('Empresa & Cía S.A.S.');
    expect(result.xmlContent).toContain('https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=' + expected);
    expect(findElements(root, 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2', 'ExtensionContent')).toHaveLength(1);
    expect(one('ComprobanteTotal').children[0]).toEqual({ type: 'text', value: '2040000.00' });
  });

  it('en producción usa ambiente 1 y el catálogo de producción', async () => {
    const result = await DianNominaXmlService.generateDSPNE(
      payroll, employer, extra, 7, '2026-03-01', '10:00:00-05:00', { environment: '1' }
    );
    expect(result.xmlContent).toContain('Ambiente="1"');
    expect(result.xmlContent).toContain('https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=');
  });

  it('sin hora explícita usa la hora de Colombia', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T03:30:00Z'));
    try {
      const result = await DianNominaXmlService.generateDSPNE(payroll, employer, extra, 8);
      expect(result.issueDate).toBe('2026-02-28');
      expect(result.issueTime).toBe('22:30:00-05:00');
    } finally {
      jest.useRealTimers();
    }
  });
});
