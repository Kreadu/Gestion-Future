/**
 * Consecutivos DIAN por empresa y tipo de documento.
 *
 * La DIAN exige que la numeración de cada tipo de documento
 * electrónico sea consecutiva y sin huecos ni repeticiones por NIT
 * (Resolución 000013 de 2021 art. 5, compilada en la Resolución
 * 000227 de 2025). A diferencia de la factura electrónica, la
 * nómina electrónica no requiere un rango de numeración autorizado
 * previamente por la DIAN — sólo que la numeración propia sea
 * consecutiva.
 *
 * Un mismo NIT tiene UNA sola serie de "Nómina Electrónica" sin
 * importar si el empleado es de tiempo completo o de jornada
 * parcial: por eso la nómina mensual y la de jornada parcial (módulo
 * de personal por horas) comparten el mismo contador `'NOMINA'`. El
 * documento soporte a contratistas independientes es un tipo de
 * documento distinto y lleva su propia serie `'DOCUMENTO_SOPORTE'`.
 */

export type DianDocumentType = 'NOMINA' | 'DOCUMENTO_SOPORTE';

export async function getNextDianConsecutive(
  db: D1Database,
  companyId: string,
  documentType: DianDocumentType
): Promise<number> {
  await db
    .prepare(`
      INSERT INTO dian_counters (companyId, documentType, lastConsecutive)
      VALUES (?1, ?2, 0)
      ON CONFLICT(companyId, documentType) DO NOTHING
    `)
    .bind(companyId, documentType)
    .run();

  const row = await db
    .prepare(`
      UPDATE dian_counters
      SET lastConsecutive = lastConsecutive + 1
      WHERE companyId = ?1
        AND documentType = ?2
      RETURNING lastConsecutive
    `)
    .bind(companyId, documentType)
    .first<{ lastConsecutive: number }>();

  if (!row) {
    throw new Error(
      `No se pudo obtener el siguiente consecutivo DIAN (${documentType}) ` +
      `para la empresa ${companyId}.`
    );
  }

  return Number(row.lastConsecutive);
}
