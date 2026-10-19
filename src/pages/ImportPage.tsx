import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ArrowDownToLine, Check, CheckCircle2, CircleHelp, CloudUpload, Database, FileSpreadsheet, ListChecks, LoaderCircle, LockKeyhole } from 'lucide-react'
import type { Prospect } from '../types'
import { PageTitle } from '../components/shared'
import { deterministicEligibility, formatPhone } from '../utils/format'
interface ImportRow { dni: string; name: string; phone: string; valid: boolean; duplicate: boolean }

export function ImportPage({ prospects, onImport, onDemo }: { prospects: Prospect[]; onImport: (records: Prospect[]) => void; onDemo: () => void }) {
  const [filename, setFilename] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const existingDnis = useMemo(() => new Set(prospects.map((item) => item.dni)), [prospects])
  const existingPhones = useMemo(() => new Set(prospects.map((item) => normalizePhone(item.phone))), [prospects])
  const newRows = rows.filter((row) => row.valid && !row.duplicate)
  const duplicateCount = rows.filter((row) => row.duplicate).length
  const invalidCount = rows.filter((row) => !row.valid).length

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    setError('')
    setLoading(true)
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!firstSheet) throw new Error('No se encontró una hoja para importar.')
      const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })
      const seenDnis = new Set(existingDnis)
      const seenPhones = new Set(existingPhones)
      const parsed = source.map((item): ImportRow => {
        const record = Object.fromEntries(Object.entries(item).map(([key, value]) => [normalizeHeader(key), String(value ?? '').trim()]))
        const dni = firstValue(record, ['dni', 'documento', 'numerodedocumento', 'nrodocumento'])
        const name = firstValue(record, ['nombre', 'nombres', 'cliente', 'name'])
        const phone = firstValue(record, ['whatsapp', 'telefono', 'celular', 'phone', 'numerodetelefono'])
        const normalizedPhone = normalizePhone(phone)
        const valid = Boolean(dni && name && normalizedPhone && /^\d{8}$/.test(dni) && /^\d{9}$/.test(normalizedPhone))
        const duplicate = Boolean((dni && seenDnis.has(dni)) || (normalizedPhone && seenPhones.has(normalizedPhone)))
        if (dni) seenDnis.add(dni)
        if (normalizedPhone) seenPhones.add(normalizedPhone)
        return { dni, name, phone: normalizedPhone, valid, duplicate }
      })
      setRows(parsed)
      if (!source.length) setError('El archivo no contiene registros para importar.')
    } catch (caught) {
      setRows([])
      setError(caught instanceof Error ? caught.message : 'No pudimos leer el archivo. Verifica el formato e inténtalo nuevamente.')
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  const importNow = () => {
    const imported = newRows.map((row, index): Prospect => ({
      id: `import-${Date.now()}-${index}`,
      dni: row.dni,
      name: row.name,
      phone: row.phone,
      status: 'pending',
      offerAmount: null, rate: null, lastReview: null, nextReview: null, contactDate: null, message: null,
      mockEligibility: deterministicEligibility(row.dni), eligibility: null,
    }))
    onImport(imported)
    setRows([])
    setFilename('')
  }

  return <>
    <PageTitle eyebrow="GESTIÓN DE BASES" title="Importar prospectos" subtitle="Carga una lista de clientes para iniciar una nueva gestión." action={<button className="outline-button" onClick={onDemo}><Database size={15} /> Cargar datos de demostración</button>} />
    <div className="import-layout">
      <div className="import-main">
        <section className={`upload-panel ${rows.length ? 'has-file' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && inputRef.current) { const transfer = new DataTransfer(); transfer.items.add(file); inputRef.current.files = transfer.files; inputRef.current.dispatchEvent(new Event('change', { bubbles: true })) } }}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} hidden />
          <div className="upload-icon"><CloudUpload size={24} /></div><h2>{loading ? 'Leyendo archivo…' : filename || 'Arrastra tu archivo aquí'}</h2><p>{loading ? 'Estamos revisando las columnas y detectando duplicados.' : filename ? 'Archivo listo para importar' : 'o selecciona un archivo desde tu equipo'}</p><button className="outline-button" onClick={() => inputRef.current?.click()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={15} /> : <ArrowDownToLine size={15} />}{filename ? 'Cambiar archivo' : 'Seleccionar archivo'}</button><div className="file-types"><span><CheckCircle2 size={13} /> .xlsx</span><span><CheckCircle2 size={13} /> .xls</span><span><CheckCircle2 size={13} /> .csv</span><span>Máximo 10 MB</span></div>
        </section>
        {error && <div className="inline-error"><CircleHelp size={16} />{error}</div>}
        {rows.length > 0 && <section className="panel import-preview"><div className="panel-heading"><div><div className="eyebrow">VISTA PREVIA</div><h2>{filename}</h2></div><span className="records-found">{rows.length} registros encontrados</span></div><div className="import-summary"><div><strong>{newRows.length}</strong><span>nuevos</span></div><div><strong>{duplicateCount}</strong><span>duplicados</span></div><div><strong>{invalidCount}</strong><span>inválidos</span></div></div><div className="table-scroll"><table className="data-table preview-table"><thead><tr><th>Nombre</th><th>DNI</th><th>WhatsApp</th><th>Resultado</th></tr></thead><tbody>{rows.slice(0, 6).map((row, index) => <tr key={`${row.dni}-${index}`}><td>{row.name || '—'}</td><td className="mono-cell">{row.dni || '—'}</td><td>{row.phone ? formatPhone(row.phone) : '—'}</td><td>{!row.valid ? <span className="import-row-bad">Inválido</span> : row.duplicate ? <span className="import-row-duplicate">Duplicado</span> : <span className="import-row-ok"><Check size={12} /> Nuevo</span>}</td></tr>)}</tbody></table></div>{rows.length > 6 && <div className="preview-more">Mostrando 6 de {rows.length} registros</div>}<div className="import-action-row"><span>{newRows.length} prospectos listos para agregar</span><button className="primary-button" disabled={!newRows.length} onClick={importNow}><CloudUpload size={15} /> Importar prospectos</button></div></section>}
        {!rows.length && !error && <section className="panel import-guide"><div className="guide-icon"><ListChecks size={17} /></div><div><h3>Columnas requeridas</h3><p>Tu archivo debe incluir estas columnas. Reconocemos nombres equivalentes automáticamente.</p></div><div className="required-columns"><span>DNI</span><span>Nombre</span><span>WhatsApp</span></div></section>}
      </div>
      <aside className="import-aside"><section className="panel import-help"><div className="help-illustration"><FileSpreadsheet size={23} /></div><div className="eyebrow">IMPORTACIÓN RÁPIDA</div><h3>Tu cartera, lista en segundos</h3><p>Sube el archivo de tus clientes y BuyBot se encargará de organizarlos para iniciar el proceso.</p><div className="help-step"><span>1</span><div><strong>Selecciona tu archivo</strong><small>Excel o CSV desde tu equipo</small></div></div><div className="help-step"><span>2</span><div><strong>Revisa los registros</strong><small>Validamos y detectamos duplicados</small></div></div><div className="help-step"><span>3</span><div><strong>Inicia la gestión</strong><small>Comienza la automatización</small></div></div></section><div className="import-secure-note"><LockKeyhole size={15} /><span>La información se procesa de forma local en este navegador y no se envía a ningún servidor.</span></div></aside>
    </div>
  </>
}

function normalizeHeader(value: string): string { return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '') }
function firstValue(record: Record<string, string>, keys: string[]): string { return keys.map((key) => record[key]).find(Boolean) ?? '' }
function normalizePhone(value: string): string { return value.replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '') }
