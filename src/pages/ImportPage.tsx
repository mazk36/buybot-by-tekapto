import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { CheckCircle2, CloudUpload, FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { api } from '../api'
import { Button, PageHeader, Spinner, useToast } from '../ui'
import { useStats } from '../store'
import { importedMessageName } from '../name'

interface Row { dni: string; name: string; messageName: string; phone: string; offerAmount: string; rate: string; whatsappOptIn: boolean; line: number; problem?: string }
interface Result { created: number; reassigned: number; onHold: number; duplicates: number; invalid: number; duplicateRows: { row: number; reason: string }[]; invalidRows: { row: number; reason: string }[] }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const ALIASES = {
  dni: ['dni', 'dninuevo', 'documento', 'numerodocumento', 'nrodocumento', 'numerodedocumento'],
  name: ['nombrecompleto', 'nombrescliente', 'nombrecliente', 'cliente', 'nombres', 'nombre', 'name'],
  surname: ['apellidos', 'apellidospaterno', 'apellidomaternocliente', 'apellidopaternocliente', 'apellido'],
  phone: ['whatsapp', 'numerowhatsapp', 'cel', 'celular', 'telefmovil', 'telefono', 'phone', 'numerodetelefono', 'movil'],
  offerAmount: ['monto', 'montooferta', 'montoofertado', 'oferta', 'importe'],
  rate: ['tasa', 'tasareferencial', 'tcea', 'tea'],
  whatsappOptIn: ['autorizacionwhatsapp', 'consentimientowhatsapp', 'whatsappoptin', 'optinwhatsapp', 'optin'],
} as const

const hasWhatsAppConsent = (value: string) => ['si', 'yes', 'true', '1', 'autorizado', 'autorizada', 'acepta', 'accepted'].includes(norm(value))

function chooseSheet(XLSX: typeof import('xlsx'), wb: import('xlsx').WorkBook) {
  const ranked = wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name]
    const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
    const headers = Object.keys(source[0] ?? {}).map(norm)
    const has = (keys: readonly string[]) => keys.some((key) => headers.includes(key))
    const score = Number(has(ALIASES.dni)) + Number(has(ALIASES.name)) + Number(has(ALIASES.phone)) + Number(has(ALIASES.surname))
    return { name, sheet, source, score, hasIdentity: has(ALIASES.dni) && has(ALIASES.phone) }
  }).sort((a, b) => Number(b.hasIdentity) - Number(a.hasIdentity) || b.score - a.score || b.source.length - a.source.length)
  return ranked[0]
}

