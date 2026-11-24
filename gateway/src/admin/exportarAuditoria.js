// Exporta a Excel la auditoria con los filtros puestos, tal como se lee en pantalla (nombres en vez de ids). exceljs se
// carga solo al exportar, para no engordar el panel.
import { api } from '../api/client.js';
import { ACCIONES, describir } from './auditoriaTexto.js';

const POR_PAGINA = 1000;
// Tope para no colgar el navegador; con filtros (fechas, accion, persona) se exporta lo que haga falta por partes.
const MAXIMO = 20000;

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

// `progreso(texto)` informa el avance en el boton. Lanza un Error con mensaje para mostrar si algo falla.
export async function exportarAuditoria({ accion, usuario, desde, hasta }, ix, progreso) {
  const base = new URLSearchParams();
  if (accion) base.set('accion', accion);
  if (usuario) base.set('usuarioId', usuario);
  if (desde) base.set('desde', desde);
  if (hasta) base.set('hasta', hasta);

  const filas = [];
  let total = Infinity;
  while (filas.length < total) {
    const q = new URLSearchParams(base);
    q.set('limit', String(POR_PAGINA));
    q.set('offset', String(filas.length));
    const { data, meta } = await api.pagina(`/auditoria?${q}`);
    total = meta.total ?? 0;
    if (total > MAXIMO) {
      throw new Error(`Son ${total} registros y el máximo por archivo es ${MAXIMO}. Acota con las fechas, la acción o la persona.`);
    }
    if (!data.length) break;
    filas.push(...data);
    progreso(`Leyendo ${filas.length} de ${total}…`);
  }

  progreso('Armando el archivo…');
  const { default: ExcelJS } = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Auditoría', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = [
    { header: 'Fecha (hora Colombia)', key: 'fecha', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Quién', key: 'quien', width: 28 },
    { header: 'Correo', key: 'correo', width: 30 },
    { header: 'Acción', key: 'accion', width: 28 },
    { header: 'Detalle', key: 'detalle', width: 80 },
    { header: 'IP', key: 'ip', width: 16 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.autoFilter = { from: 'A1', to: 'F1' };
  for (const f of filas) {
    // Excel no maneja zonas horarias: se escribe la hora de Colombia (UTC-5) como si fuera UTC.
    const fecha = new Date(new Date(f.creado_en).getTime() - 5 * 60 * 60 * 1000);
    hoja.addRow({
      fecha,
      quien: f.actor?.nombre ?? '',
      correo: f.actor?.email ?? f.detalle?.email ?? '',
      accion: ACCIONES[f.accion] ?? f.accion,
      detalle: describir(f, ix),
      ip: f.ip ?? '',
    });
  }

  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `auditoria-portal-${hoy()}.xlsx`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
