-- Datos que el motor de nómina ya soportaba pero que no se guardaban
-- en ningún lado, así que toda liquidación salía con ARL clase I y
-- sin exoneración de aportes:
--
--   employees.arlRiskClass: clase de riesgo ARL del trabajador (1-5,
--     Decreto 1295 de 1994). Por defecto 1 (riesgo mínimo).
--   companies.isExempt114_1: la empresa es exonerada de salud del
--     empleador, SENA e ICBF (art. 114-1 ET) para trabajadores que
--     devenguen menos de 10 SMMLV. Por defecto 0.

ALTER TABLE employees ADD COLUMN arlRiskClass INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN isExempt114_1 INTEGER NOT NULL DEFAULT 0;

-- Evidencia de la aceptación de los Términos de uso y la Política de
-- tratamiento de datos (src/legal.ts) al crear la empresa: versión
-- aceptada, quién la aceptó, cuándo y desde qué IP. Las empresas que
-- ya existían quedan en NULL (no aceptaron en la Plataforma).
ALTER TABLE companies ADD COLUMN termsVersion TEXT;
ALTER TABLE companies ADD COLUMN termsAcceptedAt TEXT;
ALTER TABLE companies ADD COLUMN termsAcceptedBy TEXT;
ALTER TABLE companies ADD COLUMN termsAcceptedIp TEXT;
