// ------------------------------------------------------------
// PILA — datos de afiliación y archivo plano (planilla tipo E)
//
//   <PilaEmployeeFields form={...} setForm={...} />  EPS, AFP, CCF, DIVIPOLA
//   <PilaCompanyFields form={...} setForm={...} />   ARL, DIVIPOLA, actividad
//   <PilaButton period={...} />                      botón + modal de descarga
// El archivo lo arma GET /api/payroll-periods/:id/pila.
// ------------------------------------------------------------

// Sugerencias: los códigos los publica cada operador PILA; confírmalos allí.
const PILA_AFP_SUGGESTIONS = [
  ['25-14', 'Colpensiones'],
  ['230301', 'Porvenir'],
  ['230201', 'Protección'],
  ['231001', 'Colfondos'],
  ['230904', 'Skandia']
];

const PILA_EPS_SUGGESTIONS = [
  ['EPS037', 'Nueva EPS'],
  ['EPS010', 'EPS Sura'],
  ['EPS005', 'Sanitas'],
  ['EPS002', 'Salud Total'],
  ['EPS008', 'Compensar'],
  ['EPS017', 'Famisanar'],
  ['ESS062', 'Asmet Salud'],
  ['ESS118', 'Emssanar']
];

const PILA_DOCUMENT_LABELS = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  TI: 'Tarjeta de identidad',
  PA: 'Pasaporte',
  PE: 'Permiso especial de permanencia',
  PT: 'Permiso por protección temporal'
};

function PilaDatalist({ id, items }) {
  return (
    <datalist id={id}>
      {items.map(function(item) {
        return <option key={item[0]} value={item[0]}>{item[1]}</option>;
      })}
    </datalist>
  );
}

function PilaInput({ id, label, value, onChange, placeholder, list, maxLength, hint }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value || ''}
        placeholder={placeholder}
        list={list}
        maxLength={maxLength}
        onChange={function(e) { onChange(e.target.value.toUpperCase()); }}
      />
      {hint && <div style={{ fontSize: '11px', color: '#8193aa', marginTop: '4px' }}>{hint}</div>}
    </div>
  );
}

function PilaSectionTitle({ children }) {
  return (
    <div style={{ gridColumn: '1 / -1', fontWeight: 700, marginTop: '8px' }}>
      {children}
    </div>
  );
}

function PilaEmployeeFields({ form, setForm }) {
  function set(key) {
    return function(value) { setForm({ ...form, [key]: value }); };
  }

  return (
    <>
      <PilaSectionTitle>🩺 Seguridad social (para la PILA)</PilaSectionTitle>
      <PilaDatalist id="pila-eps-list" items={PILA_EPS_SUGGESTIONS} />
      <PilaDatalist id="pila-afp-list" items={PILA_AFP_SUGGESTIONS} />

      <div className="form-group">
        <label htmlFor="pila-document-type">Tipo de documento</label>
        <select
          id="pila-document-type"
          value={form.documentType || 'CC'}
          onChange={function(e) { setForm({ ...form, documentType: e.target.value }); }}
        >
          {Object.keys(PILA_DOCUMENT_LABELS).map(function(code) {
            return <option key={code} value={code}>{code} · {PILA_DOCUMENT_LABELS[code]}</option>;
          })}
        </select>
      </div>

      <PilaInput id="pila-eps" label="Código EPS" value={form.epsCode} onChange={set('epsCode')}
        placeholder="EPS037" list="pila-eps-list" maxLength={6} />
      <PilaInput id="pila-afp" label="Código fondo de pensiones" value={form.afpCode} onChange={set('afpCode')}
        placeholder="230301" list="pila-afp-list" maxLength={6} />
      <PilaInput id="pila-ccf" label="Código caja de compensación" value={form.ccfCode} onChange={set('ccfCode')}
        placeholder="CCF22" maxLength={6} />
      <PilaInput id="pila-divipola" label="Municipio de trabajo (DIVIPOLA)" value={form.divipolaCode}
        onChange={set('divipolaCode')} placeholder="19001" maxLength={5}
        hint="5 dígitos. Vacío = el de la empresa." />
    </>
  );
}

