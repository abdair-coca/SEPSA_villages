// Genera la copia Word de la entrega SEPSA desde los Markdown de docs/entrega-sepsa/.
// Uso: npm install && npm run build   (ver README.md de esta carpeta)
// La salida es docs/entrega-sepsa/entrega-sepsa-SEPSA.docx; no se commitea (D030).
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, AlignmentType, HeadingLevel, Header, Footer, PageNumber, TableOfContents,
  LevelFormat, TabStopType, Tab, TableLayoutType, PageOrientation,
} = require('docx');

const ENTREGA = path.resolve(__dirname, '..');
// SALIDA permite escribir en otra ruta (p. ej. si el .docx está abierto en Word).
const OUT = process.env.SALIDA || path.join(ENTREGA, 'entrega-sepsa-SEPSA.docx');
const NAVY = '1F3864';
const GRAY = '666666';
const TEXT_W = 9638; // A4 (11906) menos márgenes de 2 cm (1134 x 2), en twips
const LAND_W = 14570; // A4 apaisado (16838) menos márgenes, en twips
let W = TEXT_W; // ancho útil de la sección en curso
const CODE_FONT = 'Consolas';
const CM = (cm) => Math.round(cm * 96 / 2.54); // píxeles a 96 ppp, unidad de docx para imágenes
const LABEL = /^(Fuente|Fecha|Estado):\s*(.*)$/;

const thin = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const GRID = { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin };
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Transformaciones solo de presentación; las fuentes no cambian:
// - el marcador de pendiente se muestra como «Pendiente de SEPSA»;
// - las fechas de la copia no se muestran (D032).
function presentar(md) {
  return md
    .replace(/`?'?TODO: VALIDAR CON SEPSA'?`?/g, 'Pendiente de SEPSA')
    .replace(/ \(\d{4}-\d{2}-\d{2}\)/g, '')
    .replace(/ el \d{4}-\d{2}-\d{2}/g, '')
    .replace(/Estado al \d{4}-\d{2}-\d{2}, /g, 'Estado ')
    .replace(/ al \d{4}-\d{2}-\d{2}/g, '');
}

// Fuentes: índice (README) y los 14 documentos. Los nombres de archivo .md se
// sustituyen por el número de sección, porque SEPSA no recibe archivos .md.
// Puntos de la carta (D034): cada documento del cuerpo es un apartado numerado.
const PUNTOS = [
  { titulo: '1. Requerimientos funcionales y técnicos, y procesos de corte y reconexión',
    docs: { '01': '1.1', '02': '1.2' } },
  { titulo: '2. Arquitectura, tecnologías, modelo de base de datos, diccionario de datos y código fuente',
    docs: { '03': '2.1', '04': '2.2', '05': '2.3', '06': '2.4' } },
  { titulo: '3. Manuales técnico, de instalación y de usuario',
    docs: { '07': '3.1', '08': '3.2', '09': '3.3' } },
  { titulo: '4. Plan de pruebas, criterios de aceptación y resultados',
    docs: { '10': '4.1', '11': '4.2' } },
  { titulo: '5. Seguridad, perfiles de acceso y tratamiento de la información',
    docs: { '12': '5.1', '13': '5.2' } },
  { titulo: '6. Pendientes y decisiones (transversal)',
    docs: { '14': '6.1' } },
];

// El H1 «NN. Título» del documento pasa a apartado «X.Y Título» (H2); sus encabezados
// de contenido bajan un nivel. Los bloques de código no se tocan.
function enApartado(md, apartado) {
  let dentro = false;
  let primero = true;
  return md.split('\n').map((linea) => {
    if (/^```/.test(linea)) { dentro = !dentro; return linea; }
    if (dentro) return linea;
    if (primero && /^# \d\d\. /.test(linea)) {
      primero = false;
      return `## ${apartado} ${linea.replace(/^# \d\d\. /, '')}`;
    }
    if (/^### /.test(linea)) return `#### ${linea.slice(4)}`;
    if (/^## /.test(linea)) return `### ${linea.slice(3)}`;
    return linea;
  }).join('\n');
}

// Cada parte lleva la carpeta de su archivo, para resolver las imágenes relativas.
function loadSource() {
  const readme = fs.readFileSync(path.join(ENTREGA, 'README.md'), 'utf8')
    .replace(/^# .*$/m, '# Índice de la entrega');
  const parts = [{ md: readme, dir: ENTREGA }];
  for (const punto of PUNTOS) {
    let primeraParte = true;
    for (const [nn, apartado] of Object.entries(punto.docs)) {
      const archivo = fs.readdirSync(ENTREGA).find((f) => f.startsWith(`${nn}-`) && f.endsWith('.md'));
      let md = enApartado(fs.readFileSync(path.join(ENTREGA, archivo), 'utf8'), apartado);
      if (primeraParte) { md = `# ${punto.titulo}\n\n${md}`; primeraParte = false; }
      parts.push({ md, dir: ENTREGA });
    }
  }
  return parts.map((p) => ({
    dir: p.dir,
    md: presentar(p.md).replace(/`(\d\d)-[a-z0-9-]+\.md`/g, 'sección $1'),
  }));
}

// Tamaño natural de un PNG leído de su cabecera IHDR.
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), data: b };
}

