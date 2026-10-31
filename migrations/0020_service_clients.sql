-- Clientes del personal por horas de la empresa (temporales y servicios):
--   figure = 'EST'      empresa usuaria de trabajadores en misión
--                       (requiere autorización del Ministerio del Trabajo)
--   figure = 'SERVICIO' contratante de un servicio (aseo, meseros...)
--                       que la empresa ejecuta con su propio personal.
-- billingMode: 'HOURLY_RATE' (horas × tarifa de cobro de la asignación,
-- con los mismos recargos) o 'COST_PLUS' (costo de nómina + % admin).
CREATE TABLE IF NOT EXISTS service_clients (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    nit TEXT,
    address TEXT,
    city TEXT,
    figure TEXT NOT NULL CHECK (figure IN ('EST', 'SERVICIO')),
    billingMode TEXT NOT NULL DEFAULT 'COST_PLUS' CHECK (billingMode IN ('HOURLY_RATE', 'COST_PLUS')),
    adminFeePct REAL NOT NULL DEFAULT 0,
    arlRiskClass INTEGER NOT NULL DEFAULT 1 CHECK (arlRiskClass BETWEEN 1 AND 5),
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_service_clients_companyId ON service_clients(companyId);

-- Autorización de la empresa como EST (Ley 50 de 1990, Decreto 4369 de 2006).
CREATE TABLE IF NOT EXISTS company_est_authorization (
    companyId TEXT PRIMARY KEY REFERENCES companies(id),
    resolution TEXT NOT NULL,
    resolutionDate TEXT NOT NULL,
    insurancePolicy TEXT,
    updatedAt TEXT NOT NULL
);

-- Asignación de cada vinculación por horas a un cliente.
ALTER TABLE engagements ADD COLUMN clientId TEXT REFERENCES service_clients(id);
ALTER TABLE engagements ADD COLUMN position TEXT;
ALTER TABLE engagements ADD COLUMN billRate REAL;