export function ImportPage({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const { refresh } = useStats()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [drag, setDrag] = useState(false)
  const [consentAll, setConsentAll] = useState(true)
  const [assignExisting, setAssignExisting] = useState(false)

  const parse = async (f: File) => {
    setError(''); setResult(null); setRows([]); setFile(f.name); setConsentAll(true); setAssignExisting(false); setLoading(true)
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error('El archivo supera los 10 MB.')
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const selected = chooseSheet(XLSX, wb)
      if (!selected?.sheet) throw new Error('No se encontró ninguna hoja en el archivo.')
      if (!selected.hasIdentity) throw new Error('No encontramos una hoja con columnas reconocibles de DNI y teléfono.')
      setSheetName(selected.name)
      const source = selected.source
      if (!source.length) throw new Error('El archivo no tiene filas.')
      const pick = (rec: Record<string, string>, keys: readonly string[]) => { for (const k of keys) if (rec[k]) return rec[k]; return '' }
      const parsed = source.map((item, i): Row => {
        const rec = Object.fromEntries(Object.entries(item).map(([k, v]) => [norm(k), String(v ?? '').trim()]))
        const completeName = pick(rec, ['nombrecompleto', 'fullname'])
        const givenName = pick(rec, ['nombrescliente', 'nombrecliente', 'nombres', 'nombre', 'name', 'cliente'])
        const surname = pick(rec, ['apellidopaternocliente', 'apellidopaterno', 'apellidos', 'apellido', 'apellidomaternocliente', 'apellidomaterno'])
        const composedName = [
          givenName,
          pick(rec, ['apellidopaternocliente', 'apellidopaterno']),
          pick(rec, ['apellidomaternocliente', 'apellidomaterno']),
          pick(rec, ['apellidos', 'apellido']),
        ].filter(Boolean).join(' ')
        const fullName = completeName || composedName
        const messageName = importedMessageName(givenName, surname)
        const row: Row = { line: i + 2, dni: pick(rec, ALIASES.dni), name: fullName, messageName, phone: pick(rec, ALIASES.phone), offerAmount: pick(rec, ALIASES.offerAmount), rate: pick(rec, ALIASES.rate), whatsappOptIn: hasWhatsAppConsent(pick(rec, ALIASES.whatsappOptIn)) }
        const dni = row.dni.replace(/\D/g, '').padStart(row.dni ? 8 : 0, '0'); row.dni = dni
        const phone = row.phone.replace(/\D/g, '')
        if (!/^\d{8}$/.test(row.dni)) row.problem = 'DNI inválido (8 dígitos)'
        else if (!/^(51)?9\d{8}$/.test(phone.replace(/^00/, ''))) row.problem = 'WhatsApp inválido'
        else if (row.name.length < 2) row.problem = 'Falta el nombre'
        return row
      })
      setRows(parsed)
      if (!parsed.some((r) => !r.problem || r.problem === 'Falta el nombre')) setError('No encontramos filas con DNI y WhatsApp válidos.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.') } finally { setLoading(false) }
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void parse(f); e.target.value = '' }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void parse(f) }
  const associationOnly = (r: Row) => assignExisting && r.problem === 'Falta el nombre'
  const valid = rows.filter((r) => !r.problem || associationOnly(r))
  const invalid = rows.filter((r) => r.problem && !associationOnly(r))
  const associationOnlyCount = valid.filter(associationOnly).length
  const missingData = valid.filter((r) => !r.problem && (!r.offerAmount || !r.rate)).length
  const withoutConsent = consentAll ? 0 : valid.filter((r) => !r.problem && !r.whatsappOptIn).length

  const send = async () => {
    setSending(true)
    try {
      const res = await api<Result>('POST', '/prospects/import', { sourceName: file, consentAll, assignExisting, rows: valid.map(({ dni, name, messageName, phone, offerAmount, rate, whatsappOptIn }) => ({ dni, name, messageName: messageName || undefined, phone, offerAmount: offerAmount || undefined, rate: rate || undefined, whatsappOptIn })) })
      setResult(res); setRows([]); void refresh()
      toast(`${res.created} nuevos · ${res.reassigned} asociados a esta base`)
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo importar', 'error') } finally { setSending(false) }
  }

  return <>
    <PageHeader eyebrow="BASE DE CLIENTES" title="Importar prospectos" subtitle="Sube Excel o CSV. Para nuevos prospectos se necesita DNI, nombre y WhatsApp; también puedes asociar contactos existentes con DNI y teléfono." />
    {!rows.length && !result && <section className="card">
      <div className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        <span className="dz-icon"><CloudUpload size={26} /></span>
        <strong>Arrastra tu archivo aquí</strong>
        <p className="muted-text">.xlsx, .xls o .csv · hasta 10 MB</p>
        <Button variant="primary" icon={<FileSpreadsheet size={16} />} onClick={() => input.current?.click()} busy={loading}>Elegir archivo</Button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
      </div>
      {loading && <Spinner label="Leyendo archivo…" />}
      {error && <div className="alert alert-error" role="alert"><TriangleAlert size={18} /><div><strong>No se pudo importar</strong><p>{error}</p></div></div>}
      <div className="note">Columnas reconocidas: <b>DNI</b>, <b>Nombre</b>, <b>WhatsApp</b>, <b>Autorización WhatsApp</b> (Sí/No), y opcionales <b>Monto</b> y <b>Tasa</b>. Los prospectos nuevos sin autorización quedan en espera. Puedes asociar los existentes sin base por DNI y teléfono; las demás coincidencias se omiten como duplicados.</div>
    </section>}

    {rows.length > 0 && <section className="card">
      <div className="import-summary">
        <div><strong>{file}</strong><span className="muted-text">Hoja: {sheetName} · {rows.length} filas leídas</span></div>
        <div className="stat-pills"><span className="pill green">{valid.length} filas a procesar</span>{withoutConsent > 0 && <span className="pill amber">{withoutConsent} sin autorización</span>}{invalid.length > 0 && <span className="pill red">{invalid.length} con problemas</span>}{missingData > 0 && <span className="pill amber">{missingData} sin monto o tasa</span>}</div>
      </div>
      {error && <div className="alert alert-error" role="alert"><TriangleAlert size={18} /><div><strong>No se pudo importar</strong><p>{error}</p></div></div>}
      <label className="consent-field"><input type="checkbox" checked={consentAll} onChange={(e) => setConsentAll(e.target.checked)} /><span><strong>Los contactos nuevos de este archivo aceptaron recibir mensajes por WhatsApp</strong><small>Se registrará la autorización de los prospectos nuevos. Los contactos existentes conservan su autorización.</small></span></label>
      <label className="consent-field"><input type="checkbox" checked={assignExisting} onChange={(e) => setAssignExisting(e.target.checked)} /><span><strong>Asociar a este archivo los contactos existentes sin base identificada</strong><small>Solo se asocian cuando DNI y teléfono coinciden exactamente. Los datos, estados y autorizaciones existentes se conservan; los contactos que ya tienen base o solo coinciden parcialmente se omiten como duplicados.</small></span></label>
      {associationOnlyCount > 0 && <div className="alert alert-info">{associationOnlyCount} fila(s) sin nombre solo se asociarán si coinciden con un contacto existente sin base. No se crearán contactos nuevos sin nombre.</div>}
      {withoutConsent > 0 && <div className="alert alert-warn">{withoutConsent} fila(s) no tienen autorización marcada. Los prospectos nuevos correspondientes se importarán en espera.</div>}
      {missingData > 0 && <div className="alert alert-info">Los montos y las tasas son opcionales para el mensaje inicial; solo se pedirán si agregas esas variables a tu plantilla.</div>}
      <div className="table-wrap"><table className="data responsive"><thead><tr><th>Fila</th><th>DNI</th><th>Nombre</th><th>WhatsApp</th><th>Autorización</th><th className="num">Monto</th><th className="num">Tasa</th><th>Estado</th></tr></thead>
        <tbody>{rows.slice(0, 100).map((r) => <tr key={r.line} className={r.problem && !associationOnly(r) ? 'row-bad' : ''}><td data-label="Fila">{r.line}</td><td data-label="DNI" className="mono">{r.dni}</td><td data-label="Nombre" className="cell-main">{r.name || '—'}</td><td data-label="WhatsApp">{r.phone || '—'}</td><td data-label="Autorización">{associationOnly(r) ? '—' : consentAll || r.whatsappOptIn ? 'Sí' : 'No'}</td><td data-label="Monto" className="num">{r.offerAmount || '—'}</td><td data-label="Tasa" className="num">{r.rate || '—'}</td><td data-label="Estado">{associationOnly(r) ? <span className="badge badge-blue"><i />Solo asociar si coincide</span> : r.problem ? <span className="badge badge-red"><i />{r.problem}</span> : consentAll || r.whatsappOptIn ? <span className="badge badge-green"><i />Lista</span> : <span className="badge badge-neutral"><i />En espera</span>}</td></tr>)}</tbody></table></div>
      {rows.length > 100 && <p className="muted-text small pad">Mostrando las primeras 100 filas de {rows.length}.</p>}
      <div className="form-actions"><Button onClick={() => { setRows([]); setFile('') }}>Cancelar</Button><Button variant="primary" busy={sending} disabled={!valid.length} onClick={() => void send()}>Procesar {valid.length} fila(s)</Button></div>
    </section>}

    {result && <section className="card result-card">
      <span className="wa-icon tone-green"><CheckCircle2 size={28} /></span>
      <h2>Importación terminada</h2>
      <div className="stat-pills center"><span className="pill green">{result.created} nuevos</span><span className="pill green">{result.reassigned} existentes asociados a esta base</span><span className="pill amber">{result.onHold} nuevos en espera sin autorización</span><span className="pill amber">{result.duplicates} duplicados omitidos</span><span className="pill red">{result.invalid} inválidos</span></div>
      {[...result.duplicateRows, ...result.invalidRows].length > 0 && <details className="details"><summary>Ver detalle</summary><ul>{[...result.duplicateRows, ...result.invalidRows].map((r, i) => <li key={i}>Fila {r.row}: {r.reason}</li>)}</ul></details>}
      <div className="btn-row"><Button onClick={() => setResult(null)}>Importar otro archivo</Button><Button variant="primary" onClick={onDone}>Ver prospectos</Button></div>
    </section>}
  </>
}
