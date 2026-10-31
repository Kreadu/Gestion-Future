-- Notas de ajuste de la nómina electrónica (TipoXML 103), sobre una
-- liquidación cuyo documento ya aceptó la DIAN:
--   noteType = 'REPLACE' (TipoNota 1): reemplaza el documento con la
--              nómina corregida (calculationJson + inputJson).
--   noteType = 'DELETE'  (TipoNota 2): elimina el documento.
-- predecessor*: el último documento aceptado de esa liquidación (la
-- nómina original o el último reemplazo aceptado).
-- sourceTable: payroll_settlements (mensual) o settlements (por horas).
CREATE TABLE IF NOT EXISTS dian_adjustments (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL REFERENCES companies(id),
    sourceTable TEXT NOT NULL CHECK (sourceTable IN ('payroll_settlements', 'settlements')),
    sourceId TEXT NOT NULL,
    noteType TEXT NOT NULL CHECK (noteType IN ('REPLACE', 'DELETE')),
    reason TEXT,
    predecessorNumber TEXT NOT NULL,
    predecessorCune TEXT NOT NULL,
    predecessorDate TEXT NOT NULL,
    dianConsecutive INTEGER NOT NULL,
    dianNumber TEXT NOT NULL,
    dianCune TEXT NOT NULL,
    dianXmlContent TEXT NOT NULL,
    inputJson TEXT,
    calculationJson TEXT,
    totalDevengado REAL NOT NULL DEFAULT 0,
    totalDeducciones REAL NOT NULL DEFAULT 0,
    totalComprobante REAL NOT NULL DEFAULT 0,
    dianSubmissionStatus TEXT CHECK (dianSubmissionStatus IN ('SENT', 'ACCEPTED', 'REJECTED')),
    dianTrackId TEXT,
    dianSignedXml TEXT,
    dianResponseJson TEXT,
    dianSentAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_dian_adjustments_source ON dian_adjustments (sourceTable, sourceId);

-- Serie propia de las notas de ajuste (prefijo NA): la tabla se rehace
-- porque SQLite no deja cambiar el CHECK de documentType.
CREATE TABLE dian_counters_new (
    companyId TEXT NOT NULL REFERENCES companies(id),
    documentType TEXT NOT NULL CHECK (documentType IN ('NOMINA', 'NOMINA_AJUSTE', 'DOCUMENTO_SOPORTE')),
    lastConsecutive INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (companyId, documentType)
);
INSERT INTO dian_counters_new (companyId, documentType, lastConsecutive)
    SELECT companyId, documentType, lastConsecutive FROM dian_counters;
DROP TABLE dian_counters;
ALTER TABLE dian_counters_new RENAME TO dian_counters;
