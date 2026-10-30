// ------------------------------------------------------------
// PORTAL DEL EMPLEADO — lo que ve un usuario con rol EMPLOYEE:
// sus datos, vacaciones, desprendibles, prestaciones y certificado.
// Todo sale de /api/portal/* (el backend filtra por su usuario).
// ------------------------------------------------------------

const PORTAL_CONTRACT_LABELS = {
  '1': 'Término fijo',
  '2': 'Término indefinido',
  '3': 'Obra o labor',
  '4': 'Aprendizaje',
  '5': 'Prácticas o pasantías'
};

const PORTAL_BENEFIT_LABELS = {
  PRIMA: 'Prima de servicios',
  CESANTIAS: 'Cesantías',
  INTERESES_CESANTIAS: 'Intereses sobre cesantías'
};

const PORTAL_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function portalLongDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return Number(d) + ' de ' + PORTAL_MONTHS[Number(m) - 1] + ' de ' + y;
}

function portalCompanyLine(company) {
  if (!company) return '';
  return company.name + (company.nit ? ' · NIT ' + company.nit + (company.dv ? '-' + company.dv : '') : '');
}

// Estilos propios del portal: celular (sin scroll horizontal) e
// impresión (sólo la hoja abierta, en blanco y negro).
const PORTAL_CSS = `
  .portal-main { max-width: 980px; margin: 0 auto; padding: 18px 16px 120px; }
  .portal-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .portal-tabs .btn[aria-selected="true"] { background: #2563eb; border-color: #2563eb; color: #fff; }
  .portal-card { border: 1px solid #1d3047; border-radius: 12px; background: #0b1829; margin-bottom: 16px; overflow: hidden; }
  .portal-card > h2 { margin: 0; padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #1d3047; }
  .portal-card > .portal-card-body { padding: 14px 16px; }
  .portal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .portal-list-item { display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 12px 0; border-bottom: 1px solid #15263a; font-size: 13px; }
  .portal-list-item:last-child { border-bottom: none; }
  .portal-muted { color: #8193aa; font-size: 12px; }
  .portal-sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.82); z-index: 9999;
    overflow-y: auto; padding: 24px 12px 80px; }
  .portal-print { max-width: 900px; margin: 0 auto; background: #fff; color: #111827;
    border-radius: 10px; overflow: hidden; box-shadow: 0 25px 70px rgba(0,0,0,.5); }
  .portal-print-head { padding: 20px 24px; border-bottom: 1px solid #e5e7eb; display: flex;
    justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
  .portal-print-body { padding: 24px; }
  .portal-print-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
  .portal-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; font-size: 13px; }
  .portal-box-title { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 8px; letter-spacing: .5px; }
  .portal-print h3 { font-size: 15px; border-bottom: 2px solid #111827; padding-bottom: 8px; margin: 0 0 8px; }
  .portal-print table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 22px; }
  .portal-print td { padding: 8px 4px; border-bottom: 1px solid #e5e7eb; }
  .portal-print td.num { text-align: right; white-space: nowrap; }
  .portal-print tr.total td { font-weight: 800; border-bottom: none; }
  .portal-net { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px;
    display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .portal-print .btn { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }
  .portal-letter { font-size: 14px; line-height: 1.7; }
  @media (max-width: 600px) {
    .portal-grid, .portal-print-cols { grid-template-columns: 1fr; }
    .portal-print-head, .portal-print-body { padding: 16px; }
    .portal-main { padding-bottom: 170px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    body * { visibility: hidden; }
    .portal-print, .portal-print * { visibility: visible; }
    .portal-sheet-backdrop { position: static; background: none; padding: 0; overflow: visible; }
    .portal-print { position: absolute; left: 0; top: 0; width: 100%; max-width: none; box-shadow: none; border-radius: 0; }
    .portal-no-print { display: none !important; }
  }
`;

