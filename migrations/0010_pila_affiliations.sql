-- Datos de afiliación para generar el archivo plano PILA
-- (Resolución 2388 de 2016, planilla tipo E).
--
-- Los códigos de administradora son los que publica el operador /
-- Minsalud para PILA (ej. EPS: 'EPS037', AFP: '230301', CCF: 'CCF22',
-- ARL: '14-23'). DIVIPOLA: 5 dígitos, departamento + municipio
-- (ej. '19001' Popayán).

-- Empleado (cotizante).
ALTER TABLE employees ADD COLUMN documentType TEXT NOT NULL DEFAULT 'CC';
ALTER TABLE employees ADD COLUMN pilaContributorType TEXT NOT NULL DEFAULT '01';
ALTER TABLE employees ADD COLUMN pilaContributorSubtype TEXT NOT NULL DEFAULT '00';
ALTER TABLE employees ADD COLUMN epsCode TEXT;
ALTER TABLE employees ADD COLUMN afpCode TEXT;
ALTER TABLE employees ADD COLUMN ccfCode TEXT;
-- Municipio donde trabaja; si está vacío se usa el de la empresa.
ALTER TABLE employees ADD COLUMN divipolaCode TEXT;

-- Empresa (aportante).
ALTER TABLE companies ADD COLUMN arlCode TEXT;
ALTER TABLE companies ADD COLUMN pilaContributorType TEXT NOT NULL DEFAULT '01';
ALTER TABLE companies ADD COLUMN divipolaCode TEXT;
-- Código de actividad económica para ARL (7 dígitos, Decreto 768 de 2022).
ALTER TABLE companies ADD COLUMN arlActivityCode TEXT;
