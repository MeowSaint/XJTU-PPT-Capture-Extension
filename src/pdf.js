/* Generate single-page PDFs, A4 handout PDFs, and JPEG slide ZIP archives. */
function makePDF(pages, options = {}) {
  return collectExport(pdfParts(pages, options), 'application/pdf');
}

function makeHandoutPDF(pages) {
  return makePDF(pages, {layout: 'handout'});
}

function makeZIP(pages) {
  return collectExport(zipParts(pages), 'application/zip');
}

async function writePDF(pages, {layout = 'single', timestamps = false, bookmarks = false, readImage, write}) {
  await writeExport(pdfParts(pages, {layout, timestamps, bookmarks}), readImage, write);
}

async function writeCoursePDF(lessons, {title, layout = 'single', timestamps = false, readImage, write}) {
  await writeExport(pdfParts([], {layout, timestamps, course: {title, lessons}}), readImage, write);
}

async function writeZIP(pages, {readImage, write}) {
  await writeExport(zipParts(pages), readImage, write);
}

async function writeCourseZIP(lessons, {layout = 'single', timestamps = false, bookmarks = false, readImage, write}) {
  const max = 0xffffffff, entries = [], names = new Set(), suffixes = new Map();
  for (const lesson of lessons) {
    if (!lesson.pages.length) continue;
    if (entries.length === 0xffff) zip32Overflow();
    entries.push({name: lesson.name, pages: lesson.pages});
  }
  for (const entry of entries) {
    let name = String(entry.name ?? 'lesson');
    if (name.length > 0xffff) zip32Overflow();
    name = name.replace(/[\\/<>:"|?*\u0000-\u001f\u007f]/g, '_').replace(/[ .]+$/g, '') || 'lesson';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    entry.name = name;
    names.add(name);
  }
  const enc = new TextEncoder();
  let directoryLength = 0, localLength = 0;
  for (const entry of entries) {
    const name = entry.name;
    let suffix = suffixes.get(name);
    if (suffix) {
      do { entry.name = `${name.slice(0, -4)} (${suffix++})${name.slice(-4)}`; } while (names.has(entry.name));
      names.add(entry.name);
    }
    suffixes.set(name, suffix || 2);
    if (entry.name.length > 0xffff) zip32Overflow();
    const size = enc.encode(entry.name).length;
    if (size > 0xffff) zip32Overflow();
    directoryLength += 46 + size;
    localLength += 30 + size + 16;
    if (localLength + directoryLength + 22 > max) zip32Overflow();
  }
  const directory = [], crcTable = Uint32Array.from({length: 256}, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
  });
  let length = 0, reserved = localLength + directoryLength + 22;
  async function put(bytes) {
    if (length + bytes.length + reserved > max) zip32Overflow();
    await write(bytes);
    length += bytes.length;
  }
  for (const entry of entries) {
    const name = enc.encode(entry.name), offset = length;
    const local = new Uint8Array(30 + name.length), localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0808, true); // Data descriptor and UTF-8 filename.
    localView.setUint16(12, 33, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    reserved -= local.length;
    await put(local);
    let size = 0, crc = 0xffffffff;
    await writeExport(pdfParts(entry.pages, {layout, timestamps, bookmarks}), readImage, async bytes => {
      if (size + bytes.length > max || length + bytes.length + reserved > max) zip32Overflow();
      for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
      size += bytes.length;
      await put(bytes);
    });
    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = new Uint8Array(16), descriptorView = new DataView(descriptor.buffer);
    descriptorView.setUint32(0, 0x08074b50, true);
    descriptorView.setUint32(4, crc, true);
    descriptorView.setUint32(8, size, true);
    descriptorView.setUint32(12, size, true);
    reserved -= descriptor.length;
    await put(descriptor);
    const central = new Uint8Array(46 + name.length), centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0808, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    directory.push(central);
  }
  const start = length;
  for (const central of directory) {
    reserved -= central.length;
    await put(central);
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, directoryLength, true);
  view.setUint32(16, start, true);
  reserved -= end.length;
  await put(end);
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

function pdfTime(sourceTime) {
  if (!Number.isFinite(sourceTime) || sourceTime < 0) return '';
  const seconds = BigInt(Math.floor(sourceTime));
  return [seconds / 3600n, seconds / 60n % 60n, seconds % 60n].map(n => String(n).padStart(2, '0')).join(':');
}

// PDF outline strings use UTF-16BE; replace historical titles truncated inside a surrogate pair.
function pdfUnicode(value) {
  let hex = 'FEFF';
  for (let char of String(value)) {
    const code = char.charCodeAt(0);
    if (char.length === 1 && code >= 0xd800 && code <= 0xdfff) char = '\ufffd';
    for (let i = 0; i < char.length; i++) hex += char.charCodeAt(i).toString(16).padStart(4, '0');
  }
  return `<${hex}>`;
}

function* pdfParts(pages, {layout, timestamps = false, bookmarks = false, course} = {}) {
  const enc = new TextEncoder(), offsets = [0], handout = layout === 'handout';
  const hasFont = handout || timestamps === true;
  let length = 0, next = hasFont ? 4 : 3;
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
  const sheets = [], groups = [];
  let slideNumber = 0;
  // Course lessons start on a new physical sheet, even after an odd handout row.
  for (const lesson of course ? course.lessons : [{pages}]) {
    const positions = [];
    for (let i = 0; i < lesson.pages.length; i += perSheet) {
      const slides = lesson.pages.slice(i, i + perSheet), n = next++;
      const sheet = {n, slides, images: slides.map(() => next++), content: next++, firstNumber: slideNumber + 1};
      sheets.push(sheet);
      for (const [row, page] of slides.entries()) {
        const time = pdfTime(page.sourceTime), top = handout ? row ? 364 : 758 : 842 * page.h / page.w + (timestamps === true && time ? 28 : 0);
        if (course) positions.push({title: `第 ${i + row + 1} 页${time ? ' · ' + time : ''}`, dest: `[${n} 0 R /XYZ 0 ${top} null]`});
        slideNumber++;
      }
    }
    if (course && positions.length) groups.push({title: lesson.title, children: positions, dest: positions[0].dest, count: positions.length});
  }
  const outline = (course || bookmarks === true) && sheets.length ? next++ : null;
  const items = outline && !course ? pages.map(() => next++) : [];
  const courseItem = outline && course ? {n: next++, title: course.title || '未命名课程', children: groups,
    dest: groups[0].dest, count: groups.length + slideNumber} : null;
  if (courseItem) for (const group of groups) {
    group.n = next++;
    for (const position of group.children) position.n = next++;
  }
  yield* put('%PDF-1.4\n');
  yield* obj(1, `<< /Type /Catalog /Pages 2 0 R${outline ? ` /Outlines ${outline} 0 R${course ? ' /PageMode /UseOutlines' : ''}` : ''} >>`);
  yield* obj(2, `<< /Type /Pages /Count ${sheets.length} /Kids [${sheets.map(sheet => `${sheet.n} 0 R`).join(' ')}] >>`);
  if (hasFont) yield* obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const [i, sheet] of sheets.entries()) {
    const footer = !handout && timestamps === true && pdfTime(sheet.slides[0].sourceTime) ? 28 : 0;
    const w = handout ? 595 : 842, h = handout ? 842 : 842 * sheet.slides[0].h / sheet.slides[0].w + footer;
    const font = hasFont ? '/Font << /F1 3 0 R >> ' : '';
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
        const time = timestamps === true ? pdfTime(p.sourceTime) : '';
        commands += `BT /F1 10 Tf 40 ${bottom - 22} Td (${course ? sheet.firstNumber + row : i * 2 + row + 1}${time ? ' - ' + time : ''}) Tj ET\n`;
      } else {
        commands = `q ${w} 0 0 ${h - footer} 0 ${footer} cm /Im0 Do Q\n`;
        if (footer) commands += `BT /F1 10 Tf 24 10 Td (${pdfTime(p.sourceTime)}) Tj ET\n`;
      }
    }
    if (handout) commands += `BT /F1 10 Tf 280 24 Td (${i + 1} / ${sheets.length}) Tj ET\n`;
    yield* obj(sheet.content, `<< /Length ${enc.encode(commands).length} >>\nstream\n${commands}endstream`);
  }
  if (courseItem) {
    function* nodes(children, parent) {
      for (const [i, node] of children.entries()) {
        const links = `${i ? ` /Prev ${children[i - 1].n} 0 R` : ''}${i + 1 < children.length ? ` /Next ${children[i + 1].n} 0 R` : ''}`;
        const nested = node.children ? ` /First ${node.children[0].n} 0 R /Last ${node.children.at(-1).n} 0 R /Count ${node.count}` : '';
        yield* obj(node.n, `<< /Title ${pdfUnicode(node.title)} /Parent ${parent} 0 R${links}${nested} /Dest ${node.dest} >>`);
        if (node.children) yield* nodes(node.children, node.n);
      }
    }
    yield* obj(outline, `<< /Type /Outlines /First ${courseItem.n} 0 R /Last ${courseItem.n} 0 R /Count ${courseItem.count + 1} >>`);
    yield* nodes([courseItem], outline);
  } else if (outline) {
    yield* obj(outline, `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items.at(-1)} 0 R /Count ${items.length} >>`);
    for (const [i, n] of items.entries()) {
      const p = pages[i], time = pdfTime(p.sourceTime), sheet = sheets[Math.floor(i / perSheet)];
      const top = handout ? (i % 2 === 0 ? 758 : 364) : 842 * p.h / p.w + (timestamps === true && time ? 28 : 0);
      yield* obj(n, `<< /Title (Page ${i + 1}${time ? ' - ' + time : ''}) /Parent ${outline} 0 R${i ? ` /Prev ${items[i - 1]} 0 R` : ''}${i + 1 < items.length ? ` /Next ${items[i + 1]} 0 R` : ''} /Dest [${sheet.n} 0 R /XYZ 0 ${top} null] >>`);
    }
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
