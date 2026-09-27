-- Incapacidades y licencias de maternidad/paternidad de empleados.
--
-- No se rastrea automáticamente la continuidad entre incapacidades:
-- quien registra una incapacidad general de enfermedad común indica
-- manualmente cuántos días acumulados de incapacidad continua tenía
-- el empleado ANTES de esta (accumulatedDaysBefore), ya que "qué
-- cuenta como continua" es un criterio de RRHH, no algo a inferir.

CREATE TABLE IF NOT EXISTS employee_leaves (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL REFERENCES employees(id),
    companyId TEXT NOT NULL REFERENCES companies(id),
    leaveType TEXT NOT NULL CHECK (leaveType IN (
        'GENERAL_INCAPACITY', 'WORK_INCAPACITY', 'MATERNITY_LEAVE', 'PATERNITY_LEAVE'
    )),
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    totalDays INTEGER NOT NULL,
    accumulatedDaysBefore INTEGER DEFAULT 0,
    notes TEXT,
    createdAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_employee_leaves_employeeId ON employee_leaves(employeeId);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_companyId ON employee_leaves(companyId);
