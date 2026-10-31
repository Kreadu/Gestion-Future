/**
 * DOCUMENTO SOPORTE EN ADQUISICIONES A NO OBLIGADOS A FACTURAR
 *
 * Documento electrónico DIAN que se debe expedir y transmitir
 * cuando se le paga a alguien que NO está obligado a facturar (el
 * caso típico de un contratista independiente/freelance). Es un
 * documento DISTINTO al de Nómina Electrónica (que se usa para
 * empleados, incluidos los de jornada parcial) y a la Factura
 * Electrónica (que emite el propio contratista si él sí está
 * obligado a facturar).
 *
 * Formato del anexo técnico del documento soporte (Res. 000167 de
 * 2021): UBL 2.1 Invoice con CustomizationID 10 (residente),
 * InvoiceTypeCode 05 y CUDS SHA-384. Lo emite la empresa que paga
 * (adquiriente) con la numeración que la DIAN le autorizó; se firma
 * con dianSigner (segundo UBLExtension vacío) y se envía por el mismo
 * servicio web que la nómina (routes/dian.ts).
 *
 * Pendiente de confirmar en habilitación: TaxScheme del adquiriente,
 * unidad de medida (HUR) y nombre de archivo (prefijo ds).
 */

import type {
  DocumentoSoportePayerInfo,
  DocumentoSoporteBeneficiaryInfo,
  DocumentoSoporteResult,
  IndependentContractorResult,
} from '../types/hourly';

export const DS_INVOICE_NAMESPACE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
export const DS_CBC_NAMESPACE = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
export const DS_STS_NAMESPACE = 'dian:gov:co:facturaelectronica:Structures-2-1';

const DIAN_NIT = '800197268';
const DIAN_AGENCY = 'schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)"';

async function sha384Hex(value: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-384', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Fecha y hora actuales de Colombia (UTC-5, sin horario de verano). */
function colombiaNow(): { date: string; time: string } {
  const iso = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: `${iso.slice(11, 19)}-05:00` };
}

function money(value: number): string {
  return value.toFixed(2);
}

export class DocumentoSoporteService {

