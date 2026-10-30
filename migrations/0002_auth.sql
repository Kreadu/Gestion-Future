-- Usuarios de la plataforma y auditoría de acciones.
--
-- Los roles y la empresa asociada viven aquí (no en custom claims de
-- Firebase): el Worker resuelve el rol/companyId de cada request
-- consultando esta tabla por el uid de Firebase (o el email, en el
-- primer login, para enlazar la cuenta).
--
-- Para dar de alta al primer SUPER_ADMIN (no hay UI para esto):
--   npx wrangler d1 execute gestion_future_db --remote --command \
--     "INSERT INTO users (id, email, role, active, createdAt) VALUES \
--      ('USR-admin', 'tu-correo@dominio.com', 'SUPER_ADMIN', 1, datetime('now'));"

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    firebaseUid TEXT UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'EMPLOYEE')),
    companyId TEXT REFERENCES companies(id),
    employeeId TEXT REFERENCES employees(id),
    active INTEGER DEFAULT 1,
    createdAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_companyId ON users(companyId);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    userId TEXT,
    email TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entityId TEXT,
    companyId TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_companyId ON audit_log(companyId);
