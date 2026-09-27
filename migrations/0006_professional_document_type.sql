-- Tipo de documento del profesional por horas.
--
-- Hasta ahora el documento soporte DIAN y la nómina de jornada
-- parcial asumían siempre cédula de ciudadanía ('13') para el
-- profesional/contratista. En la práctica, un profesional
-- independiente (contador, consultor, etc.) frecuentemente opera
-- bajo NIT ('31') en vez de cédula, y el NIT lleva dígito de
-- verificación (dv) — el mismo patrón que ya existe para `companies`.
--
-- `dv` sólo aplica (y sólo se persiste) cuando documentType = '31'.

ALTER TABLE professionals ADD COLUMN documentType TEXT DEFAULT '13';
ALTER TABLE professionals ADD COLUMN dv TEXT;
