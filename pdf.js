/* Generate single-page PDFs, A4 handout PDFs, and JPEG slide ZIP archives. */
function makePDF(pages, options = {}) {
  return collectExport(pdfParts(pages, options.layout), 'application/pdf');
}

function makeHandoutPDF(pages) {
  return makePDF(pages, {layout: 'handout'});
}

function makeZIP(pages) {
  return collectExport(zipParts(pages), 'application/zip');
}

async function writePDF(pages, {layout = 'single', readImage, write}) {
  await writeExport(pdfParts(pages, layout), readImage, write);
}

async function writeZIP(pages, {readImage, write}) {
  await writeExport(zipParts(pages), readImage, write);
}

// Parts are byte chunks or requests for one image; neither generator caches JPEGs.
function collectExport(parts, type) {
  const chunks = [];
  for (let step = parts.next(); !step.done;) {
    if (step.value instanceof Uint8Array) {
      chunks.push(step.value);
      step = parts.next();
    } else {
      const {page, maxLength = Infinity} = step.value;
      const raw = atob(page.data.split(',')[1]);
      if (raw.length > maxLength) zip32Overflow();
      step = parts.next(Uint8Array.from(raw, c => c.charCodeAt(0)));
    }
  }
  return new Blob(chunks, {type});
}

async function writeExport(parts, readImage, write) {
  try {
    for (let step = parts.next(); !step.done;) {
      if (step.value instanceof Uint8Array) {
        await write(step.value);
        step = parts.next();
      } else {
        step = parts.next(await readImage(step.value.page));
      }
    }
  } finally {
    parts.return();
  }
}

function* pdfParts(pages, layout) {
  const enc = new TextEncoder(), offsets = [0], handout = layout === 'handout';
  let length = 0, next = handout ? 4 : 3;
  function* put(value) {
    const bytes = typeof value === 'string' ? enc.encode(value) : value;
    length += bytes.length;
    yield bytes;
  }
  function* obj(n, body) {
    offsets[n] = length;
    yield* put(`${n} 0 obj\n`); yield* put(body); yield* put('\nendobj\n');
  }
  const perSheet = handout ? 2 : 1;
  const sheets = Array.from({length: Math.ceil(pages.length / perSheet)}, (_, i) => {
    const slides = pages.slice(i * perSheet, (i + 1) * perSheet), n = next++;
    return {n, slides, images: slides.map(() => next++), content: next++};
  });
  yield* put('%PDF-1.4\n');
  yield* obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  yield* obj(2, `<< /Type /Pages /Count ${sheets.length} /Kids [${sheets.map(sheet => `${sheet.n} 0 R`).join(' ')}] >>`);
  if (handout) yield* obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const [i, sheet] of sheets.entries()) {
    const w = handout ? 595 : 842, h = handout ? 842 : 842 * sheet.slides[0].h / sheet.slides[0].w;
    const font = handout ? '/Font << /F1 3 0 R >> ' : '';
    yield* obj(sheet.n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << ${font}/XObject << ${sheet.images.map((n, row) => `/Im${row} ${n} 0 R`).join(' ')} >> >> /Contents ${sheet.content} 0 R >>`);
    let commands = '';
    for (const [row, p] of sheet.slides.entries()) {
      let bytes = yield {page: p};
      const n = sheet.images[row];
      offsets[n] = length;
      yield* put(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
      yield* put(bytes); bytes = null;
      yield* put('\nendstream\nendobj\n');
      if (handout) {
        const scale = Math.min(310 / p.w, 210 / p.h), w = p.w * scale, h = p.h * scale;
        const bottom = row === 0 ? 526 : 132, x = 40 + (310 - w) / 2, y = bottom + (210 - h) / 2;
        commands += `q ${w} 0 0 ${h} ${x} ${y} cm /Im${row} Do Q\n0.75 G 0.5 w\n`;
        for (let line = 0; line < 8; line++) {
          const y = bottom + 196 - line * 28;
          commands += `360 ${y} m 555 ${y} l S\n`;
        }
        commands += `BT /F1 10 Tf 40 ${bottom - 22} Td (${i * 2 + row + 1}) Tj ET\n`;
      } else {
        commands = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;
      }
    }
    if (handout) commands += `BT /F1 10 Tf 280 24 Td (${i + 1} / ${sheets.length}) Tj ET\n`;
    yield* obj(sheet.content, `<< /Length ${enc.encode(commands).length} >>\nstream\n${commands}endstream`);
  }
  const start = length;
  yield* put(`xref\n0 ${next}\n0000000000 65535 f \n`);
  for (let n = 1; n < next; n++) yield* put(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  yield* put(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
}

function zip32Overflow() {
  throw new RangeError('ZIP32 limit exceeded');
}

function* zipParts(pages) {
  const max = 0xffffffff;
  if (pages.length > 0xffff) zip32Overflow();
  const enc = new TextEncoder(), directory = [];
  const crcTable = Uint32Array.from({length: 256}, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
  });
  let length = 0, directoryLength = 0;
  for (const [i, page] of pages.entries()) {
    const time = Number.isFinite(page.sourceTime) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(page.sourceTime))) : 0;
    const clock = [Math.floor(time / 3600), Math.floor(time / 60) % 60, time % 60].map(n => String(n).padStart(2, '0')).join('-');
    const name = enc.encode(`${String(i + 1).padStart(3, '0')}-${clock}.jpg`);
    directoryLength += 46 + name.length;
    let bytes = yield {page, maxLength: max - length - (30 + name.length) - directoryLength - 22};
    const localLength = 30 + name.length + bytes.length;
    if (bytes.length > max || length + localLength + directoryLength + 22 > max) zip32Overflow();
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length), localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(12, 33, true); // Deterministic DOS date: 1980-01-01.
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length), centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, length, true);
    central.set(name, 46);
    yield local; yield bytes; bytes = null;
    directory.push(central);
    length += localLength;
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, pages.length, true);
  view.setUint16(10, pages.length, true);
  view.setUint32(12, directoryLength, true);
  view.setUint32(16, length, true);
  yield* directory;
  yield end;
}
