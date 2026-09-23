-- Kreadu Gestión-Future · schema completo para Cloudflare D1
-- Base: gestion_future_db
--
-- Uso (solo para crear la base desde cero, si no existe todavía):
--   npx wrangler d1 execute gestion_future_db --remote --file=./schema.sql
--
-- Si tus tablas YA EXISTEN con menos columnas, no ejecutes esto de nuevo:
-- usa en su lugar los ALTER TABLE que te pasé antes para completarlas.

-- Tabla de Empresas
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    nit TEXT NOT NULL,
    dv TEXT,
    address TEXT,
    city TEXT,
    department TEXT,
    postalCode TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    contactName TEXT,
    legalRepresentative TEXT,
    taxRegime TEXT,
    economicActivity TEXT,
    active INTEGER DEFAULT 1,
    createdAt TEXT
);

-- Tabla de Empleados
CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    firstName TEXT NOT NULL,
    firstName2 TEXT,
    lastName TEXT NOT NULL,
    lastName2 TEXT,
    taxId TEXT NOT NULL,
    position TEXT,
    contractType TEXT,
    salary REAL NOT NULL,
    address TEXT,
    city TEXT,
    country TEXT DEFAULT 'Colombia',
    phone TEXT,
    whatsapp TEXT,
    active INTEGER DEFAULT 1,
    createdAt TEXT,
    FOREIGN KEY (companyId) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_employees_companyId ON employees(companyId);