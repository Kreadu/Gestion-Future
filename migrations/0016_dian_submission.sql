-- Envío de la nómina electrónica a la DIAN (firma XAdES + servicio web).
--   dianSubmissionStatus: NULL (sin enviar), SENT (en proceso en la DIAN),
--   ACCEPTED o REJECTED. dianTrackId es el ZipKey de habilitación.
ALTER TABLE payroll_settlements ADD COLUMN dianSubmissionStatus TEXT
    CHECK (dianSubmissionStatus IN ('SENT', 'ACCEPTED', 'REJECTED'));
ALTER TABLE payroll_settlements ADD COLUMN dianTrackId TEXT;
ALTER TABLE payroll_settlements ADD COLUMN dianSignedXml TEXT;
ALTER TABLE payroll_settlements ADD COLUMN dianResponseJson TEXT;
ALTER TABLE payroll_settlements ADD COLUMN dianSentAt TEXT;
