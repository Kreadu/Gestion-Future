-- Prestaciones en dinero, vacaciones disfrutadas y liquidación
-- definitiva del contrato.

-- 1) Vacaciones disfrutadas como un tipo más de novedad: descuentan
--    días trabajados y se pagan al 100 % en la nómina del periodo,
--    igual que una licencia. SQLite no permite cambiar un CHECK, así
--    que la tabla se reconstruye (nadie la referencia).
CREATE TABLE employee_leaves_new (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL REFERENCES employees(id),
    companyId TEXT NOT NULL REFERENCES companies(id),
    leaveType TEXT NOT NULL CHECK (leaveType IN (
        'GENERAL_INCAPACITY', 'WORK_INCAPACITY', 'MATERNITY_LEAVE', 'PATERNITY_LEAVE', 'VACATION'
    )),
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    totalDays INTEGER NOT NULL,
    accumulatedDaysBefore INTEGER DEFAULT 0,
    -- Sólo vacaciones: días hábiles que se descuentan del saldo.
    businessDays REAL,
    notes TEXT,
    createdAt TEXT
);

INSERT INTO employee_leaves_new (
    id, employeeId, companyId, leaveType, startDate, endDate,
    totalDays, accumulatedDaysBefore, notes, createdAt
)
SELECT
    id, employeeId, companyId, leaveType, startDate, endDate,
    totalDays, accumulatedDaysBefore, notes, createdAt
FROM employee_leaves;

DROP TABLE employee_leaves;
ALTER TABLE employee_leaves_new RENAME TO employee_leaves;

CREATE INDEX IF NOT EXISTS idx_employee_leaves_employeeId ON employee_leaves(employeeId);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_companyId ON employee_leaves(companyId);

-- Días de vacaciones que el empleado ya había disfrutado antes de
-- usar la plataforma (para que el saldo arranque bien).
ALTER TABLE employees ADD COLUMN vacationDaysTakenBefore REAL NOT NULL DEFAULT 0;

-- Fin pactado (término fijo / obra o labor) y fecha de retiro.
ALTER TABLE employees ADD COLUMN contractEndDate TEXT;
ALTER TABLE employees ADD COLUMN terminationDate TEXT;

-- Salario integral (art. 132 CST): sin prima ni cesantías aparte.
ALTER TABLE employees ADD COLUMN isIntegralSalary INTEGER NOT NULL DEFAULT 0;

-- 2) Pagos de prestaciones: prima semestral, cesantías (consignación
--    al fondo) e intereses sobre cesantías.
CREATE TABLE IF NOT EXISTS benefit_payments (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL REFERENCES employees(id),
    companyId TEXT NOT NULL REFERENCES companies(id),
    benefitType TEXT NOT NULL CHECK (benefitType IN ('PRIMA', 'CESANTIAS', 'INTERESES_CESANTIAS')),
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    days INTEGER NOT NULL,
    base REAL NOT NULL,
    amount REAL NOT NULL,
    createdAt TEXT,
    UNIQUE (employeeId, benefitType, periodStart)
);

CREATE INDEX IF NOT EXISTS idx_benefit_payments_companyId ON benefit_payments(companyId);

-- 3) Liquidación definitiva del contrato.
CREATE TABLE IF NOT EXISTS employee_terminations (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL UNIQUE REFERENCES employees(id),
    companyId TEXT NOT NULL REFERENCES companies(id),
    terminationDate TEXT NOT NULL,
    reason TEXT NOT NULL,
    total REAL NOT NULL,
    resultJson TEXT NOT NULL,
    createdAt TEXT
);

-- 4) Fix: el dashboard etiquetaba el tipo de contrato al revés de la
--    tabla de la DIAN (1 = término fijo, 2 = término indefinido): lo
--    guardado como '1' se capturó como "indefinido" y viceversa.
UPDATE employees
SET contractType = CASE contractType WHEN '1' THEN '2' WHEN '2' THEN '1' ELSE contractType END;

UPDATE engagements
SET contractType = CASE contractType WHEN '1' THEN '2' WHEN '2' THEN '1' ELSE contractType END
WHERE contractType IS NOT NULL;