function PortalSheet({ title, subtitle, company, onClose, children }) {
  return (
    <div className="portal-sheet-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="portal-print">
        <div className="portal-print-head">
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '1px' }}>
              KREADU GESTION-FUTURE
            </div>
            <h2 style={{ margin: '5px 0', fontSize: '21px' }}>{title}</h2>
            {subtitle && <div style={{ fontSize: '13px', color: '#64748b' }}>{subtitle}</div>}
            {company && <div style={{ fontSize: '13px', marginTop: '4px' }}>{portalCompanyLine(company)}</div>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {company && company.hasLogo && (
              <CompanyLogo company={company}
                style={{ maxHeight: '42px', maxWidth: '120px', objectFit: 'contain' }} />
            )}
            <button className="btn portal-no-print" onClick={function() { window.print(); }}>🖨️ Imprimir</button>
            <button className="btn portal-no-print" onClick={onClose}>✕ Cerrar</button>
          </div>
        </div>

        <div className="portal-print-body">
          {children}
          {renderKreaduFooter()}
        </div>
      </div>
    </div>
  );
}

function PortalRows({ rows, totalLabel, total }) {
  return (
    <table>
      <tbody>
        {rows.map(function(r) {
          return (
            <tr key={r[0]}>
              <td>{r[0]}</td>
              <td className="num">{formatCOP(r[1])}</td>
            </tr>
          );
        })}
        <tr className="total">
          <td>{totalLabel}</td>
          <td className="num">{formatCOP(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function PayslipSheet({ payslip, onClose }) {
  const c = payslip.calculation || {};
  const d = c.employeeDeductions || {};
  const emp = payslip.employee;

  const earnings = [
    ['Salario básico', c.baseSalaryEarned],
    ['Auxilio de transporte', c.earnedAuxTransporte],
    ['Horas extras diurnas', c.extraDiurnaValue],
    ['Horas extras nocturnas', c.extraNocturnaValue],
    ['Recargo nocturno', c.recargoNocturnoValue],
    ['Dominical/festivo', c.dominicalFestivoValue],
    ['Incapacidad/licencia/vacaciones', c.leaveValue]
  ].filter(function(r, i) { return i === 0 || Number(r[1]) > 0; });

  const deductions = [
    ['Salud · 4%', d.health4pct],
    ['Pensión · 4%', d.pension4pct],
    ['Fondo de solidaridad pensional', d.fspValue],
    ['Retención en la fuente', d.retencionFuente]
  ].filter(function(r, i) { return i < 2 || Number(r[1]) > 0; });

  return (
    <PortalSheet
      title="Desprendible de pago"
      subtitle={'Nómina del ' + payslip.periodStart + ' al ' + payslip.periodEnd}
      company={payslip.company}
      onClose={onClose}
    >
      {payslip.periodStatus !== 'CLOSED' && (
        <div style={{ background: '#fef3c7', color: '#92400e', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', marginBottom: '16px' }}>
          Periodo aún no cerrado: los valores pueden ajustarse antes del pago definitivo.
        </div>
      )}

      <div className="portal-print-cols">
        <div className="portal-box">
          <div className="portal-box-title">TRABAJADOR</div>
          <strong style={{ fontSize: '16px' }}>{emp.fullName}</strong>
          <div style={{ marginTop: '6px' }}>Documento: {emp.taxId}</div>
          {emp.position && <div style={{ marginTop: '4px' }}>Cargo: {emp.position}</div>}
          {emp.hireDate && <div style={{ marginTop: '4px' }}>Fecha de ingreso: {emp.hireDate}</div>}
        </div>
        <div className="portal-box">
          <div className="portal-box-title">PERÍODO</div>
          <strong style={{ fontSize: '16px' }}>{payslip.periodStart} a {payslip.periodEnd}</strong>
          <div style={{ marginTop: '6px' }}>Días trabajados: {payslip.daysWorked}</div>
          {emp.bankName && (
            <div style={{ marginTop: '4px' }}>
              Pago: {emp.bankName} {emp.bankAccountType ? '(' + emp.bankAccountType.toLowerCase() + ')' : ''} {emp.bankAccountNumber}
            </div>
          )}
        </div>
      </div>

      <h3>Devengados</h3>
      <PortalRows rows={earnings} totalLabel="TOTAL DEVENGADO" total={payslip.grossEarnings} />

      <h3>Deducciones</h3>
      <PortalRows rows={deductions} totalLabel="TOTAL DEDUCCIONES" total={payslip.totalDeductions} />

      <div className="portal-net">
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>NETO A PAGAR</div>
          <div style={{ fontSize: '28px', fontWeight: '900', marginTop: '4px' }}>{formatCOP(payslip.netPay)}</div>
        </div>
        {c.ibcSecuritySocial > 0 && (
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            IBC seguridad social<br />
            <strong style={{ color: '#111827' }}>{formatCOP(c.ibcSecuritySocial)}</strong>
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px', fontSize: '11px', color: '#64748b' }}>
        Documento generado por Kreadu Gestion-Future a partir de la liquidación
        registrada por tu empleador. El soporte oficial es la nómina electrónica
        transmitida a la DIAN.
      </div>
    </PortalSheet>
  );
}

function TerminationSheet({ termination, employee, company, onClose }) {
  const result = termination.result || { lines: [], notes: [] };
  const reasons = typeof TERMINATION_REASON_LABELS !== 'undefined' ? TERMINATION_REASON_LABELS : {};

  return (
    <PortalSheet
      title="Liquidación definitiva del contrato"
      subtitle={'Retiro: ' + termination.terminationDate + ' · ' + (reasons[termination.reason] || termination.reason)}
      company={company}
      onClose={onClose}
    >
      <div className="portal-box" style={{ marginBottom: '18px' }}>
        <strong>{employee.fullName}</strong> · Documento {employee.taxId}
        {employee.hireDate && <> · Ingreso {employee.hireDate}</>}
      </div>

      <table>
        <tbody>
          {(result.lines || []).map(function(l) {
            return (
              <tr key={l.concept}>
                <td>{l.concept}{l.days ? <span style={{ color: '#64748b' }}> · {formatNumber2(l.days)} días</span> : null}</td>
                <td className="num">{formatCOP(l.amount)}</td>
              </tr>
            );
          })}
          {result.retencionIndemnizacion > 0 && (
            <tr>
              <td>Retención en la fuente sobre indemnización</td>
              <td className="num">− {formatCOP(result.retencionIndemnizacion)}</td>
            </tr>
          )}
          <tr className="total">
            <td>TOTAL A PAGAR</td>
            <td className="num">{formatCOP(termination.total)}</td>
          </tr>
        </tbody>
      </table>

      {(result.notes || []).length > 0 && (
        <ul style={{ fontSize: '11px', color: '#64748b' }}>
          {result.notes.map(function(n) { return <li key={n}>{n}</li>; })}
        </ul>
      )}
    </PortalSheet>
  );
}

function PortalInfo({ label, value }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong style={{ wordBreak: 'break-word' }}>{value || '—'}</strong>
    </div>
  );
}

function EmployeePortal({ me, onSignOut }) {
  const [tab, setTab] = useState('datos');
  const [profile, setProfile] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [certYear, setCertYear] = useState(String(new Date().getFullYear() - 1));
  const [benefits, setBenefits] = useState({ payments: [], termination: null });
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(function() {
    let cancelled = false;

    Promise.all([
      api('/api/portal/me'),
      api('/api/portal/payslips'),
      api('/api/portal/benefits')
    ])
      .then(function(r) {
        if (cancelled) return;
        setProfile(r[0].data);
        setPayslips(r[1].data || []);
        setBenefits(r[2].data || { payments: [], termination: null });
      })
      .catch(function(err) { if (!cancelled) setError(err.message); })
      .finally(function() { if (!cancelled) setLoading(false); });

    return function() { cancelled = true; };
  }, []);

  async function openPayslip(id) {
    try {
      setError('');
      const r = await api('/api/portal/payslips/' + encodeURIComponent(id));
      setSheet({ kind: 'payslip', data: r.data });
    } catch (err) {
      setError(err.message);
    }
  }

  async function openCertificate(kind) {
    try {
      setError('');
      const r = kind === 'income'
        ? await api('/api/portal/income-certificate?year=' + encodeURIComponent(certYear))
        : await api('/api/portal/employment-certificate');
      setSheet({ kind: kind, data: r.data });
    } catch (err) {
      setError(err.message);
    }
  }

  const emp = profile && profile.employee;
  const company = profile && profile.company;
  const balance = profile && profile.vacationBalance;

  const tabs = [
    ['datos', '👤 Mis datos'],
    ['desprendibles', '💵 Desprendibles'],
    ['prestaciones', '🏦 Prestaciones'],
    ['certificados', '📄 Certificados'],
    ['solicitudes', '📨 Solicitudes']
  ];

  function renderDatos() {
    return (
      <>
        <section className="portal-card">
          <h2>Mis datos</h2>
          <div className="portal-card-body portal-grid">
            <PortalInfo label="Nombre" value={emp.fullName} />
            <PortalInfo label="Documento" value={emp.taxId} />
            <PortalInfo label="Cargo" value={emp.position} />
            <PortalInfo label="Fecha de ingreso" value={emp.hireDate} />
            <PortalInfo label="Tipo de contrato" value={PORTAL_CONTRACT_LABELS[emp.contractType]} />
            <PortalInfo label="Estado" value={emp.active ? 'Activo' : 'Retirado' + (emp.terminationDate ? ' (' + emp.terminationDate + ')' : '')} />
            <PortalInfo label="Banco" value={emp.bankName ? emp.bankName + (emp.bankAccountType ? ' · ' + emp.bankAccountType.toLowerCase() : '') : ''} />
            <PortalInfo label="Cuenta" value={emp.bankAccountNumber} />
          </div>
        </section>

        <section className="portal-card">
          <h2>🏖️ Vacaciones</h2>
          <div className="portal-card-body">
            {balance ? (
              <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 0 }}>
                <PortalInfo label="Pendientes" value={formatNumber2(balance.pendingDays) + ' días'} />
                <PortalInfo label="Causadas" value={formatNumber2(balance.accruedDays) + ' días'} />
                <PortalInfo label="Disfrutadas" value={formatNumber2(balance.takenDays) + ' días'} />
              </div>
            ) : (
              <div className="portal-muted">Sin fecha de ingreso registrada: no se puede calcular el saldo.</div>
            )}
            {balance && <div className="portal-muted" style={{ marginTop: '8px' }}>Días hábiles, con corte al {balance.asOf}.</div>}
          </div>
        </section>

        <section className="portal-card">
          <h2>Incapacidades, licencias y vacaciones</h2>
          <div className="portal-card-body">
            {profile.leaves.length === 0 && <div className="portal-muted">No tienes novedades registradas.</div>}
            {profile.leaves.map(function(l) {
              return (
                <div key={l.id} className="portal-list-item">
                  <div>
                    <div>{LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}</div>
                    <div className="portal-muted">Del {l.startDate} al {l.endDate}</div>
                  </div>
                  <strong style={{ whiteSpace: 'nowrap' }}>
                    {l.leaveType === 'VACATION' && l.businessDays !== null
                      ? formatNumber2(l.businessDays) + ' hábiles'
                      : l.totalDays + ' días'}
                  </strong>
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  }

  function renderDesprendibles() {
    return (
      <section className="portal-card">
        <h2>Desprendibles de pago</h2>
        <div className="portal-card-body">
          {payslips.length === 0 && <div className="portal-muted">Aún no hay nóminas liquidadas a tu nombre.</div>}
          {payslips.map(function(p) {
            return (
              <div key={p.id} className="portal-list-item">
                <div style={{ minWidth: 0 }}>
                  <div>{p.periodStart} a {p.periodEnd}</div>
                  <div className="portal-muted">
                    Neto <strong style={{ color: '#67e8f9' }}>{formatCOP(p.netPay)}</strong>
                    {p.periodStatus !== 'CLOSED' ? ' · periodo abierto' : ''}
                  </div>
                </div>
                <button className="btn" onClick={function() { openPayslip(p.id); }}>Ver</button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderPrestaciones() {
    const t = benefits.termination;
    return (
      <>
        <section className="portal-card">
          <h2>Prima y cesantías pagadas</h2>
          <div className="portal-card-body">
            {benefits.payments.length === 0 && <div className="portal-muted">No hay pagos de prestaciones registrados.</div>}
            {benefits.payments.map(function(p) {
              return (
                <div key={p.id} className="portal-list-item">
                  <div style={{ minWidth: 0 }}>
                    <div>{PORTAL_BENEFIT_LABELS[p.benefitType] || p.benefitType}</div>
                    <div className="portal-muted">{p.periodStart} a {p.periodEnd} · {p.days} días</div>
                  </div>
                  <strong style={{ whiteSpace: 'nowrap' }}>{formatCOP(p.amount)}</strong>
                </div>
              );
            })}
          </div>
        </section>

        {t && (
          <section className="portal-card">
            <h2>Liquidación definitiva</h2>
            <div className="portal-card-body portal-list-item">
              <div>
                <div>Retiro el {t.terminationDate}</div>
                <div className="portal-muted">Total {formatCOP(t.total)}</div>
              </div>
              <button className="btn" onClick={function() { setSheet({ kind: 'termination', data: t }); }}>Ver</button>
            </div>
          </section>
        )}
      </>
    );
  }

  function renderCertificados() {
    return (
      <section className="portal-card">
        <h2>Certificados</h2>
        <div className="portal-card-body portal-list-item">
          <div>
            <div>Certificado laboral</div>
            <div className="portal-muted">Con tu cargo, fecha de ingreso y salario. Listo para imprimir o guardar en PDF.</div>
          </div>
          <button className="btn btn-primary" onClick={function() { openCertificate('employment'); }}>Generar</button>
        </div>
        <div className="portal-card-body portal-list-item">
          <div>
            <div>Certificado de ingresos y retenciones (formulario 220)</div>
            <div className="portal-muted">Lo necesitas para tu declaración de renta.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label htmlFor="portal-cert-year" className="portal-muted">Año</label>
            <input id="portal-cert-year" type="number" min="2000" max="2100" value={certYear}
              style={{ width: '90px' }}
              onChange={function(e) { setCertYear(e.target.value); }} />
            <button className="btn btn-primary" onClick={function() { openCertificate('income'); }}>Generar</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="app">
      <style>{PORTAL_CSS}</style>

      <header className="header">
        <div className="brand" style={{ minWidth: 0 }}>
          <div className="brand-logo">K</div>
          <div>
            <h1>Mi portal</h1>
            <p>{company ? company.name : 'Kreadu Gestion-Future'}</p>
          </div>
        </div>

        <div className="header-right">
          <div style={{ lineHeight: '1.3', minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: '700', wordBreak: 'break-all' }}>{me.email}</div>
            <div style={{ fontSize: '10px', color: '#7890a9' }}>{ROLE_LABELS[me.role] || me.role}</div>
          </div>
          <button className="btn" onClick={onSignOut}>Salir</button>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <main className="portal-main">
        {emp && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>Hola, {emp.firstName}</div>
            <div className="portal-muted">{[emp.position, emp.active ? null : 'retirado'].filter(Boolean).join(' · ')}</div>
          </div>
        )}

        <nav className="portal-tabs" role="tablist" aria-label="Secciones del portal">
          {tabs.map(function(t) {
            return (
              <button key={t[0]} className="btn" role="tab" aria-selected={tab === t[0]}
                onClick={function() { setTab(t[0]); }}>
                {t[1]}
              </button>
            );
          })}
        </nav>

        {loading && <div className="empty">Cargando tu información…</div>}

        {!loading && emp && tab === 'datos' && renderDatos()}
        {!loading && emp && tab === 'desprendibles' && renderDesprendibles()}
        {!loading && emp && tab === 'prestaciones' && renderPrestaciones()}
        {!loading && emp && tab === 'certificados' && renderCertificados()}
        {!loading && emp && tab === 'solicitudes' && <PortalRequests onError={setError} />}
      </main>

      {sheet && sheet.kind === 'payslip' && (
        <PayslipSheet payslip={sheet.data} onClose={function() { setSheet(null); }} />
      )}
      {sheet && sheet.kind === 'termination' && (
        <TerminationSheet termination={sheet.data} employee={emp} company={company} onClose={function() { setSheet(null); }} />
      )}
      {sheet && sheet.kind === 'employment' && (
        <PortalSheet title="Certificado laboral" onClose={function() { setSheet(null); }}>
          <EmploymentCertificateSheet data={sheet.data} />
        </PortalSheet>
      )}
      {sheet && sheet.kind === 'income' && (
        <PortalSheet title={'Certificado de ingresos y retenciones ' + sheet.data.year} onClose={function() { setSheet(null); }}>
          <IncomeCertificateSheet data={sheet.data} />
        </PortalSheet>
      )}

      <PageFooter />
    </div>
  );
}
