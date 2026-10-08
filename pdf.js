/* Standalone JPEG PDF writer; no remote dependencies. */
function makePDF(pages){
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
