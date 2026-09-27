-- Esquema base: empresas y empleados.
--
-- IMPORTANTE: usa CREATE TABLE IF NOT EXISTS, por lo que es un no-op
-- sobre la base de datos remota existente (las tablas ya existen ahí).
-- Sirve para levantar entornos nuevos desde cero (local, CI, réplicas)
-- con el esquema completo, incluyendo columnas añadidas más tarde
-- directamente en producción (logo, hireDate).
--
-- Antes de aplicar migraciones por primera vez sobre la base remota,
-- confirma que esas columnas ya existen ahí:
--   npx wrangler d1 execute gestion_future_db --remote \
--     --command "PRAGMA table_info(companies);"
--   npx wrangler d1 execute gestion_future_db --remote \
--     --command "PRAGMA table_info(employees);"
-- Si faltara alguna, añádela manualmente con ALTER TABLE ... ADD COLUMN
-- antes de correr `wrangler d1 migrations apply --remote`.

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
    logo TEXT,
    active INTEGER DEFAULT 1,
    createdAt TEXT
);

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
    hireDate TEXT,
    active INTEGER DEFAULT 1,
    createdAt TEXT,
    FOREIGN KEY (companyId) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_employees_companyId ON employees(companyId);
