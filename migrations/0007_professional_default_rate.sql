-- Tarifa por hora "por defecto" del profesional (bolsa compartida),
-- para que al crear una vinculación (engagement) con una empresa
-- salga precargada en el formulario. La empresa siempre puede
-- cambiarla para esa vinculación puntual — esto sólo evita
-- escribirla desde cero cada vez.

ALTER TABLE professionals ADD COLUMN defaultHourlyRate REAL;
