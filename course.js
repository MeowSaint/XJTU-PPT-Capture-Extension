/* Course metadata only: never retain API bodies, credentials or student details. */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const cleanName = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().replace(/[（(]\d{6,}[A-Za-z\d_-]*[）)]$/, '').trim().slice(0, 120) : '';
  function datePart(value) {
    if (typeof value !== 'string') return '';
    const match = value.match(/\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|\b)/);
    if (!match) return '';
    const [, y, m, d] = match, date = new Date(Date.UTC(+y, +m - 1, +d));
    return date.getUTCFullYear() === +y && date.getUTCMonth() === +m - 1 && date.getUTCDate() === +d ? `${y}-${pad(m)}-${pad(d)}` : '';
  }
  function timePart(value) {
    if (typeof value !== 'string') return '';
    const match = value.match(/(?:^|[T\s日])([01]?\d|2[0-3])[:：]([0-5]\d)(?:[:：]([0-5]\d))?(?![\d:：])/);
    return match ? `${pad(match[1])}:${match[2]}:${match[3] || '00'}` : '';
  }
  function startParts(value) {
    // Epoch / zoned timestamps are displayed in the course site's China timezone.
    // Naive wall-clock strings are NOT converted through the computer's timezone.
    let date;
    if (typeof value === 'number' || typeof value === 'string' && /^\d{10}(?:\d{3})?$/.test(value)) {
      const n = Number(value); date = new Date(n < 1e12 ? n * 1000 : n);
    } else if (typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) date = new Date(value);
    if (date) {
      if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2099) return {};
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(date).map(p => [p.type, p.value]));
      return {date: `${parts.year}-${parts.month}-${parts.day}`, start: `${parts.hour}:${parts.minute}:${parts.second}`};
    }
    return {date: datePart(value), start: timePart(value)};
  }
  function normalize(value) {
    if (!value || typeof value !== 'object') return {};
    const result = {}, name = cleanName(value.name), date = datePart(value.date), start = timePart(value.start);
    if (name) result.name = name;
    if (date) result.date = date;
    if (start) result.start = start;
    return result;
  }
  function filename(value) {
    const info = normalize(value);
    if (!info.name || !info.date || !info.start) return '';
    const name = info.name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100);
    return `${name || '课程PPT'}-${info.date}-${info.start.replace(/:/g, '-')}.pdf`;
  }
  function pageIds(page) {
    const path = String(page || '');
    return {course: path.match(/\/my-capture-courses\/([^/]+)/)?.[1], capture: path.match(/\/preview-detail\/([^/?#]+)/)?.[1]};
  }
  function fromJSON(value, page) {
    const ids = pageIds(page), candidates = []; let visited = 0;
    const keyOf = key => key.replace(/[_-]/g, '').toLowerCase();
    function walk(object, scope = '', depth = 0, score = 0) {
      if (!object || typeof object !== 'object' || depth > 10 || visited++ > 2000) return;
      if (Array.isArray(object)) { object.slice(0, 200).forEach(x => walk(x, scope, depth + 1, score)); return; }
      const fields = Object.fromEntries(Object.entries(object).slice(0, 100).map(([k, v]) => [keyOf(k), v]));
      const checks = [[ids.course, fields.courseid], [ids.capture, fields.captureid ?? fields.recordid ?? fields.lessonid]];
      if (/capture|record|lesson/.test(scope) && fields.id != null) checks.push([ids.capture, fields.id]);
      if (/^course(?:info|detail)?$/.test(scope) && fields.id != null) checks.push([ids.course, fields.id]);
      for (const [expected, actual] of checks) {
        if (expected && actual != null && String(actual) !== expected) return;
        if (expected && actual != null) score += 10;
      }
      const info = {};
      for (const key of ['coursename', 'coursetitle', 'teachingcoursename', 'subjectname', '课程名称']) {
        if (cleanName(fields[key])) { info.name = cleanName(fields[key]); break; }
      }
      if (!info.name && /course|subject|课程/.test(scope)) info.name = cleanName(fields.name || fields.title);
      for (const key of ['starttime', 'begintime', 'classstarttime', 'lessonstarttime', 'capturestarttime', 'recordstarttime', 'teachingstarttime', 'startdatetime', 'begindatetime', '上课时间', '开始时间']) {
        const parts = startParts(fields[key]);
        if (parts.date || parts.start) { Object.assign(info, parts); break; }
      }
      if (!info.date) for (const key of ['coursedate', 'classdate', 'lessondate', 'capturedate', 'recorddate', 'teachingdate', 'teachdate', 'date', '上课日期']) {
        if (key === 'date' && !info.name && !info.start && !/course|class|lesson|capture|record|teaching/.test(scope)) continue;
        const date = datePart(fields[key]); if (date) { info.date = date; break; }
      }
      const normalized = normalize(info);
      if (Object.keys(normalized).length) candidates.push({info: normalized, score});
      for (const [key, child] of Object.entries(object).slice(0, 100)) if (child && typeof child === 'object') walk(child, keyOf(key), depth + 1, score);
    }
    walk(value);
    const result = {};
    // Multiple lessons / calendar rows without a matching ID are ambiguous.
    // Never silently pick the first lesson's date or mix unrelated starts.
    for (const key of ['name', 'date', 'start']) {
      const choices = candidates.filter(x => x.info[key]);
      const highest = Math.max(...choices.map(x => x.score));
      const values = [...new Set(choices.filter(x => x.score === highest).map(x => x.info[key]))];
      if (values.length === 1) result[key] = values[0];
    }
    return result;
  }
  function fromText(text, title = '', heading = '') {
    text = String(text || '').slice(0, 30000);
    const info = {}, name = text.match(/(?:课程名称|课程名|授课名称)\s*[:：]\s*([^\n\r]+)/)?.[1];
    const candidate = cleanName(name || heading || title.replace(/\s*[-_|—]\s*(?:资源管理平台|课程录播.*|西安交通大学.*)$/, ''));
    if (candidate && !/^(?:资源管理平台|课程录播|课程详情|课程预览|录播预览|登录|西安交通大学)$/.test(candidate)) info.name = candidate;
    const labelled = text.match(/(?:上课时间|授课时间|课程时间|录制时间|开始时间|开课时间)\s*[:：]?\s*([^\n\r]+(?:\n[^\n\r]+)?)/)?.[1];
    const dates = [...text.matchAll(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?[T\s]+(?:(?:周|星期|礼拜)[一二三四五六日天1-7]\s+)?(?:[01]?\d|2[0-3])[:：][0-5]\d(?:[:：][0-5]\d)?/g)].map(m => m[0]);
    const parts = startParts(labelled || (dates.length === 1 ? dates[0] : ''));
    Object.assign(info, parts);
    if (!info.date) info.date = datePart(text.match(/(?:上课日期|课程日期|授课日期)\s*[:：]?\s*([^\n\r]+)/)?.[1]);
    return normalize(info);
  }
  function fromDocument(doc) {
    const specific = doc.querySelector('[data-course-name], .course-name, .course-title, .courseName, [class*="course-name"], [class*="course-title"]');
    const heading = specific?.getAttribute('data-course-name') || specific?.textContent || doc.querySelector('h1')?.textContent || '';
    const titleName = fromText('', doc.title || '').name;
    return fromText(doc.body?.innerText || '', doc.title || '', titleName || heading);
  }
  const api = {normalize, startParts, filename, fromJSON, fromText, fromDocument};
  root.PPTCourse = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
