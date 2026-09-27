-- Nómina persistente: periodos, liquidaciones por empleado, y un
-- contador de consecutivos DIAN por empresa y tipo de documento
-- (compartido entre la nómina mensual y la nómina de jornada
-- parcial del módulo de personal por horas, que son el mismo tipo
-- de documento DIAN para un mismo NIT).
--
-- Antes de aplicar en remoto, confirma que employees no tenga ya
-- columnas bankName/bankAccountType/bankAccountNumber:
--   npx wrangler d1 execute gestion_future_db --remote \
--     --command "PRAGMA table_info(employees);"

CREATE TABLE IF NOT EXISTS dian_counters (
    companyId TEXT NOT NULL REFERENCES companies(id),
    documentType TEXT NOT NULL CHECK (documentType IN ('NOMINA', 'DOCUMENTO_SOPORTE')),
    lastConsecutive INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (companyId, documentType)
);

CREATE TABLE IF NOT EXISTS payroll_periods (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL REFERENCES companies(id),
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CLOSED')),
    createdAt TEXT,
    closedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_companyId ON payroll_periods(companyId);

CREATE TABLE IF NOT EXISTS payroll_settlements (
    id TEXT PRIMARY KEY,
    periodId TEXT NOT NULL REFERENCES payroll_periods(id),
    employeeId TEXT NOT NULL REFERENCES employees(id),
    companyId TEXT NOT NULL REFERENCES companies(id),

    daysWorked INTEGER NOT NULL,
    extraDiurna REAL DEFAULT 0,
    extraNocturna REAL DEFAULT 0,
    recargoNocturno REAL DEFAULT 0,

    grossEarnings REAL NOT NULL,
    totalDeductions REAL NOT NULL,
    netPay REAL NOT NULL,
    resultJson TEXT NOT NULL,

    dianStatus TEXT NOT NULL DEFAULT 'PENDING' CHECK (dianStatus IN ('PENDING', 'GENERATED')),
    dianConsecutive INTEGER,
    dianCune TEXT,
    dianXmlContent TEXT,
    dianGeneratedAt TEXT,

    createdAt TEXT,
    updatedAt TEXT,

    UNIQUE (periodId, employeeId)
);

CREATE INDEX IF NOT EXISTS idx_payroll_settlements_periodId ON payroll_settlements(periodId);
CREATE INDEX IF NOT EXISTS idx_payroll_settlements_companyId ON payroll_settlements(companyId);

ALTER TABLE employees ADD COLUMN bankName TEXT;
ALTER TABLE employees ADD COLUMN bankAccountType TEXT;
ALTER TABLE employees ADD COLUMN bankAccountNumber TEXT;