  private static escapeXml(value: string): string {
    return String(value).replace(
      /[<>&'"]/g,
      character => {
        switch (character) {
          case '<':
            return '&lt;';
          case '>':
            return '&gt;';
          case '&':
            return '&amp;';
          case '\'':
            return '&apos;';
          case '"':
            return '&quot;';
          default:
            return character;
        }
      }
    );
  }

  /**
   * CUDS: SHA-384(NumDS + FecDS + HorDS + ValDS + CodImp + ValImp +
   * ValTol + NumSNO + NITABS + PIN del software + TipoAmbiente). Sin IVA,
   * CodImp es 01 con valor 0.00.
   */
  public static async calculateCUDS(
    number: string,
    issueDate: string,
    issueTime: string,
    lineExtensionAmount: number,
    ivaAmount: number,
    payableAmount: number,
    supplierDoc: string,
    buyerNit: string,
    pinSoftware: string,
    environment: '1' | '2'
  ): Promise<string> {
    return sha384Hex(
      number +
      issueDate +
      issueTime +
      money(lineExtensionAmount) +
      '01' +
      money(ivaAmount) +
      money(payableAmount) +
      supplierDoc +
      buyerNit +
      pinSoftware +
      environment
    );
  }

  /** Huella del software: SHA-384(SoftwareID + PIN + número del documento). */
  public static async calculateSoftwareSecurityCode(softwareId: string, pin: string, number: string): Promise<string> {
    return sha384Hex(`${softwareId}${pin}${number}`);
  }

  private static address(
    place: { address?: string | null; city?: string | null; department?: string | null; divipolaCode?: string | null },
    fallbackDivipola: string
  ): string {
    const divipola = /^\d{5}$/.test(String(place.divipolaCode || '')) ? String(place.divipolaCode) : fallbackDivipola;
    return `<cac:Address>
            <cbc:ID>${divipola}</cbc:ID>
            <cbc:CityName>${this.escapeXml(place.city || 'Medellín')}</cbc:CityName>
            <cbc:CountrySubentity>${this.escapeXml(place.department || 'Antioquia')}</cbc:CountrySubentity>
            <cbc:CountrySubentityCode>${divipola.slice(0, 2)}</cbc:CountrySubentityCode>
            <cac:AddressLine>
              <cbc:Line>${this.escapeXml(place.address || 'Dirección registrada')}</cbc:Line>
            </cac:AddressLine>
            <cac:Country>
              <cbc:IdentificationCode>CO</cbc:IdentificationCode>
              <cbc:Name languageID="es">Colombia</cbc:Name>
            </cac:Country>
          </cac:Address>`;
  }

  public static async generate(
    settlement: IndependentContractorResult,
    payer: DocumentoSoportePayerInfo,
    beneficiary: DocumentoSoporteBeneficiaryInfo,
    consecutiveNumber: number,
    issueDateStr?: string,
    issueTimeStr?: string
  ): Promise<DocumentoSoporteResult> {
    const now = colombiaNow();
    const issueDate = issueDateStr || now.date;
    const issueTime = issueTimeStr || now.time;
    const environment = payer.environment || '2';
    const numbering = payer.numbering;
    const number = `${numbering.prefix}${consecutiveNumber}`;

    const gross = settlement.grossAmount;
    const supplierDoc = settlement.taxId;
    const buyerNit = payer.nit;

    const cuds = await this.calculateCUDS(
      number, issueDate, issueTime, gross, 0, gross, supplierDoc, buyerNit, payer.pinSoftware, environment
    );
    const securityCode = await this.calculateSoftwareSecurityCode(payer.softwareId, payer.pinSoftware, number);

    const qrBase = environment === '1'
      ? 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey='
      : 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=';
    const qr =
      `NumDS: ${number} FecDS: ${issueDate} HorDS: ${issueTime} NumSNO: ${supplierDoc} DocABS: ${buyerNit} ` +
      `ValDS: ${money(gross)} ValIva: 0.00 ValTolDS: ${money(gross)} CUDS: ${cuds} ${qrBase}${cuds}`;

    const isNit = beneficiary.typeDocument === '31';
    const supplierId = `<cbc:CompanyID ${DIAN_AGENCY}${isNit ? ` schemeID="${this.escapeXml(beneficiary.dv || '0')}"` : ''} schemeName="${beneficiary.typeDocument}">${this.escapeXml(supplierDoc)}</cbc:CompanyID>`;
    const buyerId = `<cbc:CompanyID ${DIAN_AGENCY} schemeID="${this.escapeXml(payer.dv)}" schemeName="31">${this.escapeXml(buyerNit)}</cbc:CompanyID>`;
    const buyerTaxLevel = payer.taxLevelCode || 'R-99-PN';
    const buyerTaxScheme = buyerTaxLevel.includes('O-48')
      ? '<cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name>'
      : '<cbc:ID>ZZ</cbc:ID><cbc:Name>No aplica</cbc:Name>';
    const buyerDivipola = /^\d{5}$/.test(String(payer.divipolaCode || '')) ? String(payer.divipolaCode) : '05001';

    const description = beneficiary.concept === 'HONORARIOS'
      ? 'Honorarios por servicios profesionales'
      : 'Servicios prestados';
    const periodStart = beneficiary.periodStart || issueDate;

    const withholding = settlement.retentionAmount > 0
      ? `
  <cac:WithholdingTaxTotal>
    <cbc:TaxAmount currencyID="COP">${money(settlement.retentionAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">${money(gross)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">${money(settlement.retentionAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${(settlement.retentionRate * 100).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>06</cbc:ID>
          <cbc:Name>ReteRenta</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:WithholdingTaxTotal>`
      : '';

    const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice
  xmlns="${DS_INVOICE_NAMESPACE}"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="${DS_CBC_NAMESPACE}"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sts="${DS_STS_NAMESPACE}"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="${DS_INVOICE_NAMESPACE} http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${this.escapeXml(numbering.resolutionNumber)}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${this.escapeXml(numbering.startDate)}</cbc:StartDate>
              <cbc:EndDate>${this.escapeXml(numbering.endDate)}</cbc:EndDate>
            </sts:AuthorizationPeriod>
            <sts:AuthorizedInvoices>
              <sts:Prefix>${this.escapeXml(numbering.prefix)}</sts:Prefix>
              <sts:From>${numbering.from}</sts:From>
              <sts:To>${numbering.to}</sts:To>
            </sts:AuthorizedInvoices>
          </sts:InvoiceControl>
          <sts:InvoiceSource>
            <cbc:IdentificationCode listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode>
          </sts:InvoiceSource>
          <sts:SoftwareProvider>
            <sts:ProviderID ${DIAN_AGENCY} schemeID="${this.escapeXml(payer.dv)}" schemeName="31">${this.escapeXml(payer.nit)}</sts:ProviderID>
            <sts:SoftwareID ${DIAN_AGENCY}>${this.escapeXml(payer.softwareId)}</sts:SoftwareID>
          </sts:SoftwareProvider>
          <sts:SoftwareSecurityCode ${DIAN_AGENCY}>${securityCode}</sts:SoftwareSecurityCode>
          <sts:AuthorizationProvider>
            <sts:AuthorizationProviderID ${DIAN_AGENCY} schemeID="4" schemeName="31">${DIAN_NIT}</sts:AuthorizationProviderID>
          </sts:AuthorizationProvider>
          <sts:QRCode>${this.escapeXml(qr)}</sts:QRCode>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1: documento soporte en adquisiciones efectuadas a no obligados a facturar.</cbc:ProfileID>
  <cbc:ProfileExecutionID>${environment}</cbc:ProfileExecutionID>
  <cbc:ID>${this.escapeXml(number)}</cbc:ID>
  <cbc:UUID schemeID="${environment}" schemeName="CUDS-SHA384">${cuds}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>05</cbc:InvoiceTypeCode>
  <cbc:Note>${this.escapeXml(`${description}: ${settlement.hoursWorked} horas a ${money(settlement.hourlyRate)}`)}</cbc:Note>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>1</cbc:LineCountNumeric>

  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID>${isNit ? '1' : '2'}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PhysicalLocation>
        ${this.address(beneficiary, buyerDivipola)}
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${this.escapeXml(settlement.professionalName)}</cbc:RegistrationName>
        ${supplierId}
        <cbc:TaxLevelCode listName="49">R-99-PN</cbc:TaxLevelCode>
        <cac:TaxScheme>
          <cbc:ID>ZZ</cbc:ID>
          <cbc:Name>No aplica</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.escapeXml(settlement.professionalName)}</cbc:RegistrationName>
        ${supplierId}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cbc:AdditionalAccountID>1</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${this.escapeXml(payer.companyName)}</cbc:RegistrationName>
        ${buyerId}
        <cbc:TaxLevelCode listName="48">${this.escapeXml(buyerTaxLevel)}</cbc:TaxLevelCode>
        <cac:RegistrationAddress>
          ${this.address(payer, buyerDivipola).replace('<cac:Address>', '').replace('</cac:Address>', '')}
        </cac:RegistrationAddress>
        <cac:TaxScheme>
          ${buyerTaxScheme}
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.escapeXml(payer.companyName)}</cbc:RegistrationName>
        ${buyerId}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:PaymentMeans>
    <cbc:ID>1</cbc:ID>
    <cbc:PaymentMeansCode>42</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${issueDate}</cbc:PaymentDueDate>
  </cac:PaymentMeans>
${withholding}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${money(gross)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">0.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${money(gross)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${money(gross)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="HUR">${settlement.hoursWorked.toFixed(2)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">${money(gross)}</cbc:LineExtensionAmount>
    <cac:InvoicePeriod>
      <cbc:StartDate>${this.escapeXml(periodStart)}</cbc:StartDate>
      <cbc:DescriptionCode>1</cbc:DescriptionCode>
      <cbc:Description>Por operación</cbc:Description>
    </cac:InvoicePeriod>
    <cac:Item>
      <cbc:Description>${this.escapeXml(description)}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="COP">${money(settlement.hourlyRate)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="HUR">1.00</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>

</Invoice>`.trim();

    return {
      documentKey: cuds,
      consecutive: number,
      issueDate,
      issueTime,
      xmlContent,
      grossAmount: gross,
      retentionAmount: settlement.retentionAmount,
      netAmount: settlement.netAmount,
      disclaimer:
        'Documento soporte electrónico: se firma y envía a la DIAN con la habilitación de documento soporte ' +
        'de la empresa (Empresas → DIAN). Mientras no la tenga, lleva datos de prueba y no se puede enviar.',
    };
  }
}

export default DocumentoSoporteService;
