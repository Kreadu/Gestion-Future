import { describe, it, expect, beforeAll } from '@jest/globals';
import { loadPkcs12, type DianCertificate } from '../src/services/dianSigner';
import {
  buildSignedEnvelope, dianFileNames, getStatusZip, parseDianResponse, sendNomina, zipSingleFile,
  DianServiceError, DIAN_ENDPOINTS,
} from '../src/services/dianWebService';
import { testP12, type TestCertificate } from './helpers/dianCert';

declare const require: (id: string) => any;
declare const Buffer: any;
const { SignedXml } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');
const zlib = require('zlib');

const SEND_TEST_SET_RESPONSE = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>
<SendTestSetAsyncResponse xmlns="http://wcf.dian.colombia"><SendTestSetAsyncResult xmlns:b="http://schemas.datacontract.org/2004/07/UploadDocumentResponse">
<b:ErrorMessageList/><b:ZipKey>3fa85f64-5717-4562-b3fc-2c963f66afa6</b:ZipKey></SendTestSetAsyncResult></SendTestSetAsyncResponse></s:Body></s:Envelope>`;

const STATUS_REJECTED = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>
<GetStatusZipResponse xmlns="http://wcf.dian.colombia"><GetStatusZipResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
<b:DianResponse><b:ErrorMessage><c:string>Regla: NIE024, Rechazo: CUNE no corresponde</c:string><c:string>Regla: NIE026, Notificación: Fecha</c:string></b:ErrorMessage>
<b:IsValid>false</b:IsValid><b:StatusCode>99</b:StatusCode><b:StatusDescription>Validación contiene errores en campos mandatorios.</b:StatusDescription>
<b:StatusMessage>Documento con errores</b:StatusMessage><b:XmlDocumentKey>abc</b:XmlDocumentKey></b:DianResponse></GetStatusZipResult></GetStatusZipResponse></s:Body></s:Envelope>`;

const SOAP_FAULT = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><s:Fault><s:Code><s:Value>s:Sender</s:Value></s:Code>
<s:Reason><s:Text xml:lang="es-CO">El certificado no es válido.</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;

describe('servicio web DIAN', () => {
  let test: TestCertificate;
  let cert: DianCertificate;

  beforeAll(async () => {
    test = testP12();
    cert = await loadPkcs12(test.p12Base64, test.password);
  });

  it('arma un .zip válido con el XML adentro', async () => {
    const xml = '<a>ñandú ✓</a>'.repeat(50);
    const zip = Buffer.from(await zipSingleFile('nie1.xml', xml, new Date('2026-03-01T10:00:00Z')));
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const nameLength = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nameLength).toString()).toBe('nie1.xml');
    const compressedSize = zip.readUInt32LE(18);
    const data = zlib.inflateRawSync(zip.subarray(30 + nameLength, 30 + nameLength + compressedSize));
    expect(data.toString('utf8')).toBe(xml);
    expect(zip.readUInt32LE(14)).toBe(zlib.crc32(data));
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });

  it('nombra los archivos según el anexo', () => {
    expect(dianFileNames('900.123.456', 2026, 255)).toEqual({
      xml: 'nie090012345600026000000ff.xml',
      zip: 'z090012345600026000000ff.zip',
    });
  });

  it('firma el sobre SOAP con WS-Security de forma verificable', async () => {
    const envelope = await buildSignedEnvelope('GetStatusZip', '<wcf:GetStatusZip><wcf:trackId>1</wcf:trackId></wcf:GetStatusZip>', DIAN_ENDPOINTS['2'], cert);
    const doc = new DOMParser().parseFromString(envelope, 'text/xml');
    const node = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
    const sig = new SignedXml({ publicCert: test.certPem });
    sig.loadSignature(node);
    expect(sig.checkSignature(envelope)).toBe(true);
    expect(envelope).toContain('<wsa:Action>http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatusZip</wsa:Action>');
  });

  it('en habilitación envía con SendTestSetAsync y devuelve el ZipKey', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const result = await sendNomina({
      environment: '2',
      signedXml: '<NominaIndividual/>',
      fileNames: dianFileNames('900123456', 2026, 1),
      testSetId: 'set-123',
      certificate: cert,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(SEND_TEST_SET_RESPONSE, { status: 200 });
      },
    });

    expect(result.zipKey).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(result.isValid).toBeNull();
    expect(calls[0].url).toBe('https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc');
    expect(String((calls[0].init.headers as any)['Content-Type'])).toContain('SendTestSetAsync');
    expect(String(calls[0].init.body)).toContain('<wcf:testSetId>set-123</wcf:testSetId>');
    expect(String(calls[0].init.body)).toContain('<wcf:fileName>z0900123456000260000000' + '1.zip</wcf:fileName>');
  });

  it('en habilitación exige el TestSetId', async () => {
    await expect(sendNomina({
      environment: '2', signedXml: '<a/>', fileNames: dianFileNames('1', 2026, 1), certificate: cert,
      fetchImpl: async () => new Response(''),
    })).rejects.toThrow('TestSetId');
  });

  it('lee el rechazo de GetStatusZip con sus reglas', async () => {
    const result = await getStatusZip('2', 'zip-1', cert, async () => new Response(STATUS_REJECTED));
    expect(result).toMatchObject({
      isValid: false,
      statusCode: '99',
      statusDescription: 'Validación contiene errores en campos mandatorios.',
      errors: ['Regla: NIE024, Rechazo: CUNE no corresponde', 'Regla: NIE026, Notificación: Fecha'],
    });
  });

  it('convierte un SOAP Fault en un error legible', () => {
    expect(() => parseDianResponse(SOAP_FAULT)).toThrow('El certificado no es válido.');
    expect(() => parseDianResponse('<html')).toThrow(DianServiceError);
  });

  it('informa cuando la DIAN no responde', async () => {
    await expect(getStatusZip('1', 'x', cert, async () => { throw new Error('timeout'); }))
      .rejects.toThrow('No se pudo conectar con la DIAN: timeout');
  });
});
