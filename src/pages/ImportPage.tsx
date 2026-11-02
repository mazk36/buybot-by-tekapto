import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { CheckCircle2, CloudUpload, FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { api } from '../api'
import { Button, PageHeader, Spinner, useToast } from '../ui'
import { useStats } from '../store'

interface Row { dni: string; name: string; phone: string; offerAmount: string; rate: string; line: number; problem?: string }
interface Result { created: number; duplicates: number; invalid: number; duplicateRows: { row: number; reason: string }[]; invalidRows: { row: number; reason: string }[] }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const ALIASES = {
  dni: ['dni', 'documento', 'numerodocumento', 'nrodocumento', 'numerodedocumento'],
  name: ['nombre', 'nombres', 'cliente', 'nombrecompleto', 'name'],
  phone: ['whatsapp', 'telefono', 'celular', 'phone', 'numerodetelefono', 'movil'],
  offerAmount: ['monto', 'montooferta', 'montoofertado', 'oferta', 'importe'],
  rate: ['tasa', 'tasareferencial', 'tcea', 'tea'],
} as const

export function ImportPage({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const { refresh } = useStats()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [drag, setDrag] = useState(false)

  const parse = async (f: File) => {
    setError(''); setResult(null); setRows([]); setFile(f.name); setLoading(true)
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error('El archivo supera los 10 MB.')
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) throw new Error('No se encontró ninguna hoja en el archivo.')
      const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
      if (!source.length) throw new Error('El archivo no tiene filas.')
      const pick = (rec: Record<string, string>, keys: readonly string[]) => { for (const k of keys) if (rec[k]) return rec[k]; return '' }
      const parsed = source.map((item, i): Row => {
        const rec = Object.fromEntries(Object.entries(item).map(([k, v]) => [norm(k), String(v ?? '').trim()]))
        const row: Row = { line: i + 2, dni: pick(rec, ALIASES.dni), name: pick(rec, ALIASES.name), phone: pick(rec, ALIASES.phone), offerAmount: pick(rec, ALIASES.offerAmount), rate: pick(rec, ALIASES.rate) }
        const dni = row.dni.replace(/\D/g, '').padStart(row.dni ? 8 : 0, '0'); row.dni = dni
        const phone = row.phone.replace(/\D/g, '')
        if (!/^\d{8}$/.test(row.dni)) row.problem = 'DNI inválido (8 dígitos)'
        else if (row.name.length < 2) row.problem = 'Falta el nombre'
        else if (!/^(51)?9\d{8}$/.test(phone.replace(/^00/, ''))) row.problem = 'WhatsApp inválido'
        return row
      })
      setRows(parsed)
      if (!parsed.some((r) => !r.problem)) setError('No encontramos filas válidas. Revisa que existan las columnas DNI, Nombre y WhatsApp.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.') } finally { setLoading(false) }
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void parse(f); e.target.value = '' }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void parse(f) }
  const valid = rows.filter((r) => !r.problem)
  const invalid = rows.filter((r) => r.problem)
  const missingData = valid.filter((r) => !r.offerAmount || !r.rate).length

  const send = async () => {
    setSending(true)
    try {
      const res = await api<Result>('POST', '/prospects/import', { rows: valid.map(({ dni, name, phone, offerAmount, rate }) => ({ dni, name, phone, offerAmount: offerAmount || undefined, rate: rate || undefined })) })
      setResult(res); setRows([]); void refresh()
      toast(`${res.created} prospecto(s) importados`)
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo importar', 'error') } finally { setSending(false) }
  }

  return <>
    <PageHeader eyebrow="BASE DE CLIENTES" title="Importar prospectos" subtitle="Sube un Excel o CSV con DNI, Nombre y WhatsApp. Monto y Tasa son opcionales: puedes completarlos después." />
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
      <div className="note">Columnas reconocidas: <b>DNI</b>, <b>Nombre</b>, <b>WhatsApp</b> (o Celular/Teléfono), y opcionales <b>Monto</b> y <b>Tasa</b>. Los duplicados por DNI o WhatsApp se omiten sin tocar lo que ya tienes.</div>
    </section>}

    {rows.length > 0 && <section className="card">
      <div className="import-summary">
        <div><strong>{file}</strong><span className="muted-text">{rows.length} filas leídas</span></div>
        <div className="stat-pills"><span className="pill green">{valid.length} listas</span>{invalid.length > 0 && <span className="pill red">{invalid.length} con problemas</span>}{missingData > 0 && <span className="pill amber">{missingData} sin monto o tasa</span>}</div>
      </div>
      {missingData > 0 && <div className="alert alert-info">{missingData} cliente(s) no tienen monto o tasa. Se importarán igual, pero no se enviarán hasta que los completes (si tu plantilla usa [monto] o [tasa]).</div>}
      <div className="table-wrap"><table className="data responsive"><thead><tr><th>Fila</th><th>DNI</th><th>Nombre</th><th>WhatsApp</th><th className="num">Monto</th><th className="num">Tasa</th><th>Estado</th></tr></thead>
        <tbody>{rows.slice(0, 100).map((r) => <tr key={r.line} className={r.problem ? 'row-bad' : ''}><td data-label="Fila">{r.line}</td><td data-label="DNI" className="mono">{r.dni}</td><td data-label="Nombre" className="cell-main">{r.name || '—'}</td><td data-label="WhatsApp">{r.phone || '—'}</td><td data-label="Monto" className="num">{r.offerAmount || '—'}</td><td data-label="Tasa" className="num">{r.rate || '—'}</td><td data-label="Estado">{r.problem ? <span className="badge badge-red"><i />{r.problem}</span> : <span className="badge badge-green"><i />Lista</span>}</td></tr>)}</tbody></table></div>
      {rows.length > 100 && <p className="muted-text small pad">Mostrando las primeras 100 filas de {rows.length}.</p>}
      <div className="form-actions"><Button onClick={() => { setRows([]); setFile('') }}>Cancelar</Button><Button variant="primary" busy={sending} disabled={!valid.length} onClick={() => void send()}>Importar {valid.length} prospecto(s)</Button></div>
    </section>}

    {result && <section className="card result-card">
      <span className="wa-icon tone-green"><CheckCircle2 size={28} /></span>
      <h2>Importación terminada</h2>
      <div className="stat-pills center"><span className="pill green">{result.created} nuevos</span><span className="pill amber">{result.duplicates} duplicados omitidos</span><span className="pill red">{result.invalid} inválidos</span></div>
      {[...result.duplicateRows, ...result.invalidRows].length > 0 && <details className="details"><summary>Ver detalle</summary><ul>{[...result.duplicateRows, ...result.invalidRows].map((r, i) => <li key={i}>Fila {r.row}: {r.reason}</li>)}</ul></details>}
      <div className="btn-row"><Button onClick={() => setResult(null)}>Importar otro archivo</Button><Button variant="primary" onClick={onDone}>Ver prospectos</Button></div>
    </section>}
  </>
}
