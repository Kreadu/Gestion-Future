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
 * ADVERTENCIA — igual que con DianNominaXmlService: esta es una
 * implementación propia basada en la estructura general que exige la
 * DIAN, SIN firma digital ni habilitación real como facturador
 * electrónico para este tipo de documento. No debe transmitirse a la
 * DIAN en producción sin que alguien con perfil contable/facturación
 * electrónica lo revise y valide primero.
 */

import type {
  DocumentoSoportePayerInfo,
  DocumentoSoporteBeneficiaryInfo,
  DocumentoSoporteResult,
  IndependentContractorResult,
} from '../types/hourly';

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

  public static async calculateDocumentKey(
    consecutive: string,
    issueDate: string,
    issueTime: string,
    grossAmount: number,
    retentionAmount: number,
    netAmount: number,
    payerNit: string,
    beneficiaryDoc: string,
    pinSoftware: string
  ): Promise<string> {

    const rawString =
      `${consecutive}` +
      `${issueDate}` +
      `${issueTime}` +
      `${grossAmount.toFixed(2)}` +
      `${retentionAmount.toFixed(2)}` +
      `${netAmount.toFixed(2)}` +
      `${payerNit}` +
      `${beneficiaryDoc}` +
      `${pinSoftware}`;

    try {
      const msgBuffer = new TextEncoder().encode(rawString);
      const hashBuffer = await crypto.subtle.digest('SHA-384', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));

      return hashArray
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

    } catch {
      let hash = 0;

      for (let i = 0; i < rawString.length; i++) {
        hash = (hash << 5) - hash + rawString.charCodeAt(i);
        hash |= 0;
      }

      return `documentkey_simulated_${Math.abs(hash)}_${Date.now()}`;
    }
  }

  public static async generate(
    settlement: IndependentContractorResult,
    payer: DocumentoSoportePayerInfo,
    beneficiary: DocumentoSoporteBeneficiaryInfo,
    consecutiveNumber: number,
    issueDateStr?: string,
    issueTimeStr?: string
  ): Promise<DocumentoSoporteResult> {

    const issueDate =
      issueDateStr || new Date().toISOString().split('T')[0];

    const issueTime =
      issueTimeStr || `${new Date().toTimeString().split(' ')[0]}-05:00`;

    const consecutive =
      `DS${consecutiveNumber.toString().padStart(8, '0')}`;

    const documentKey = await this.calculateDocumentKey(
      consecutive,
      issueDate,
      issueTime,
      settlement.grossAmount,
      settlement.retentionAmount,
      settlement.netAmount,
      payer.nit,
      settlement.taxId,
      payer.pinSoftware
    );

    const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<DocumentoSoporte
  xmlns="dian:gov:co:facturaelectronica:DocumentoSoporte"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="dian:gov:co:facturaelectronica:DocumentoSoporte DocumentoSoporte.xsd">

  <InformacionGeneral
    Version="V1.0: Documento Soporte en Adquisiciones a No Obligados a Facturar"
    TipoXML="105"
    ClaveDocumento="${documentKey}"
    EncripClaveDocumento="SHA-384"
    Consecutivo="${consecutive}"
    FechaGen="${issueDate}"
    HoraGen="${issueTime}"
    TipoMoneda="COP"/>

  <Adquirente
    RazonSocial="${this.escapeXml(payer.companyName)}"
    NIT="${this.escapeXml(payer.nit)}"
    DV="${this.escapeXml(payer.dv)}"
    SoftwareID="${this.escapeXml(payer.softwareId)}"/>

  <Beneficiario
    TipoDocumento="${this.escapeXml(beneficiary.typeDocument)}"
    NumeroDocumento="${this.escapeXml(settlement.taxId)}"
    RazonSocial="${this.escapeXml(settlement.professionalName)}"/>

  <Concepto
    Descripcion="${this.escapeXml(
      beneficiary.concept === 'HONORARIOS'
        ? 'Honorarios por servicios profesionales'
        : 'Servicios prestados'
    )}"
    HorasTrabajadas="${settlement.hoursWorked.toFixed(2)}"
    TarifaHora="${settlement.hourlyRate.toFixed(2)}"/>

  <Retencion
    Concepto="${this.escapeXml(settlement.retentionConcept)}"
    Tarifa="${(settlement.retentionRate * 100).toFixed(2)}"
    Valor="${settlement.retentionAmount.toFixed(2)}"/>

  <ValorBruto>${settlement.grossAmount.toFixed(2)}</ValorBruto>
  <ValorRetencion>${settlement.retentionAmount.toFixed(2)}</ValorRetencion>
  <ValorNeto>${settlement.netAmount.toFixed(2)}</ValorNeto>

</DocumentoSoporte>`.trim();

    return {
      documentKey,
      consecutive,
      issueDate,
      issueTime,
      xmlContent,
      grossAmount: settlement.grossAmount,
      retentionAmount: settlement.retentionAmount,
      netAmount: settlement.netAmount,
      disclaimer:
        'Documento generado por Kreadu Gestión-Future sin firma digital ' +
        'ni habilitación real ante la DIAN para este tipo de documento. ' +
        'Debe ser revisado y validado por un contador o proveedor de ' +
        'facturación electrónica antes de transmitirse en producción.',
    };
  }
}

export default DocumentoSoporteService;
