-- Registro de actividad: acciones con nombre propio e índice para
-- consultarlo por empresa y fecha (GET /api/audit-log).
--
-- Antes de esta migración el cierre de periodo se registraba como
-- UPDATE payroll_period (era la única acción UPDATE sobre periodos).
-- Los UPDATE payroll_settlement antiguos pueden ser recálculo o XML
-- DIAN y no se pueden distinguir: se dejan como están.

UPDATE audit_log SET action = 'CLOSE' WHERE action = 'UPDATE' AND entity = 'payroll_period';

CREATE INDEX IF NOT EXISTS idx_audit_company_at ON audit_log(companyId, at, id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at, id);
