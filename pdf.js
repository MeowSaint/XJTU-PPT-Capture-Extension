/* Standalone JPEG PDF and ZIP writers; no remote dependencies. */
function makePDF(pages, options = {}){
 if(options.layout === 'handout') return makeHandoutPDF(pages);
 const enc=new TextEncoder(),chunks=[],offsets=[0];let length=0;
 const put=x=>{const b=typeof x==='string'?enc.encode(x):x;chunks.push(b);length+=b.length;};
 const obj=(n,body)=>{offsets[n]=length;put(`${n} 0 obj\n`);put(body);put('\nendobj\n');};
 put('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 pages.forEach((p,i)=>{const n=3+i*3,w=842,h=842*p.h/p.w;
 obj(n,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n+1} 0 R >> >> /Contents ${n+2} 0 R >>`);
 const raw=atob(p.data.split(',')[1]),b=Uint8Array.from(raw,c=>c.charCodeAt(0));
 offsets[n+1]=length;put(`${n+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.length} >>\nstream\n`);put(b);put('\nendstream\nendobj\n');
 const s=`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;obj(n+2,`<< /Length ${enc.encode(s).length} >>\nstream\n${s}endstream`);
 });const start=length,total=3+pages.length*3;put(`xref\n0 ${total}\n0000000000 65535 f \n`);for(let n=1;n<total;n++)put(`${String(offsets[n]).padStart(10,'0')} 00000 n \n`);put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);return new Blob(chunks,{type:'application/pdf'});
}

function makeHandoutPDF(pages) {
  const enc = new TextEncoder(), chunks = [], offsets = [0];
  let length = 0, next = 4;
  const put = value => {
    const bytes = typeof value === 'string' ? enc.encode(value) : value;
    chunks.push(bytes); length += bytes.length;
  };
  const obj = (n, body) => { offsets[n] = length; put(`${n} 0 obj\n`); put(body); put('\nendobj\n'); };
  const sheets = Array.from({length: Math.ceil(pages.length / 2)}, (_, i) => {
    const slides = pages.slice(i * 2, i * 2 + 2), n = next++;
    return {n, slides, images: slides.map(() => next++), content: next++};
  });
  put('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${sheets.length} /Kids [${sheets.map(sheet => `${sheet.n} 0 R`).join(' ')}] >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  sheets.forEach((sheet, i) => {
    obj(sheet.n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> /XObject << ${sheet.images.map((n, row) => `/Im${row} ${n} 0 R`).join(' ')} >> >> /Contents ${sheet.content} 0 R >>`);
    let commands = '';
    sheet.slides.forEach((p, row) => {
      const raw = atob(p.data.split(',')[1]), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      const n = sheet.images[row];
      offsets[n] = length;
      put(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
      put(bytes); put('\nendstream\nendobj\n');
      const scale = Math.min(310 / p.w, 210 / p.h), w = p.w * scale, h = p.h * scale;
      const bottom = row === 0 ? 526 : 132, x = 40 + (310 - w) / 2, y = bottom + (210 - h) / 2;
      commands += `q ${w} 0 0 ${h} ${x} ${y} cm /Im${row} Do Q\n0.75 G 0.5 w\n`;
      for (let line = 0; line < 8; line++) {
        const y = bottom + 196 - line * 28;
        commands += `360 ${y} m 555 ${y} l S\n`;
      }
      commands += `BT /F1 10 Tf 40 ${bottom - 22} Td (${i * 2 + row + 1}) Tj ET\n`;
    });
    commands += `BT /F1 10 Tf 280 24 Td (${i + 1} / ${sheets.length}) Tj ET\n`;
    obj(sheet.content, `<< /Length ${enc.encode(commands).length} >>\nstream\n${commands}endstream`);
  });
  const start = length;
  put(`xref\n0 ${next}\n0000000000 65535 f \n`);
  for (let n = 1; n < next; n++) put(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
  return new Blob(chunks, {type: 'application/pdf'});
}

function makeZIP(pages) {
  const max = 0xffffffff;
  const overflow = () => { throw new RangeError('ZIP32 limit exceeded'); };
  if (pages.length > 0xffff) overflow();
  const enc = new TextEncoder(), chunks = [], directory = [];
  const crcTable = Uint32Array.from({length: 256}, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    return value >>> 0;
  });
  let length = 0, directoryLength = 0;
  pages.forEach((page, i) => {
    const time = Number.isFinite(page.sourceTime) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(page.sourceTime))) : 0;
    const clock = [Math.floor(time / 3600), Math.floor(time / 60) % 60, time % 60].map(n => String(n).padStart(2, '0')).join('-');
    const name = enc.encode(`${String(i + 1).padStart(3, '0')}-${clock}.jpg`);
    const raw = atob(page.data.split(',')[1]);
    const localLength = 30 + name.length + raw.length;
    directoryLength += 46 + name.length;
    if (raw.length > max || length + localLength + directoryLength + 22 > max) overflow();
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
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
    chunks.push(local, bytes); directory.push(central);
    length += localLength;
  });
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, pages.length, true);
  view.setUint16(10, pages.length, true);
  view.setUint32(12, directoryLength, true);
  view.setUint32(16, length, true);
  return new Blob([...chunks, ...directory, end], {type: 'application/zip'});
}