function PilaCompanyFields({ form, setForm }) {
  function set(key) {
    return function(value) { setForm({ ...form, [key]: value }); };
  }

  return (
    <>
      <PilaSectionTitle>🩺 Seguridad social (para la PILA)</PilaSectionTitle>
      <PilaInput id="pila-arl" label="Código ARL" value={form.arlCode} onChange={set('arlCode')}
        placeholder="14-23" maxLength={6} hint="Ej. Positiva 14-23. Lo da tu operador PILA." />
      <PilaInput id="pila-company-divipola" label="Municipio (DIVIPOLA)" value={form.divipolaCode}
        onChange={set('divipolaCode')} placeholder="19001" maxLength={5} hint="Popayán: 19001." />
      <PilaInput id="pila-activity" label="Actividad económica ARL" value={form.arlActivityCode}
        onChange={set('arlActivityCode')} placeholder="1561101" maxLength={7}
        hint="7 dígitos (Decreto 768 de 2022). Opcional." />
    </>
  );
}

function PilaModal({ period, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(function() {
    let cancelled = false;
    api('/api/payroll-periods/' + encodeURIComponent(period.id) + '/pila')
      .then(function(r) { if (!cancelled) setData(r.data); })
      .catch(function(err) { if (!cancelled) setError(err.message); });
    return function() { cancelled = true; };
  }, [period.id]);

  useEffect(function() {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, []);

  const rows = data ? [
    ['Pensión', data.totals.pension],
    ['Fondo de Solidaridad Pensional', data.totals.fsp],
    ['Salud', data.totals.health],
    ['ARL', data.totals.arl],
    ['Caja de compensación', data.totals.ccf],
    ['SENA', data.totals.sena],
    ['ICBF', data.totals.icbf]
  ].filter(function(r) { return r[1]; }) : [];

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Archivo PILA" style={{ width: 'min(640px, 100%)' }}>
        <div className="modal-header">
          <h3>🩺 Archivo PILA · {period.periodStart} a {period.periodEnd}</h3>
          <button className="btn" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert" style={{ position: 'static', margin: 0 }}>{error}</div>}
          {!data && !error && <div className="info-box">Generando planilla…</div>}

          {data && (
            <>
              <div className="info-box">
                Planilla tipo E con {data.cotizantes} cotizante(s) en {data.lines - 1} línea(s).
                Cárgala en tu operador (SOI, Aportes en Línea, Mi Planilla…); el operador la valida
                antes del pago.
              </div>

              {data.warnings.length > 0 && (
                <div style={{ margin: '12px 0' }}>
                  <strong>⚠️ Revisa antes de cargarla ({data.warnings.length})</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '20px', fontSize: '13px' }}>
                    {data.warnings.map(function(w, i) { return <li key={i}>{w}</li>; })}
                  </ul>
                </div>
              )}

              <table style={{ width: "100%", marginTop: "12px", borderCollapse: "collapse" }}>
                <tbody>
                  {rows.map(function(r) {
                    return (
                      <tr key={r[0]}>
                        <td>{r[0]}</td>
                        <td style={{ textAlign: 'right' }}>{formatCOP(r[1])}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total a pagar</td>
                    <td style={{ textAlign: 'right' }}>{formatCOP(data.totals.total)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cerrar</button>
          {data && (
            <button
              className="btn btn-primary"
              onClick={function() { downloadText(data.fileName, data.content, 'text/plain;charset=us-ascii'); }}
            >
              ⬇️ Descargar archivo PILA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Botón "🩺 Archivo PILA" con su modal (barra del periodo). */
function PilaButton({ period }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn" onClick={function() { setOpen(true); }}>🩺 Archivo PILA</button>
      {open && <PilaModal period={period} onClose={function() { setOpen(false); }} />}
    </>
  );
}
