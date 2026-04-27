import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import * as QRCode from 'qrcode';
import { join } from 'path';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { CatalogService } from './catalog.service';

@Injectable()
export class PdfService {
  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly config: ConfigService,
    private readonly empresaService: EmpresaService,
    private readonly catalogs: CatalogService,
  ) {}

  async generarPdf(id: string): Promise<Buffer> {
    const dte = await this.dteRepo.findOne({
      where: [{ id }, { codigoGeneracion: id }],
      relations: ['empresa'],
    });
    if (!dte) throw new NotFoundException(`DTE ${id} no encontrado`);

    const empresa = dte.empresa;
    const json     = dte.jsonDte as any;
    const esCcf    = dte.tipoDte === '03';
    const esFse    = dte.tipoDte === '14';

    // ── URLs de QR ────────────────────────────────────────────────────────────
    // URL de consulta pública MH con campos pre-llenados
    const qrMhUrl = `https://admin.factura.gob.sv/consultaPublica?fechaEmi=${dte.fechaEmision}&codigoGeneracion=${dte.codigoGeneracion}`;
    const appPublicUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:5173');
    const qrIfactuUrl = `${appPublicUrl}/verificar/${dte.codigoGeneracion}`;
    const qr1 = await QRCode.toBuffer(qrMhUrl,                { errorCorrectionLevel: 'L', width: 200 });
    const qr2 = await QRCode.toBuffer(dte.codigoGeneracion,   { errorCorrectionLevel: 'L', width: 180 });
    const qr3 = await QRCode.toBuffer(dte.selloRecepcion || 'PENDIENTE', { errorCorrectionLevel: 'L', width: 180 });
    const qr4 = await QRCode.toBuffer(dte.numeroControl,      { errorCorrectionLevel: 'L', width: 180 });
    const qr5 = await QRCode.toBuffer(qrIfactuUrl,            { errorCorrectionLevel: 'L', width: 180 });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 30, bottom: 10, left: 30, right: 30 } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W          = doc.page.width - 60;   // 535px
      const blueColor  = '#1e40af';
      const borderCol  = '#cbd5e1';

      // ── Helpers de formato ────────────────────────────────────────────────
      const fmtFecha = (f: string) => {
        if (!f) return '—';
        const p = f.split('-');
        return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : f;
      };
      const fmtHora = (h: string) => {
        if (!h) return '—';
        const p = h.split(':');
        if (p.length >= 2) {
          let hr = parseInt(p[0], 10);
          const mn = p[1];
          const ap = hr >= 12 ? 'PM' : 'AM';
          hr = hr % 12 || 12;
          return `${hr}:${mn} ${ap}`;
        }
        return h;
      };

      const tipoModeloLabel: Record<number, string> = {
        1: 'Facturación previo',
        2: 'Facturación diferido',
      };
      const tipoOperacionLabel: Record<number, string> = {
        1: 'Transmisión normal',
        2: 'Transmisión contingencia',
      };

      const modeloStr    = tipoModeloLabel[json?.identificacion?.tipoModelo]  ?? 'Previo';
      const operacionStr = tipoOperacionLabel[json?.identificacion?.tipoOperacion] ?? 'Normal';
      const versionStr   = String(json?.identificacion?.version ?? 1);
      const fechaStr     = fmtFecha(dte.fechaEmision ?? json?.identificacion?.fecEmi ?? '');
      const horaStr      = fmtHora(json?.identificacion?.horEmi ?? '');

      // ══════════════════════════════════════════════════════════════════════
      //  ZONA SUPERIOR: empresa (izq) + caja metadata (der)
      // ══════════════════════════════════════════════════════════════════════
      const leftW  = 210;   // columna izquierda: logo + datos emisor
      const rightW = W - leftW - 8;  // columna derecha: título + metadata
      const rightX = 30 + leftW + 8;

      // ── Logo ──────────────────────────────────────────────────────────────
      const logoSize = 60;
      if (empresa.logoPath) {
        try {
          doc.image(join(process.cwd(), empresa.logoPath), 30, 30, { width: logoSize });
        } catch {
          doc.fontSize(9).font('Helvetica-Bold').text('LOGO', 30, 45, { width: logoSize, align: 'center' });
        }
      }

      // ── Datos emisor debajo del logo ──────────────────────────────────────
      let emHdrY = 30 + logoSize + 4;
      const emLine = (txt: string, bold = false, sz = 7) => {
        doc.fontSize(sz).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#0f172a')
          .text(txt, 30, emHdrY, { width: leftW, lineBreak: false });
        emHdrY += sz + 3;
      };
      emLine(empresa.nombreLegal || empresa.nombreComercial || '', true, 8);
      if (empresa.nombreComercial && empresa.nombreComercial !== empresa.nombreLegal) {
        emLine(empresa.nombreComercial, false, 7);
      }
      emLine(empresa.descActividad || '', false, 6.5);
      emLine(empresa.complemento  || '', false, 6.5);
      // Departamento y municipio si los tienes resueltos en el emisor JSON
      const emDir = json?.emisor?.direccion;
      if (emDir?.complemento && emDir.complemento !== empresa.complemento) {
        emLine(emDir.complemento, false, 6.5);
      }
      emLine(`TEL: ${empresa.telefono || '—'}   CORREO: ${empresa.correo || '—'}`, false, 6.5);
      emLine(`NIT: ${empresa.nit || '—'}   NRC: ${empresa.nrc || '—'}`, false, 6.5);

      // ── Caja derecha: Título ──────────────────────────────────────────────
      const titleH = 36;
      doc.roundedRect(rightX, 30, rightW, titleH, 3).stroke(borderCol);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a')
        .text('DOCUMENTO TRIBUTARIO ELECTRÓNICO', rightX, 36, { width: rightW, align: 'center' });
      doc.fontSize(10).text(this.catalogs.getDocType(dte.tipoDte).toUpperCase(), rightX, 48, { width: rightW, align: 'center' });
      doc.fillColor('black');

      // ── Caja derecha: Metadata ────────────────────────────────────────────
      const metaY    = 30 + titleH + 4;
      const metaH    = 132;
      const metaBoxX = rightX;
      const metaBoxW = rightW;
      doc.roundedRect(metaBoxX, metaY, metaBoxW, metaH, 3).stroke(borderCol);

      // Helper: una fila completa
      const mRow = (label: string, value: string, y: number) => {
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569')
          .text(label, metaBoxX + 5, y);
        doc.font('Helvetica').fillColor('#0f172a')
          .text(value || 'N/A', metaBoxX + 5, y + 8, { width: metaBoxW - 10, lineBreak: false });
      };
      // Helper: dos columnas en la misma fila
      const mRow2 = (l1: string, v1: string, l2: string, v2: string, y: number) => {
        const half = Math.floor((metaBoxW - 10) / 2);
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569')
          .text(l1, metaBoxX + 5, y);
        doc.font('Helvetica').fillColor('#0f172a')
          .text(v1, metaBoxX + 5, y + 8, { width: half - 4, lineBreak: false });
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569')
          .text(l2, metaBoxX + 5 + half, y);
        doc.font('Helvetica').fillColor('#0f172a')
          .text(v2, metaBoxX + 5 + half, y + 8, { width: half - 4, lineBreak: false });
      };

      const r0 = metaY + 5;
      mRow('Código de Generación:',  dte.codigoGeneracion,             r0);
      mRow('Sello de Recepción:',    dte.selloRecepcion || 'PENDIENTE', r0 + 20);
      mRow('Número de Control:',     dte.numeroControl,                 r0 + 40);
      mRow2('Modelo de Facturación:', modeloStr, 'Versión JSON:', versionStr, r0 + 60);
      mRow2('Tipo de Transmisión:',  operacionStr, 'Fecha Emisión:', fechaStr, r0 + 80);
      mRow('Hora de Emisión:',       horaStr,                           r0 + 100);
      doc.fillColor('black');

      // ── 5 QR codes (debajo de la sección superior) ────────────────────────
      const qrY    = Math.max(emHdrY + 4, metaY + metaH + 4);
      const qrSize = 68;
      const qrGap  = 5;
      // QR 1 grande: Portal MH
      doc.image(qr1, 30, qrY, { width: qrSize + 8 });
      doc.fontSize(6).font('Helvetica').fillColor('#475569')
        .text('Portal Hacienda', 30, qrY + qrSize + 10, { width: qrSize + 8, align: 'center' });
      // QR 2: Código generación
      doc.image(qr2, 30 + qrSize + 8 + qrGap, qrY + 4, { width: qrSize });
      doc.text('Código generación', 30 + qrSize + 8 + qrGap, qrY + qrSize + 10, { width: qrSize, align: 'center' });
      // QR 3: Sello recibido
      doc.image(qr3, 30 + (qrSize + 8 + qrGap) + qrSize + qrGap, qrY + 4, { width: qrSize });
      doc.text('Sello recibido', 30 + (qrSize + 8 + qrGap) + qrSize + qrGap, qrY + qrSize + 10, { width: qrSize, align: 'center' });
      // QR 4: Número de control
      const qr4X = 30 + (qrSize + 8 + qrGap) + (qrSize + qrGap) * 2;
      doc.image(qr4, qr4X, qrY + 4, { width: qrSize });
      doc.text('Número de control', qr4X, qrY + qrSize + 10, { width: qrSize, align: 'center' });
      // QR 5: Verificar en iFactu
      const qr5X = 30 + (qrSize + 8 + qrGap) + (qrSize + qrGap) * 3;
      doc.image(qr5, qr5X, qrY + 4, { width: qrSize });
      doc.fillColor('#1e40af')
        .text('Verificar en iFactu', qr5X, qrY + qrSize + 10, { width: qrSize, align: 'center' });
      doc.fillColor('#475569');

      doc.y = qrY + qrSize + 20;
      doc.fillColor('black');

      // ══════════════════════════════════════════════════════════════════════
      //  SECCIÓN EMISOR / RECEPTOR (dos columnas)
      // ══════════════════════════════════════════════════════════════════════
      const sectionY = doc.y + 2;
      const colW     = (W - 10) / 2;
      const boxH     = 100;

      const row = (l: string, v: string, y: number, x: number, maxW: number) => {
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#0f172a')
          .text(`${l}: `, x, y, { continued: true, width: maxW });
        doc.font('Helvetica').text(v || '—', { width: maxW - doc.widthOfString(`${l}: `) });
        return doc.y;
      };

      // Emisor
      doc.rect(30, sectionY, colW, 12).fill(blueColor);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(7.5)
        .text('EMISOR', 35, sectionY + 2.5);
      doc.rect(30, sectionY + 12, colW, boxH).stroke(borderCol);
      doc.fillColor('#0f172a').font('Helvetica').fontSize(7);
      let emY2 = sectionY + 16;
      const eRow = (l: string, v: string) => {
        doc.font('Helvetica-Bold').text(`${l}: `, 35, emY2, { continued: true });
        doc.font('Helvetica').text(v || '—', { width: colW - 12, lineBreak: false });
        emY2 += 10;
      };
      eRow('Nombre',           empresa.nombreLegal);
      if (empresa.nombreComercial) eRow('Comercial', empresa.nombreComercial);
      eRow('NIT',              empresa.nit);
      eRow('NRC',              empresa.nrc);
      eRow('Actividad',        empresa.descActividad);
      eRow('Dirección',        empresa.complemento);
      eRow('Teléfono',         empresa.telefono);

      // Receptor
      const rec = esFse
        ? ((dte.jsonDte as any).sujetoExcluido || {})
        : ((dte.jsonDte as any).receptor || {});
      const tipoDocLabels: Record<string, string> = {
        '13': 'DUI', '36': 'NIT', '37': 'Pasaporte', '02': 'Carné Extr.', '03': 'Carné Res.',
      };
      const recX = 30 + colW + 10;
      doc.rect(recX, sectionY, colW, 12).fill(blueColor);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(7.5)
        .text(esFse ? 'SUJETO EXCLUIDO' : 'RECEPTOR', recX + 5, sectionY + 2.5);
      doc.rect(recX, sectionY + 12, colW, boxH).stroke(borderCol);
      doc.fillColor('#0f172a').font('Helvetica').fontSize(7);
      let reY2 = sectionY + 16;
      const rRow = (l: string, v: string) => {
        if (!v) return;
        doc.font('Helvetica-Bold').text(`${l}: `, recX + 5, reY2, { continued: true });
        doc.font('Helvetica').text(v, { width: colW - 12, lineBreak: false });
        reY2 += 10;
      };
      rRow('Nombre', rec.nombre || 'Consumidor Final');
      if (esFse) {
        rRow('Tipo Doc.', tipoDocLabels[rec.tipoDocumento] ?? rec.tipoDocumento ?? '—');
        rRow('N° Documento', rec.numDocumento);
      } else {
        // Mostrar DUI si tipoDocumento=13, NIT si =36, o numDocumento genérico
        if (rec.numDocumento) {
          const docLabel = tipoDocLabels[rec.tipoDocumento] ?? 'Documento';
          rRow(docLabel, rec.numDocumento);
        }
        if (rec.nit) rRow('NIT', rec.nit);
        if (rec.nrc) rRow('NRC', rec.nrc);
      }
      if (rec.codActividad) rRow('Actividad', `${rec.codActividad}${rec.descActividad ? ' - ' + rec.descActividad : ''}`);
      if (rec.direccion?.complemento) rRow('Dirección', rec.direccion.complemento);
      if (rec.correo)   rRow('Correo',   rec.correo);
      if (rec.telefono) rRow('Teléfono', rec.telefono);

      // Forma de pago (condición de operación)
      const condLabels: Record<number, string> = { 1: 'CONTADO', 2: 'CRÉDITO', 3: 'OTRO' };
      const formaPago = condLabels[json?.resumen?.condicionOperacion] ?? 'CONTADO';
      rRow('Forma de pago', formaPago);

      doc.y = sectionY + 12 + boxH + 6;

      // ══════════════════════════════════════════════════════════════════════
      //  TABLA DE ITEMS
      // ══════════════════════════════════════════════════════════════════════
      const tableTop = doc.y;
      // Columnas: Cant | Código | Descripción | P.U. | Desc | V.N/S | V.Ex | V.Grav
      const cols = [
        { w: 28,  x: 30,  lbl: 'Cant.',       align: 'right'  as const },
        { w: 45,  x: 58,  lbl: 'Código',      align: 'left'   as const },
        { w: 185, x: 103, lbl: 'Descripción', align: 'left'   as const },
        { w: 50,  x: 288, lbl: 'P. Unitario', align: 'right'  as const },
        { w: 40,  x: 338, lbl: 'Descuento',   align: 'right'  as const },
        { w: 40,  x: 378, lbl: 'V. N/S',      align: 'right'  as const },
        { w: 40,  x: 418, lbl: 'V. Exenta',   align: 'right'  as const },
        { w: 57,  x: 458, lbl: 'V. Gravada',  align: 'right'  as const },
      ];
      const colsFse = cols.map((c, i) => ({
        ...c,
        lbl: ['Cant.','Código','Descripción','P. Unitario','Descuento','C. N/S','C. Exenta','C. Afectada'][i],
      }));
      const activeCols = esFse ? colsFse : cols;

      doc.rect(30, tableTop, W, 13).fill(blueColor);
      doc.fillColor('white').fontSize(6.5).font('Helvetica-Bold');
      activeCols.forEach(c => {
        doc.text(c.lbl, c.x + 2, tableTop + 3, { width: c.w - 4, align: c.align, lineBreak: false });
      });

      let itemY = tableTop + 13;
      doc.fillColor('black').font('Helvetica').fontSize(7);
      const items = (json.cuerpoDocumento || []) as any[];
      items.forEach((item, idx) => {
        const rowH = 13;
        if (idx % 2 === 1) doc.rect(30, itemY, W, rowH).fill('#f1f5f9');
        doc.fillColor('#0f172a');

        const noSuj   = esFse ? 0 : (item.ventaNoSuj   || 0);
        const exenta  = esFse ? 0 : (item.ventaExenta  || 0);
        const gravada = esFse ? (item.compra || item.compraAfectada || 0) : (item.ventaGravada || 0);

        const vals = [
          String(item.cantidad),
          item.codigo || '—',
          item.descripcion,
          `$${Number(item.precioUni).toFixed(4)}`,
          `$${Number(item.montoDescu || 0).toFixed(2)}`,
          `$${Number(noSuj).toFixed(2)}`,
          `$${Number(exenta).toFixed(2)}`,
          `$${Number(gravada).toFixed(2)}`,
        ];

        activeCols.forEach((c, i) => {
          doc.text(vals[i], c.x + 2, itemY + 3, {
            width: c.w - 4, align: c.align, lineBreak: false,
          });
        });
        itemY += rowH;
        doc.fillColor('black');
      });

      doc.moveTo(30, itemY).lineTo(30 + W, itemY).stroke(borderCol);
      doc.y = itemY + 8;

      // ══════════════════════════════════════════════════════════════════════
      //  TOTALES
      // ══════════════════════════════════════════════════════════════════════
      const resY = doc.y;
      const res  = json.resumen || {};

      // Izquierda: letras + condición + vendedor
      doc.roundedRect(30, resY, 240, 70, 3).stroke(borderCol);
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a')
        .text('Valor en letras:', 36, resY + 7);
      doc.font('Helvetica').fontSize(8)
        .text(res.totalLetras || '—', 36, resY + 17, { width: 225 });
      const vendedor = json?.extension?.nombEntrega || json?.extension?.docuEntrega || '';
      if (vendedor) {
        doc.fontSize(7).fillColor('#475569').text(`Vendedor: ${vendedor}`, 36, resY + 50, { width: 225 });
      }

      // Derecha: tabla de cálculos
      const totW = 200;
      const totX = 30 + W - totW;
      doc.y = resY;

      const tRow = (l: string, v: number, bold = false) => {
        if (v === 0 && !bold) return; // omitir ceros excepto el total
        const cy = doc.y;
        doc.fontSize(7.5).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#1e293b');
        doc.text(l, totX, cy, { width: 120, align: 'right', lineBreak: false });
        doc.text(`$${Number(v).toFixed(2)}`, totX + 122, cy, { width: totW - 124, align: 'right', lineBreak: false });
        doc.moveDown(0.2);
      };

      if (esFse) {
        tRow('Total Compra:', res.totalCompra ?? 0, true);
        tRow('Retención Renta:', res.reteRenta ?? 0);
        tRow('Descuento:', res.descu ?? 0);
      } else {
        tRow('Total No Sujetas:', res.totalNoSuj ?? 0);
        tRow('Total Exentas:', res.totalExenta ?? 0);
        tRow('Subtotal Gravadas:', res.subTotalVentas ?? 0);
        tRow('Suma sin impuestos:', res.subTotal ?? 0);
        tRow('Retención Renta:', res.reteRenta ?? 0);
        tRow('IVA Retenido:', res.ivaRete1 ?? 0);
        if (esCcf) {
          const iva = res.tributos?.find((t: any) => t.codigo === '20')?.valor
            ?? Math.round((res.totalGravada ?? 0) * 0.13 * 100) / 100;
          tRow('IVA 13%:', iva);
        }
        tRow('Monto total operación:', res.montoTotalOperacion ?? 0);
      }

      const finY = doc.y + 3;
      doc.rect(totX, finY, totW, 16).fill('#dbeafe');
      doc.fillColor(blueColor).fontSize(9).font('Helvetica-Bold');
      doc.text('TOTAL A PAGAR:', totX + 4, finY + 3.5);
      doc.text(`$${Number(dte.totalPagar).toFixed(2)}`, totX + 110, finY + 3.5, { width: totW - 114, align: 'right', lineBreak: false });

      // ══════════════════════════════════════════════════════════════════════
      //  FOOTER — barra azul fija al fondo de la página
      // ══════════════════════════════════════════════════════════════════════
      const footerH  = 20;
      const footerY  = doc.page.height - footerH - 10;
      doc.rect(30, footerY, W, footerH).fill(blueColor);
      doc.fillColor('#ffffff').fontSize(6.5).font('Helvetica')
        .text(
          `Documento generado el ${new Date().toLocaleDateString('es-SV')} · iFactu by Nexa SV · ${empresa.nombreLegal}`,
          30, footerY + 6, { width: W, align: 'center', lineBreak: false },
        );

      // ══════════════════════════════════════════════════════════════════════
      //  WATERMARK ANULADO (encima de todo, última operación)
      // ══════════════════════════════════════════════════════════════════════
      if (dte.estado === EstadoDte.ANULADO) {
        doc.save();
        doc.fontSize(60).fillColor('red', 0.15).font('Helvetica-Bold');
        doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
        doc.text('INVALIDADO / ANULADO', 0, doc.page.height / 2, { width: doc.page.width, align: 'center' });
        doc.restore();
      }

      doc.end();
    });
  }
}
