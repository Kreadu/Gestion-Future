import { describe, it, expect, beforeAll } from '@jest/globals';
import { DianNominaXmlService } from '../src/services/dianNominaXmlService';
import { loadPkcs12, signDianXml, DianCertificateError, DIAN_POLICY_URL, type DianCertificate } from '../src/services/dianSigner';
import { testP12, type TestCertificate } from './helpers/dianCert';

declare const require: (id: string) => any;
const { SignedXml } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');
const { createHash } = require('crypto');

const payroll: any = {
  employeeId: 'emp-1', firstName: 'Ana', lastName: 'Pérez', taxId: '1020304050', daysWorked: 30,
  baseSalaryEarned: 2000000, earnedAuxTransporte: 200000, extraDiurnaValue: 0, extraNocturnaValue: 0,
  recargoNocturnoValue: 0, ibcSecuritySocial: 2000000, grossEarnings: 2200000, netPay: 2040000,
  employeeDeductions: { health4pct: 80000, pension4pct: 80000, fspValue: 0, totalDeductions: 160000 },
};
const employer = { nit: '900123456', dv: '7', companyName: 'Empresa & Cía S.A.S.', softwareId: 's', pinSoftware: '1' };
const extra = { typeDocument: '13' as const, typeContract: '1' as const, paymentMethod: '42' as const };

function verify(xml: string, certPem: string): boolean {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const node = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  const sig = new SignedXml({ publicCert: certPem });
  sig.loadSignature(node);
  return sig.checkSignature(xml);
}

describe('firma XAdES-EPES de documentos DIAN', () => {
  let test: TestCertificate;
  let cert: DianCertificate;
  let xml: string;

  beforeAll(async () => {
    test = testP12();
    cert = await loadPkcs12(test.p12Base64, test.password);
    xml = (await DianNominaXmlService.generateDSPNE(payroll, employer, extra, 1, '2026-03-01', '10:00:00-05:00')).xmlContent;
  });

  it('abre el .p12 y lee emisor y serie', () => {
    expect(cert.issuerName).toBe('CN=Empresa de prueba,O=Entidad\\, Prueba,C=CO');
    expect(cert.serialNumber).toBe(String(0x0a1b2c3d));
  });

  it('rechaza una contraseña equivocada con un mensaje claro', async () => {
    await expect(loadPkcs12(test.p12Base64, 'otra')).rejects.toBeInstanceOf(DianCertificateError);
  });

  it('produce una firma que un verificador independiente acepta', async () => {
    const signed = await signDianXml(xml, cert, new Date('2026-03-01T15:00:00Z'));
    expect(verify(signed, test.certPem)).toBe(true);
    expect(signed).toContain('<xades:SigningTime>2026-03-01T10:00:00-05:00</xades:SigningTime>');
    expect(signed).toContain(DIAN_POLICY_URL);

    const certDigest = createHash('sha256').update(Buffer.from(cert.certificateBase64, 'base64')).digest('base64');
    expect(signed).toContain(`<ds:DigestValue>${certDigest}</ds:DigestValue>`);
  });

  it('la firma deja de validar si alguien cambia el documento', async () => {
    const signed = await signDianXml(xml, cert);
    const tampered = signed.replace('<ComprobanteTotal>2040000.00', '<ComprobanteTotal>9040000.00');
    expect(tampered).not.toBe(signed);
    expect(verify(tampered, test.certPem)).toBe(false);
  });

  it('no firma dos veces el mismo documento', async () => {
    const signed = await signDianXml(xml, cert);
    await expect(signDianXml(signed, cert)).rejects.toThrow('ExtensionContent');
  });
});

