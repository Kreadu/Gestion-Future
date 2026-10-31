-- Horas por tipo en el registro de horas del personal por horas
-- (camareros, aseo, temporales): `hours` pasa a ser las ordinarias
-- diurnas y cada recargo tiene su columna. Los registros anteriores
-- quedan como horas ordinarias diurnas, que es como se liquidaban.
ALTER TABLE time_entries ADD COLUMN hoursNight REAL NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN hoursSunday REAL NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN hoursSundayNight REAL NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN hoursExtraDay REAL NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN hoursExtraNight REAL NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN hoursExtraSundayDay REAL NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN hoursExtraSundayNight REAL NOT NULL DEFAULT 0;