// ---------- texto en línea ----------
function text(s, base) {
  return new TextRun({ text: s.replace(/\n/g, ' '), ...base });
}

function runs(tokens, base = {}) {
  const out = [];
  for (const t of tokens || []) {
    switch (t.type) {
      case 'text':
      case 'escape':
        if (t.tokens) out.push(...runs(t.tokens, base));
        else out.push(text(decode(t.text ?? t.raw ?? ''), base));
        break;
      case 'strong': out.push(...runs(t.tokens, { ...base, bold: true })); break;
      case 'em': out.push(...runs(t.tokens, { ...base, italics: true })); break;
      case 'del': out.push(...runs(t.tokens, { ...base, strike: true })); break;
      case 'link': out.push(...runs(t.tokens, base)); break;
      case 'codespan':
        out.push(new TextRun({
          ...base, text: decode(t.text), font: CODE_FONT, size: 17,
          shading: { type: ShadingType.CLEAR, fill: 'EEF1F6', color: 'auto' },
        }));
        break;
      case 'br': out.push(new TextRun({ break: 1 })); break;
      case 'image': break; // las imágenes en línea se tratan en imageRow
      default: if (t.raw) out.push(text(decode(t.raw), base));
    }
  }
  return out;
}

// ---------- tablas ----------
function plainLen(cell) { return (cell && cell.text ? cell.text.replace(/[`*_]/g, '') : '').length; }

function colWidths(rows, cols) {
  const avg = [];
  for (let j = 0; j < cols; j++) {
    const total = rows.reduce((a, r) => a + plainLen(r[j]), 0);
    avg.push(Math.max(6, Math.min(60, total / rows.length)));
  }
  const sum = avg.reduce((a, b) => a + b, 0);
  const w = avg.map((l) => Math.max(900, Math.round((TEXT_W * l) / sum)));
  w[w.length - 1] += TEXT_W - w.reduce((a, b) => a + b, 0);
  return w;
}

function cellRaw(children, width, fill) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    children,
  });
}

function cellPara(rr) {
  return new Paragraph({ children: rr, spacing: { before: 0, after: 0, line: 240 } });
}

function dataTable(tok) {
  const cols = tok.header.length;
  const rows = [tok.header, ...tok.rows];
  const widths = colWidths(rows, cols);
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: GRID,
    rows: rows.map((r, i) => {
      const head = i === 0;
      const zebra = !head && i % 2 === 0;
      return new TableRow({
        tableHeader: head,
        cantSplit: true,
        children: r.map((c, j) => cellRaw(
          [cellPara(runs(c.tokens, head ? { bold: true, color: 'FFFFFF', size: 17 } : { size: 17 }))],
          widths[j],
          head ? NAVY : zebra ? 'F5F7FA' : undefined,
        )),
      });
    }),
  });
}

function kvTable(rows, widths) {
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: GRID,
    rows: rows.map(([k, v]) => new TableRow({
      cantSplit: true,
      children: [
        cellRaw([cellPara([new TextRun({ text: k, bold: true, size: 18, color: NAVY })])], widths[0], 'EEF1F6'),
        cellRaw([cellPara(v)], widths[1]),
      ],
    })),
  });
}

const spacer = (after = 100) => new Paragraph({ spacing: { before: 0, after } });

// ---------- imágenes ----------
// Imágenes de escritorio (ancho >= 1000 px) a 12 cm; de móvil, a 4,4 cm.
// Varias imágenes en un mismo párrafo forman una fila sin bordes, con su pie bajo cada una.
function imageCell(token, cellW, dir) {
  const file = path.join(dir, token.href);
  const img = pngSize(file);
  const esDiagrama = (token.text || '').startsWith('Diagrama');
  const targetCm = esDiagrama ? 24 : img.width >= 1000 ? 12 : 4.4;
  const maxW = cellW / 1440 * 2.54 * 37.795 - 12; // ancho disponible en píxeles, descontando márgenes
  let w = Math.min(CM(targetCm), Math.round(maxW));
  const h = Math.round(w * img.height / img.width);
  const caption = token.text ? [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 0 },
    children: [new TextRun({ text: token.text, italics: true, size: 16, color: GRAY })],
  })] : [];
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 0 },
      children: [new ImageRun({
        type: 'png', data: img.data, transformation: { width: w, height: h },
        altText: { name: token.text || path.basename(file), title: token.text || '', description: token.text || '' },
      })],
    }),
    ...caption,
  ];
}

function imageRow(tokens, dir) {
  const imgs = tokens.filter((t) => t.type === 'image');
  const n = imgs.length;
  const widths = Array.from({ length: n }, (_, i) => Math.floor(W / n) + (i === n - 1 ? W % n : 0));
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [new TableRow({
      cantSplit: true,
      children: imgs.map((t, i) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 60, right: 60 },
        children: imageCell(t, widths[i], dir),
      })),
    })],
  });
}

// ---------- bloques ----------
let listInstance = 0;

function P(children, ctx = {}, extra = {}) {
  const o = { children, ...extra };
  if (ctx.quote) {
    o.indent = { left: 284 };
    o.border = { left: { style: BorderStyle.SINGLE, size: 12, color: 'A6A6A6', space: 8 } };
  }
  return new Paragraph(o);
}

function codeBlock(tok) {
  const out = [];
  for (const line of tok.text.split('\n')) {
    out.push(new Paragraph({
      spacing: { before: 0, after: 0, line: 230 },
      indent: { left: 113, right: 113 },
      shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
      children: [new TextRun({ text: line || ' ', font: CODE_FONT, size: 15 })],
    }));
  }
  out.push(spacer(120));
  return out;
}

function listBlock(tok, level, out) {
  const ref = tok.ordered ? 'steps' : 'bullets';
  const inst = ++listInstance;
  for (const item of tok.items) {
    let first = true;
    for (const t of item.tokens) {
      if (t.type === 'list') { listBlock(t, Math.min(level + 1, 1), out); continue; }
      if (t.type === 'text' || t.type === 'paragraph') {
        const children = runs(t.tokens || [{ type: 'text', text: t.text, raw: t.raw }]);
        const opts = first
          ? { numbering: { reference: ref, level, instance: inst }, spacing: { after: 40 } }
          : { indent: { left: 360 * (level + 1) }, spacing: { after: 40 } };
        out.push(new Paragraph({ children, ...opts }));
        first = false;
      } else {
        out.push(...blocks([t], {}));
      }
    }
  }
}

function blocks(tokens, ctx) {
  const out = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case 'heading': {
        const lvl = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.min(tok.depth, 3) - 1];
        // El apartado «Diagrama» se imprime en una hoja apaisada (ver SECCION_APAISADA).
        if (tok.text === 'Diagrama') { W = LAND_W; out.push({ seccion: 'apaisada' }); }
        out.push(new Paragraph({
          heading: lvl,
          children: runs(tok.tokens),
          pageBreakBefore: tok.depth === 1,
        }));
        break;
      }
      case 'paragraph': {
        // Solo imágenes: fila de imágenes.
        if (tok.tokens.some((t) => t.type === 'image') && tok.tokens.every((t) => t.type === 'image' || (t.type === 'text' && !t.text.trim()))) {
          const esDiagrama = tok.tokens.some((t) => t.type === 'image' && (t.text || '').startsWith('Diagrama'));
          if (esDiagrama) W = LAND_W;
          out.push(imageRow(tok.tokens, ctx.dir));
          out.push(spacer(80));
          if (esDiagrama) { W = TEXT_W; out.push({ seccion: 'vertical' }); }
          break;
        }
        // Ficha de cabecera (Fuente / Fecha / Estado): no se muestra en la copia Word (D032).
        const lines = tok.raw.trim().split('\n').map((s) => s.trim()).filter(Boolean);
        let skip = 0;
        while (skip < lines.length && LABEL.test(lines[skip])) skip++;
        if (skip) {
          const rest = lines.slice(skip).join(' ');
          if (rest) out.push(P(runs(marked.Lexer.lexInline(rest)), ctx));
        } else {
          out.push(P(runs(tok.tokens), ctx));
        }
        break;
      }
      case 'list':
        listBlock(tok, 0, out);
        break;
      case 'table':
        out.push(dataTable(tok));
        out.push(spacer());
        break;
      case 'code':
        out.push(...codeBlock(tok));
        break;
      case 'blockquote':
        out.push(...blocks(tok.tokens, { ...ctx, quote: true }));
        break;
      case 'hr':
        out.push(new Paragraph({
          spacing: { before: 100, after: 100 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A6A6A6', space: 1 } },
        }));
        break;
      case 'space':
        break;
      default:
        if (tok.raw && tok.raw.trim()) out.push(P([text(decode(tok.raw.trim()), {})], ctx));
    }
  }
  return out;
}

// ---------- portada, encabezado y pie ----------
function cover() {
  return [
    new Paragraph({ spacing: { before: 2200, after: 120 }, children: [
      new TextRun({ text: 'DOCUMENTO DE ENTREGA', bold: true, size: 20, color: GRAY, characterSpacing: 40 }),
    ] }),
    new Paragraph({ spacing: { after: 160 }, children: [
      new TextRun({ text: 'Entrega documental para SEPSA', bold: true, size: 52, color: NAVY }),
    ] }),
    new Paragraph({
      spacing: { after: 600 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 8 } },
      children: [new TextRun({ text: 'Piloto provisional del sistema de cortes y reconexiones', size: 28, color: '404040' })],
    }),
    kvTable([
      ['Elaborado por', [new TextRun({ text: 'Equipo del piloto', size: 18 })]],
      ['Aprobación de SEPSA', [new TextRun({ text: 'Pendiente de SEPSA', size: 18 })]],
    ], [2800, TEXT_W - 2800]),
    new Paragraph({ spacing: { before: 360, after: 0 }, children: [
      new TextRun({
        text: 'Este documento no es la API oficial de SEPSA. Los puntos que dependen de SEPSA están en la sección 14.',
        italics: true, size: 18, color: '404040',
      }),
    ] }),
  ];
}

function headerDefault(width) {
  return new Header({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: width }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6', space: 4 } },
      children: [
        new TextRun({ text: 'Entrega documental para SEPSA', size: 16, color: GRAY }),
        new TextRun({ children: [new Tab(), 'Piloto provisional'], size: 16, color: GRAY }),
      ],
    })],
  });
}

function footerDefault() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES],
        size: 16, color: GRAY,
      })],
    })],
  });
}

// Parte el cuerpo en secciones: el diagrama va en una hoja apaisada.
function buildSections(children) {
  const margin = { top: 1134, right: 1134, bottom: 1134, left: 1134, header: 567, footer: 567 };
  const make = (kids, landscape, primera) => ({
    properties: {
      titlePage: primera,
      page: {
        size: { width: 11906, height: 16838, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin,
      },
    },
    headers: { default: headerDefault(landscape ? LAND_W : TEXT_W), first: new Header({ children: [new Paragraph({})] }) },
    footers: { default: footerDefault(), first: new Footer({ children: [new Paragraph({})] }) },
    children: kids,
  });
  const sections = [];
  let cur = [];
  let landscape = false;
  for (const c of children) {
    if (c && c.seccion) {
      sections.push(make(cur, landscape, sections.length === 0));
      cur = [];
      landscape = c.seccion === 'apaisada';
      continue;
    }
    cur.push(c);
  }
  sections.push(make(cur, landscape, sections.length === 0));
  return sections;
}

// ---------- documento ----------
function buildDocument() {
  listInstance = 0;
  const body = [...cover()];
  body.push(new Paragraph({
    pageBreakBefore: true,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Contenido', bold: true, size: 30, color: NAVY })],
  }));
  body.push(new TableOfContents('Contenido', { hyperlink: true, headingStyleRange: '1-1' }));
  for (const parte of loadSource()) body.push(...blocks(marked.lexer(parte.md), { dir: parte.dir }));

  return new Document({
    creator: 'Equipo del piloto',
    title: 'Entrega documental para SEPSA',
    subject: 'Piloto provisional del sistema de cortes y reconexiones',
    description: 'Copia Word generada desde docs/entrega-sepsa/ con generador/build-docx.js',
    keywords: 'SEPSA, entrega, piloto, cortes, reconexiones',
    lastModifiedBy: 'Equipo del piloto',
    features: { updateFields: true },
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 20, language: { value: 'es-ES' } },
          paragraph: { spacing: { line: 264, after: 100 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, color: NAVY },
          paragraph: {
            keepNext: true, spacing: { before: 280, after: 160 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } },
            outlineLevel: 0,
          },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, color: NAVY },
          paragraph: { keepNext: true, spacing: { before: 200, after: 90 }, outlineLevel: 1 },
        },
        {
          id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 21, bold: true, color: '333333' },
          paragraph: { keepNext: true, spacing: { before: 140, after: 60 }, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } } },
            { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 260 } } } },
          ],
        },
        {
          reference: 'steps',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 360 } } } },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2)', alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          ],
        },
      ],
    },
    sections: buildSections(body),
  });
}

Packer.toBuffer(buildDocument()).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`escrito: ${OUT} (${buf.length} bytes)`);
});
