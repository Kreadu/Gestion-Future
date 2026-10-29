// ------------------------------------------------------------
// CERTIFICADOS — ingresos y retenciones (formulario 220) y laboral
//
// Componentes globales reutilizables (también los usa el portal del
// empleado):
//   <IncomeCertificateSheet data={...} />      hoja del formulario 220
//   <EmploymentCertificateSheet data={...} />  certificado laboral
//   <CertificatePrintable>{hoja}</CertificatePrintable>
//       muestra la hoja y, al imprimir (window.print()), imprime SÓLO
//       esa hoja en blanco y negro.
//   <CertificatesButton employee={...} />      botón + modal del admin
// `data` es exactamente lo que devuelven
//   GET /api/employees/:id/income-certificate?year=AAAA
//   GET /api/employees/:id/employment-certificate
// ------------------------------------------------------------

const CERT_PRINT_CSS =
  '@media screen { .cert-print-root { display: none; } }' +
  '@media print {' +
  '  html, body { background: #fff !important; color: #000 !important; }' +
  '  body > *:not(.cert-print-root) { display: none !important; }' +
  '  .cert-print-root { display: block !important; }' +
  '  .cert-print-root .cert-sheet { border: 0 !important; box-shadow: none !important; margin: 0 !important; }' +
  '  @page { size: letter; margin: 14mm; }' +
  '}';

const CERT_DOCUMENT_TYPES = { '13': 'Cédula de ciudadanía', '22': 'Cédula de extranjería', '41': 'Pasaporte' };

function certDateLong(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(iso + 'T00:00:00Z'));
}

function certNit(company) {
  return company.nit + (company.dv ? '-' + company.dv : '');
}

const certSheetStyle = {
  background: '#fff',
  color: '#111',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  lineHeight: 1.45,
  padding: '28px 32px',
  border: '1px solid #d4d4d8',
  borderRadius: '4px',
  maxWidth: '780px',
  margin: '0 auto'
};

