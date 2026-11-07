/* Parse course name, date, and start time for export filenames. */
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
  function forBinding(detected, displayed, {manual = false, sameSource = false} = {}) {
    return normalize(manual && sameSource ? displayed : detected);
  }
  function pageIds(page) {
    const path = String(page || '');
    let query;
    try { query = new URL(path).searchParams; } catch { query = new URLSearchParams(); }
    return {course: path.match(/\/(?:my|study)-capture-courses\/([^/?#]+)/)?.[1] || query.get('courseId') || query.get('course_id'),
      capture: path.match(/\/preview-detail\/([^/?#]+)/)?.[1] || query.get('captureCode') || query.get('capture_code') || query.get('captureId') || query.get('capture_id')};
  }
  function fromJSON(value, page) {
    const ids = pageIds(page), candidates = []; let visited = 0;
    const keyOf = key => key.replace(/[_-]/g, '').toLowerCase();
    function walk(object, scope = '', depth = 0, score = 0, entity = '') {
      if (!object || typeof object !== 'object' || depth > 10 || visited++ > 2000) return;
      if (Array.isArray(object)) { object.slice(0, 200).forEach(x => walk(x, scope, depth + 1, score, entity)); return; }
      const fields = Object.fromEntries(Object.entries(object).slice(0, 100).map(([k, v]) => [keyOf(k), v]));
      // Preserve an entity through data/details envelopes, but reset it on a nested course.
      const recordScope = /^(?:captures?|records?|recordings?|lessons?|schedules?|classes|class|teaching)(?:info|detail)?$/.test(scope);
      const courseScope = /^(?:course|subject)(?:info|detail)?$/.test(scope);
      if (recordScope) entity = 'record';
      if (courseScope) entity = 'course';
      const captureId = fields.capturecode ?? fields.captureid ?? fields.recordid ?? fields.lessonid;
      const checks = [[ids.course, fields.courseid], [ids.capture, captureId]];
      const entityDetails = recordScope || courseScope || /^(?:data|result|info|details?|payload)$/.test(scope);
      if (entityDetails && entity === 'record' && captureId == null && (fields.code != null || fields.id != null)) checks.push([ids.capture, fields.code ?? fields.id]);
      if (entityDetails && entity === 'course' && fields.id != null) checks.push([ids.course, fields.id]);
      for (const [expected, actual] of checks) {
        if (expected && actual != null && String(actual) !== expected) return;
        if (expected && actual != null) score += 10;
      }
      if (captureId != null) entity = 'record';
      const info = {};
      for (const key of ['coursename', 'coursetitle', 'teachingcoursename', 'subjectname', '课程名称']) {
        if (cleanName(fields[key])) { info.name = cleanName(fields[key]); break; }
      }
      if (!info.name && entityDetails && entity === 'course') info.name = cleanName(fields.name || fields.title);
      const starts = ['classstarttime', 'lessonstarttime', 'capturestarttime', 'recordstarttime', 'teachingstarttime', '上课时间', '授课时间', '录制时间'];
      if (entity === 'record') starts.push('starttime', 'begintime', 'startdatetime', 'begindatetime', '开始时间');
      for (const key of starts) {
        const parts = startParts(fields[key]);
        if (parts.date || parts.start) { Object.assign(info, parts); break; }
      }
      const dates = ['classdate', 'lessondate', 'capturedate', 'recorddate', 'teachingdate', 'teachdate', '上课日期'];
      if (entity === 'record') dates.push('date');
      if (!info.date) for (const key of dates) {
        const date = datePart(fields[key]); if (date) { info.date = date; break; }
      }
      const normalized = normalize(info);
      if (Object.keys(normalized).length) candidates.push({info: normalized, score});
      for (const [key, child] of Object.entries(object).slice(0, 100)) if (child && typeof child === 'object') walk(child, keyOf(key), depth + 1, score, entity);
    }
    walk(value);
    const result = {}, names = candidates.filter(x => x.info.name);
    const highestName = Math.max(...names.map(x => x.score));
    const namesAtScore = [...new Set(names.filter(x => x.score === highestName).map(x => x.info.name))];
    if (namesAtScore.length === 1) result.name = namesAtScore[0];
    // Treat date/time as one observation: ambiguous lessons cannot leak a shared clock time.
    const times = candidates.filter(x => x.info.date || x.info.start), highestTime = Math.max(...times.map(x => x.score));
    const observations = times.filter(x => x.score === highestTime);
    const values = [...new Set(observations.map(x => JSON.stringify([x.info.date || '', x.info.start || ''])))];
    if (values.length === 1) Object.assign(result, normalize({date: observations[0].info.date, start: observations[0].info.start}));
    return result;
  }
  function fromText(text, title = '', heading = '') {
    text = String(text || '').slice(0, 30000);
    const info = {}, name = text.match(/(?:课程名称|课程名|授课名称)\s*[:：]\s*([^\n\r]+)/)?.[1];
    const candidate = cleanName(name || heading || title.replace(/\s*[-_|—]\s*(?:资源管理平台|课程录播.*|西安交通大学.*)$/, ''));
    if (candidate && !/^(?:资源管理平台|课程录播|课程详情|课程预览|录播预览|登录|西安交通大学)$/.test(candidate)) info.name = candidate;
    // Opening dates must also be removed from the unlabelled unique-date fallback.
    const lessonText = text.replace(/(?:开课时间|开课日期|课程开始时间|课程开始日期|课程日期|课程时间)\s*[:：]?\s*20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?(?:[T\s]+(?:(?:周|星期|礼拜)[一二三四五六日天1-7]\s+)?(?:[01]?\d|2[0-3])[:：][0-5]\d(?:[:：][0-5]\d)?)?/g, '');
    const labelled = lessonText.match(/(?:上课时间|授课时间|录制时间|排课时间)\s*[:：]?\s*([^\n\r]+(?:\n[^\n\r]+)?)/)?.[1];
    const dates = [...lessonText.matchAll(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?[T\s]+(?:(?:周|星期|礼拜)[一二三四五六日天1-7]\s+)?(?:[01]?\d|2[0-3])[:：][0-5]\d(?:[:：][0-5]\d)?/g)].map(m => m[0]);
    const parts = startParts(labelled || (dates.length === 1 ? dates[0] : ''));
    Object.assign(info, parts);
    if (!info.date) info.date = datePart(lessonText.match(/(?:上课日期|授课日期|录制日期|排课日期)\s*[:：]?\s*([^\n\r]+)/)?.[1]);
    return normalize(info);
  }
  function fromDocument(doc) {
    const specific = doc.querySelector('[data-course-name], .course-name, .course-title, .courseName, [class*="course-name"], [class*="course-title"]');
    const heading = specific?.getAttribute('data-course-name') || specific?.textContent || doc.querySelector('h1')?.textContent || '';
    return fromText(doc.body?.innerText || '', doc.title || '', fromText('', '', heading).name || '');
  }
  const api = {normalize, forBinding, startParts, filename, fromJSON, fromText, fromDocument};
  root.PPTCourse = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
