// ------------------------------------------------------------
// IMPORTAR EMPLEADOS — Excel (.xlsx/.xls) o CSV (; o ,)
// ------------------------------------------------------------
//
// Lee el archivo en el navegador (SheetJS para Excel, parser propio
// para CSV), valida fila por fila con las mismas reglas que el
// servidor (src/services/employeeValidation.ts, modo estricto) y envía
// sólo las válidas a POST /api/employees/import, que vuelve a validar.

const IMPORT_SMMLV = 1750905;
const IMPORT_MAX_ROWS = 500;

// [campo del API, encabezado de la plantilla, ejemplo, alias aceptados]
const IMPORT_COLUMNS = [
  ['firstName', 'Primer nombre', 'Carlos', ['nombre', 'nombre1']],
  ['firstName2', 'Segundo nombre', 'Andrés', ['nombre2']],
  ['lastName', 'Primer apellido', 'Pérez', ['apellido', 'apellido1']],
  ['lastName2', 'Segundo apellido', 'Rojas', ['apellido2']],
  ['taxId', 'Documento', '1020304050', ['cedula', 'numerodocumento', 'identificacion', 'nit']],
  ['position', 'Cargo', 'Operario', []],
  ['contractType', 'Tipo contrato', '2', ['tipodecontrato', 'contrato']],
  ['salary', 'Salario mensual', 1750905, ['salario', 'sueldo', 'salariobase']],
  ['hireDate', 'Fecha ingreso', '2026-02-01', ['fechadeingreso', 'ingreso']],
  ['contractEndDate', 'Fecha fin contrato', '', ['fechafin', 'fechadefincontrato', 'fincontrato']],
  ['arlRiskClass', 'Clase riesgo ARL', '1', ['riesgoarl', 'arl', 'claseriesgo', 'nivelarl']],
  ['address', 'Dirección', 'Calle 10 # 5-20', ['direccion']],
  ['city', 'Ciudad', 'Popayán', []],
  ['phone', 'Teléfono', '3001234567', ['telefono', 'celular']],
  ['bankName', 'Banco', 'Bancolombia', []],
  ['bankAccountType', 'Tipo cuenta', 'AHORROS', ['tipodecuenta']],
  ['bankAccountNumber', 'Número cuenta', '00123456789', ['cuenta', 'numerodecuenta', 'cuentabancaria']],
  ['isIntegralSalary', 'Salario integral (SI/NO)', 'NO', ['salariointegral', 'integral']],
  ['vacationDaysTakenBefore', 'Días vacaciones disfrutados antes', '0', ['vacacionesdisfrutadas', 'diasvacaciones']]
];

const IMPORT_INSTRUCTIONS = [
  ['Columna', 'Instrucciones'],
  ['Primer nombre, Primer apellido, Documento', 'Obligatorios.'],
  ['Tipo contrato', 'Código DIAN: 1 término fijo, 2 indefinido, 3 obra o labor, 4 aprendizaje, 5 prácticas. Vacío = 2.'],
  ['Salario mensual', 'Obligatorio. Mínimo 1 SMMLV (' + IMPORT_SMMLV.toLocaleString('es-CO') + '), salvo aprendices. Salario integral: mínimo 13 SMMLV.'],
  ['Fecha ingreso', 'Obligatoria. AAAA-MM-DD o celda de fecha de Excel.'],
  ['Fecha fin contrato', 'Obligatoria para término fijo. AAAA-MM-DD o celda de fecha de Excel.'],
  ['Clase riesgo ARL', '1 a 5. Vacío = 1.'],
  ['Tipo cuenta', 'AHORROS o CORRIENTE. Vacío = AHORROS.'],
  ['Salario integral', 'SI o NO.'],
  ['General', 'Máximo ' + IMPORT_MAX_ROWS + ' filas por archivo. No se importan documentos que ya existan en la empresa ni repetidos en el archivo.']
];