const certCell = { border: '1px solid #9ca3af', padding: '5px 7px', verticalAlign: 'top' };
const certLabel = { fontSize: '9px', textTransform: 'uppercase', color: '#4b5563', display: 'block' };
const certSection = { background: '#e5e7eb', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' };

/** Muestra la hoja y la deja lista para window.print() (sólo la hoja). */
function CertificatePrintable({ children }) {
  const printCopy = typeof document !== 'undefined' && ReactDOM.createPortal
    ? ReactDOM.createPortal(<div className="cert-print-root">{children}</div>, document.body)
    : null;

  return (
    <>
      <style>{CERT_PRINT_CSS}</style>
      {children}
      {printCopy}
    </>
  );
}

function IncomeCertificateSheet({ data }) {
  const { company, employee, certificate } = data;
  const boxes = certificate.boxes;

  function rows(section) {
    return boxes.filter(function(b) { return b.section === section; }).map(function(b) {
      return (
        <tr key={b.key} style={b.total ? { fontWeight: 700 } : null}>
          <td style={certCell}>{b.label}</td>
          <td style={{ ...certCell, textAlign: 'right', whiteSpace: 'nowrap', width: '150px' }}>{formatCOP(b.value)}</td>
        </tr>
      );
    });
  }

  const d = certificate.detail;
  const detail = [
    ['Salario básico', d.salarioBasico],
    ['Horas extra, recargos y dominicales', d.horasExtraRecargos],
    ['Incapacidades y licencias', d.incapacidadesLicencias],
    ['Vacaciones disfrutadas', d.vacacionesDisfrutadas],
    ['Vacaciones compensadas en dinero', d.vacacionesCompensadas],
    ['Auxilio de transporte', d.auxilioTransporte],
    ['Prima de servicios', d.prima],
    ['Cesantías pagadas al trabajador', d.cesantiasPagadas],
    ['Intereses sobre cesantías', d.interesesCesantias],
    ['Cesantías consignadas al fondo', d.cesantiasConsignadas],
    ['Indemnización por despido', d.indemnizacion]
  ].filter(function(r) { return r[1]; });

  return (
    <div className="cert-sheet" style={certSheetStyle}>
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', color: '#4b5563' }}>Formulario 220 · DIAN</div>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>
          Certificado de Ingresos y Retenciones por Rentas de Trabajo y de Pensiones
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700 }}>Año gravable {data.year}</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr><td colSpan={4} style={{ ...certCell, ...certSection }}>Retenedor</td></tr>
          <tr>
            <td style={certCell}><span style={certLabel}>NIT</span>{company.nit}</td>
            <td style={certCell}><span style={certLabel}>DV</span>{company.dv || ''}</td>
            <td style={certCell} colSpan={2}><span style={certLabel}>Razón social</span>{company.name}</td>
          </tr>
          <tr><td colSpan={4} style={{ ...certCell, ...certSection }}>Trabajador</td></tr>
          <tr>
            <td style={certCell}><span style={certLabel}>Tipo de documento</span>{CERT_DOCUMENT_TYPES[employee.documentType] || employee.documentType}</td>
            <td style={certCell}><span style={certLabel}>Número de identificación</span>{employee.taxId}</td>
            <td style={certCell}><span style={certLabel}>Apellidos</span>{[employee.lastName, employee.lastName2].filter(Boolean).join(' ')}</td>
            <td style={certCell}><span style={certLabel}>Nombres</span>{[employee.firstName, employee.firstName2].filter(Boolean).join(' ')}</td>
          </tr>
          <tr>
            <td style={certCell}><span style={certLabel}>Periodo de la certificación</span>{data.period.from} a {data.period.to}</td>
            <td style={certCell}><span style={certLabel}>Fecha de expedición</span>{data.issueDate}</td>
            <td style={certCell} colSpan={2}><span style={certLabel}>Lugar donde se practicó la retención</span>{data.retentionPlace || '—'}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <tbody>
          <tr><td style={{ ...certCell, ...certSection }}>Concepto de los ingresos</td><td style={{ ...certCell, ...certSection, textAlign: 'right' }}>Valor</td></tr>
          {rows('INGRESOS')}
          <tr><td style={{ ...certCell, ...certSection }}>Concepto de los aportes</td><td style={{ ...certCell, ...certSection, textAlign: 'right' }}>Valor</td></tr>
          {rows('APORTES')}
          {rows('RETENCION').map(function(r) { return React.cloneElement(r, { style: { fontWeight: 700 } }); })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', margin: '26px 0 14px' }}>
        <div style={{ flex: 1, borderTop: '1px solid #111', paddingTop: '4px' }}>
          Firma del retenedor{company.legalRepresentative ? ' · ' + company.legalRepresentative : ''}
        </div>
        <div style={{ flex: 1, fontSize: '10px', color: '#4b5563' }}>
          Este certificado sustituye la declaración de renta del trabajador cuando no esté obligado a declarar (art. 1.6.1.13.2.7 DUR 1625 de 2016).
        </div>
      </div>

      {detail.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '11px' }}>
          <tbody>
            <tr><td colSpan={2} style={{ ...certCell, ...certSection }}>Detalle informativo de los pagos</td></tr>
            {detail.map(function(r) {
              return (
                <tr key={r[0]}>
                  <td style={certCell}>{r[0]}</td>
                  <td style={{ ...certCell, textAlign: 'right', width: '150px' }}>{formatCOP(r[1])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ul style={{ fontSize: '10px', color: '#4b5563', paddingLeft: '16px', margin: 0 }}>
        {certificate.notes.map(function(n) { return <li key={n}>{n}</li>; })}
      </ul>
    </div>
  );
}

function EmploymentCertificateSheet({ data }) {
  const { company, employee } = data;
  const docLabel = (CERT_DOCUMENT_TYPES[employee.documentType] || 'documento de identidad').toLowerCase();
  const working = employee.active && !employee.terminationDate;

  return (
    <div className="cert-sheet" style={{ ...certSheetStyle, fontSize: '14px', lineHeight: 1.7, padding: '48px 56px' }}>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        {company.logo && <img src={company.logo} alt="" style={{ maxHeight: '60px', marginBottom: '8px' }} />}
        <div style={{ fontSize: '16px', fontWeight: 700 }}>{company.name}</div>
        <div>NIT {certNit(company)}</div>
        {company.address && <div style={{ fontSize: '12px' }}>{company.address}{company.city ? ' · ' + company.city : ''}</div>}
      </div>

      <div style={{ textAlign: 'center', fontWeight: 700, margin: '24px 0' }}>CERTIFICA QUE:</div>

      <p style={{ textAlign: 'justify' }}>
        <strong>{employee.fullName}</strong>, identificado(a) con {docLabel} No. <strong>{employee.taxId}</strong>,{' '}
        {working ? 'labora' : 'laboró'} en esta empresa desde el <strong>{certDateLong(employee.hireDate) || '—'}</strong>
        {!working && employee.terminationDate ? <> hasta el <strong>{certDateLong(employee.terminationDate)}</strong></> : null}
        {employee.position ? <>, desempeñando el cargo de <strong>{employee.position}</strong></> : null}
        , mediante contrato de trabajo a <strong>{employee.contractTypeLabel.toLowerCase()}</strong>
        {working && employee.contractEndDate ? <> con vencimiento el {certDateLong(employee.contractEndDate)}</> : null}
        {working ? ', devengando un salario ' : ', con un último salario '}{employee.isIntegralSalary ? 'integral ' : ''}mensual de{' '}
        <strong>{formatCOP(employee.salary)}</strong>.
      </p>

      <p style={{ textAlign: 'justify' }}>
        La presente certificación se expide a solicitud del interesado{company.city ? ' en ' + company.city : ''}, el{' '}
        {certDateLong(data.issueDate)}.
      </p>

      <div style={{ marginTop: '72px', width: '280px', borderTop: '1px solid #111', paddingTop: '6px' }}>
        <div style={{ fontWeight: 700 }}>{company.legalRepresentative || ' '}</div>
        <div>Representante legal</div>
        <div>{company.name}</div>
      </div>
    </div>
  );
}

function CertificatesModal({ employee, onClose }) {
  const [tab, setTab] = useState('income');
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [income, setIncome] = useState(null);
  const [employment, setEmployment] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const base = '/api/employees/' + encodeURIComponent(employee.id);

  async function loadIncome() {
    setError('');
    setLoading(true);
    setIncome(null);
    try {
      const r = await api(base + '/income-certificate?year=' + encodeURIComponent(year));
      setIncome(r.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(function() {
    if (tab !== 'employment' || employment) return;
    let cancelled = false;
    setError('');
    api(base + '/employment-certificate')
      .then(function(r) { if (!cancelled) setEmployment(r.data); })
      .catch(function(err) { if (!cancelled) setError(err.message); });
    return function() { cancelled = true; };
  }, [tab]);

  useEffect(function() {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, []);

  const sheet = tab === 'income'
    ? (income && <IncomeCertificateSheet data={income} />)
    : (employment && <EmploymentCertificateSheet data={employment} />);

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Certificados" style={{ width: 'min(860px, 100%)' }}>
        <div className="modal-header">
          <h3>🧾 Certificados · {getEmployeeName(employee)}</h3>
          <button className="btn" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <button className={'btn' + (tab === 'income' ? ' btn-primary' : '')} onClick={function() { setTab('income'); }}>
              Ingresos y retenciones (220)
            </button>
            <button className={'btn' + (tab === 'employment' ? ' btn-primary' : '')} onClick={function() { setTab('employment'); }}>
              Certificado laboral
            </button>
          </div>

          {error && <div className="alert" style={{ position: 'static', margin: '0 0 12px' }}>{error}</div>}

          {tab === 'income' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="cert-year">Año gravable</label>
                <input id="cert-year" type="number" min="2000" max="2100" value={year}
                  onChange={function(e) { setYear(e.target.value); setIncome(null); }} />
              </div>
              <button className="btn btn-primary" onClick={loadIncome} disabled={loading}>Generar certificado</button>
            </div>
          )}

          {sheet && <CertificatePrintable>{sheet}</CertificatePrintable>}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cerrar</button>
          {sheet && <button className="btn" onClick={function() { window.print(); }}>🖨️ Imprimir / PDF</button>}
        </div>
      </div>
    </div>
  );
}

/** Botón "🧾 Certificados" con su modal (para el recuadro del empleado). */
function CertificatesButton({ employee }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn" onClick={function() { setOpen(true); }}>🧾 Certificados</button>
      {open && <CertificatesModal employee={employee} onClose={function() { setOpen(false); }} />}
    </>
  );
}
