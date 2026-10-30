-- Solicitudes del empleado desde el portal (vacaciones y permisos),
-- con aprobación del administrador de la empresa.
--
-- Al aprobar una solicitud de VACATION se registra la novedad en
-- employee_leaves (leaveId); PERMISSION queda como registro aprobado,
-- sin efecto en la nómina.

CREATE TABLE IF NOT EXISTS employee_requests (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL REFERENCES employees(id),
    companyId TEXT NOT NULL REFERENCES companies(id),
    requestType TEXT NOT NULL CHECK (requestType IN ('VACATION', 'PERMISSION')),
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    -- Sólo vacaciones: días hábiles pedidos.
    businessDays REAL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    decidedBy TEXT,
    decidedAt TEXT,
    decisionNotes TEXT,
    -- Sin FOREIGN KEY: la novedad se puede borrar; al hacerlo, la
    -- solicitud pasa a CANCELLED (DELETE /api/employee-leaves/:id).
    leaveId TEXT,
    createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_requests_company ON employee_requests(companyId, status);
CREATE INDEX IF NOT EXISTS idx_employee_requests_employee ON employee_requests(employeeId);
