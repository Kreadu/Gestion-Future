-- Bolsa de talento por horas: profesionales compartidos entre
-- empresas, vinculaciones (engagements) con cada empresa cliente,
-- registro de horas, verificación de PILA para contratistas
-- independientes, y liquidaciones.
--
-- La modalidad EST_MISSION (trabajador en misión vía Empresa de
-- Servicios Temporales) se admite en el CHECK de `engagements` para
-- no tener que migrar de nuevo el día que se active, pero la API no
-- permite crear vinculaciones con ese valor hasta que la empresa
-- confirme tener la autorización del Ministerio del Trabajo.

CREATE TABLE IF NOT EXISTS professionals (
    id TEXT PRIMARY KEY,
    firstName TEXT NOT NULL,
    firstName2 TEXT,
    lastName TEXT NOT NULL,
    lastName2 TEXT,
    taxId TEXT NOT NULL UNIQUE,
    profession TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    city TEXT,
    bankName TEXT,
    bankAccountType TEXT,
    bankAccountNumber TEXT,
    active INTEGER DEFAULT 1,
    createdAt TEXT
);

CREATE TABLE IF NOT EXISTS engagements (
    id TEXT PRIMARY KEY,
    professionalId TEXT NOT NULL REFERENCES professionals(id),
    companyId TEXT NOT NULL REFERENCES companies(id),
    vinculationType TEXT NOT NULL CHECK (vinculationType IN (
        'INDEPENDENT_SERVICES', 'PART_TIME_EMPLOYEE', 'EST_MISSION'
    )),

    hourlyRate REAL NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT,
    active INTEGER DEFAULT 1,

    -- Sólo INDEPENDENT_SERVICES
    retentionConcept TEXT,
    isIncomeTaxFiler INTEGER,
    deliverableDescription TEXT,

    -- Sólo PART_TIME_EMPLOYEE
    weeklyHours REAL,
    contractType TEXT,

    createdAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_engagements_companyId ON engagements(companyId);
CREATE INDEX IF NOT EXISTS idx_engagements_professionalId ON engagements(professionalId);

CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    engagementId TEXT NOT NULL REFERENCES engagements(id),
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    hours REAL NOT NULL,
    notes TEXT,
    createdAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_time_entries_engagementId ON time_entries(engagementId);

-- Verificación de aportes a seguridad social del contratista
-- independiente. El contratante tiene el deber legal de verificar
-- este pago antes de liquidar (Ley 1955/2019 art. 244).
CREATE TABLE IF NOT EXISTS pila_verifications (
    id TEXT PRIMARY KEY,
    engagementId TEXT NOT NULL REFERENCES engagements(id),
    period TEXT NOT NULL,
    declaredIbc REAL NOT NULL,
    verified INTEGER DEFAULT 0,
    verifiedBy TEXT,
    verifiedAt TEXT,
    planillaReference TEXT,
    createdAt TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pila_engagement_period
    ON pila_verifications(engagementId, period);

CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    engagementId TEXT NOT NULL REFERENCES engagements(id),
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    totalHours REAL NOT NULL,
    grossAmount REAL NOT NULL,
    retentionAmount REAL NOT NULL DEFAULT 0,
    netAmount REAL NOT NULL,
    resultJson TEXT NOT NULL,
    createdAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_settlements_engagementId ON settlements(engagementId);