const IMPORT_CONTRACT_ALIASES = {
  FIJO: '1', 'TERMINO FIJO': '1', INDEFINIDO: '2', 'TERMINO INDEFINIDO': '2',
  OBRA: '3', 'OBRA O LABOR': '3', 'OBRA LABOR': '3', APRENDIZAJE: '4', APRENDIZ: '4',
  PRACTICAS: '5', PRACTICA: '5'
};

function importStripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function importHeaderKey(h) {
  return importStripAccents(String(h || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const IMPORT_HEADER_MAP = (function() {
  const map = {};
  IMPORT_COLUMNS.forEach(function(c) {
    map[importHeaderKey(c[0])] = c[0];
    map[importHeaderKey(c[1])] = c[0];
    c[3].forEach(function(a) { map[a] = c[0]; });
  });
  map[importHeaderKey('Salario integral')] = 'isIntegralSalary';
  return map;
})();

function importText(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function importTaxIdKey(v) {
  return importText(v).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function importExcelSerialToIso(serial) {
  return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
}

/** undefined = vacío, null = inválida, string = AAAA-MM-DD. */
function importParseDate(v) {
  const s = importText(v);
  if (!s) return undefined;
  const n = typeof v === 'number' ? v : (/^\d{4,5}(\.\d+)?$/.test(s) ? Number(s) : NaN);
  if (Number.isFinite(n)) return n > 0 && n < 2958466 ? importExcelSerialToIso(Math.floor(n)) : null;
  const iso = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

function importParseAmount(v) {
  if (typeof v === 'number') return v;
  let s = importText(v).replace(/[$\s]/g, '');
  if (!s) return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  return Number(s);
}

function importParseBoolean(v) {
  if (typeof v === 'boolean') return v;
  return ['1', 'SI', 'S', 'TRUE', 'X', 'YES'].indexOf(importStripAccents(importText(v)).toUpperCase()) >= 0;
}

function importContractType(v) {
  const s = importStripAccents(importText(v)).toUpperCase().replace(/\s+/g, ' ');
  if (!s) return '2';
  if (/^[1-5]$/.test(s)) return s;
  return IMPORT_CONTRACT_ALIASES[s.replace(/^TERMINO DE /, 'TERMINO ')] || null;
}

/** Valida una fila (mismas reglas que el servidor) y devuelve los errores. */
function validateImportRow(d) {
  const errors = [];
  if (!importText(d.firstName)) errors.push('Primer nombre obligatorio');
  if (!importText(d.lastName)) errors.push('Primer apellido obligatorio');
  if (!importText(d.taxId)) errors.push('Documento obligatorio');

  const contract = importContractType(d.contractType);
  if (!contract) errors.push('Tipo de contrato inválido (1 a 5)');

  const salary = importParseAmount(d.salary);
  const integral = importParseBoolean(d.isIntegralSalary);
  if (!Number.isFinite(salary) || salary <= 0) errors.push('Salario obligatorio y mayor que cero');
  else if (contract !== '4' && salary < IMPORT_SMMLV) errors.push('Salario inferior al mínimo (' + formatCOP(IMPORT_SMMLV) + ')');
  else if (integral && salary < IMPORT_SMMLV * 13) errors.push('Salario integral inferior a 13 SMMLV');

  const hire = importParseDate(d.hireDate);
  if (hire === undefined) errors.push('Fecha de ingreso obligatoria');
  else if (hire === null) errors.push('Fecha de ingreso inválida (AAAA-MM-DD)');

  const end = importParseDate(d.contractEndDate);
  if (end === null) errors.push('Fecha fin de contrato inválida (AAAA-MM-DD)');
  else if (contract === '1' && !end) errors.push('Término fijo requiere fecha fin de contrato');
  else if (end && hire && end < hire) errors.push('Fecha fin anterior a la de ingreso');

  const arl = importText(d.arlRiskClass);
  if (arl && !/^[1-5]$/.test(arl)) errors.push('Clase de riesgo ARL inválida (1 a 5)');

  const accountType = importStripAccents(importText(d.bankAccountType)).toUpperCase();
  if (accountType && accountType !== 'AHORROS' && accountType !== 'CORRIENTE') errors.push('Tipo de cuenta: AHORROS o CORRIENTE');

  const vac = importText(d.vacationDaysTakenBefore);
  if (vac && !(importParseAmount(vac) >= 0)) errors.push('Días de vacaciones previos inválidos');

  return errors;
}

/** CSV con separador ; o , (se detecta en la fila de encabezados). */
function parseImportCsv(textContent) {
  const content = textContent.replace(/^﻿/, '');
  const firstLine = content.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readImportFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parseImportCsv(await file.text());
  }
  if (typeof XLSX === 'undefined') {
    throw new Error('No se pudo cargar el lector de Excel. Revise su conexión o use un archivo CSV.');
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
}

/** Matriz (encabezados + filas) → filas con número de fila, datos y errores. */
function buildImportRows(matrix, existingEmployees) {
  if (!matrix.length) throw new Error('El archivo está vacío.');

  const fields = matrix[0].map(function(h) { return IMPORT_HEADER_MAP[importHeaderKey(h)] || null; });
  ['firstName', 'lastName', 'taxId', 'salary'].forEach(function(f) {
    if (fields.indexOf(f) < 0) {
      const col = IMPORT_COLUMNS.find(function(c) { return c[0] === f; });
      throw new Error('Falta la columna "' + col[1] + '". Descargue la plantilla para ver el formato.');
    }
  });

  const existing = new Set((existingEmployees || []).map(function(e) { return importTaxIdKey(e.taxId); }));
  const seen = new Set();
  const rows = [];

  matrix.slice(1).forEach(function(cells, i) {
    if (!cells.some(function(c) { return importText(c) !== ''; })) return;
    const data = {};
    fields.forEach(function(f, j) { if (f) data[f] = cells[j]; });
    if (typeof data.taxId === 'number') data.taxId = String(data.taxId);
    if (typeof data.bankAccountNumber === 'number') data.bankAccountNumber = String(data.bankAccountNumber);

    const errors = validateImportRow(data);
    const key = importTaxIdKey(data.taxId);
    if (key && existing.has(key)) errors.push('Ya existe un empleado con este documento');
    else if (key && seen.has(key)) errors.push('Documento repetido en el archivo');
    if (key) seen.add(key);

    rows.push({ rowNumber: i + 2, data: data, errors: errors });
  });

  if (!rows.length) throw new Error('El archivo no tiene filas de datos.');
  return rows;
}

function downloadEmployeeTemplate() {
  const headers = IMPORT_COLUMNS.map(function(c) { return c[1]; });
  const example = IMPORT_COLUMNS.map(function(c) { return c[2]; });

  if (typeof XLSX === 'undefined') {
    const csv = [headers, example].map(function(r) {
      return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n');
    downloadText('plantilla-empleados.csv', '﻿' + csv, 'text/csv;charset=utf-8');
    return;
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  // Documento y cuenta como texto para no perder ceros a la izquierda.
  ['taxId', 'bankAccountNumber', 'phone'].forEach(function(f) {
    const col = IMPORT_COLUMNS.findIndex(function(c) { return c[0] === f; });
    const ref = XLSX.utils.encode_cell({ r: 1, c: col });
    if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; }
  });
  ws['!cols'] = headers.map(function(h) { return { wch: Math.max(12, h.length + 2) }; });

  const help = XLSX.utils.aoa_to_sheet(IMPORT_INSTRUCTIONS);
  help['!cols'] = [{ wch: 42 }, { wch: 110 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
  XLSX.utils.book_append_sheet(wb, help, 'Instrucciones');
  XLSX.writeFile(wb, 'plantilla-empleados.xlsx');
}

function EmployeeImportModal({ company, employees, onClose, onImported, onError, onSuccess }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const validRows = (rows || []).filter(function(r) { return r.errors.length === 0; });
  const invalidCount = (rows || []).length - validRows.length;

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    setRows(null);
    setResult(null);
    setParseError('');
    if (!file) return;
    setFileName(file.name);
    try {
      setRows(buildImportRows(await readImportFile(file), employees));
    } catch (err) {
      setParseError(err.message || String(err));
    }
  }

  async function doImport() {
    if (!validRows.length) return;
    if (validRows.length > IMPORT_MAX_ROWS) {
      setParseError('Máximo ' + IMPORT_MAX_ROWS + ' filas por importación. Divida el archivo.');
      return;
    }
    setLoading(true);
    try {
      const res = await api('/api/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
          rows: validRows.map(function(r) { return Object.assign({}, r.data, { rowNumber: r.rowNumber }); })
        })
      });
      setResult(res);
      if (res.created > 0) {
        onSuccess(res.created + ' empleado(s) importado(s) correctamente.');
        onImported();
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const cell = { padding: '5px 6px', borderTop: '1px solid #1d3047', verticalAlign: 'top' };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(1040px, 100%)' }}>
        <div className="modal-header">
          <h3>📥 Importar empleados — {company.name}</h3>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '12px', color: '#8193aa', marginTop: 0 }}>
            Suba un archivo Excel (.xlsx) o CSV (separado por ; o ,) con una fila por empleado.
            Las fechas van en formato AAAA-MM-DD (o como fecha de Excel). Máximo {IMPORT_MAX_ROWS} filas.
          </p>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={downloadEmployeeTemplate}>⬇️ Descargar plantilla</button>
            <input
              type="file"
              aria-label="Archivo de empleados"
              accept=".xlsx,.xls,.csv,text/csv"
              onChange={onFile}
              style={{ width: 'auto' }}
            />
          </div>

          {parseError && <div className="inline-warning" style={{ marginTop: '12px' }}>{parseError}</div>}

          {rows && !result && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '13px' }}>
                <strong>{fileName}</strong>: {rows.length} fila(s) —{' '}
                <span style={{ color: '#6ee7b7' }}>{validRows.length} válida(s)</span>,{' '}
                <span style={{ color: invalidCount ? '#fca5a5' : '#8193aa' }}>{invalidCount} con errores</span>
              </div>

              <div style={{ maxHeight: '50vh', overflow: 'auto', marginTop: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#8193aa' }}>
                      <th style={{ padding: '6px' }}>Fila</th>
                      <th style={{ padding: '6px' }}>Empleado</th>
                      <th style={{ padding: '6px' }}>Documento</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>Salario</th>
                      <th style={{ padding: '6px' }}>Ingreso</th>
                      <th style={{ padding: '6px' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(function(r) {
                      const d = r.data;
                      const ok = r.errors.length === 0;
                      const salary = importParseAmount(d.salary);
                      return (
                        <tr key={r.rowNumber} style={{ background: ok ? 'transparent' : 'rgba(127, 29, 29, .18)' }}>
                          <td style={cell}>{r.rowNumber}</td>
                          <td style={cell}>{[d.firstName, d.firstName2, d.lastName, d.lastName2].map(importText).filter(Boolean).join(' ')}</td>
                          <td style={cell}>{importText(d.taxId)}</td>
                          <td style={{ ...cell, textAlign: 'right' }}>{Number.isFinite(salary) ? formatCOP(salary) : importText(d.salary)}</td>
                          <td style={cell}>{importParseDate(d.hireDate) || importText(d.hireDate)}</td>
                          <td style={{ ...cell, color: ok ? '#6ee7b7' : '#fca5a5' }}>{ok ? '✓ Lista' : r.errors.join('; ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div style={{ marginTop: '14px', fontSize: '13px' }}>
              <div style={{ color: '#6ee7b7' }}>✓ {result.created} empleado(s) creado(s).</div>
              {result.errors && result.errors.length > 0 && (
                <div className="inline-warning" style={{ marginTop: '10px' }}>
                  El servidor rechazó {result.errors.length} fila(s):
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                    {result.errors.map(function(e) {
                      return <li key={e.row}>Fila {e.row}: {e.error}</li>;
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{result ? 'Cerrar' : 'Cancelar'}</button>
          {!result && (
            <button
              className="btn btn-primary"
              onClick={doImport}
              disabled={loading || validRows.length === 0}
            >
              {loading ? 'Importando...' : 'Importar ' + validRows.length + ' fila(s) válida(s)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
