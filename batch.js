/* Course-list batch discovery helpers shared by content and tool pages. */
(function (root) {
  'use strict';
  function courseId(page) {
    try {
      const url = new URL(page);
      return (url.pathname + url.hash).match(/\/(?:my|study)-capture-courses\/([^/?#]+)\/preview-detail(?:\/([^/?#]+))?/)?.[1]
        || url.searchParams.get('courseId')
        || url.searchParams.get('course_id')
        || '';
    } catch { return ''; }
  }
  function payload(value) { return value?.data?.data ?? value?.data ?? value; }
  function schedules(value) {
    const rows = payload(value);
    return (Array.isArray(rows) ? rows : rows?.results || rows?.items || []).filter(row => row && typeof row === 'object');
  }
  function dateTime(value) {
    return root.PPTCourse?.startParts(value) || {};
  }
  function videoList(value) {
    const detail = payload(value) || {};
    return detail.lesson_videos || detail.lessonVideos || detail.videos || detail.record?.videos || [];
  }
  function videoName(video) { return String(video.file_key || video.fileKey || video.download_url || video.downloadUrl || ''); }
  function videoURL(video) { return video.download_url || video.downloadUrl || video.play_url || video.playUrl || ''; }
  function selectVideo(value) {
    const videos = videoList(value).filter(video => video && typeof video === 'object');
    return videos.find(video => String(video.label || '').toUpperCase() === 'ENCODER' && /(?:^|\/)2-[^/]+\.mp4(?:$|\?)/i.test(videoName(video)))
      || videos.find(video => /(?:^|\/)2-[^/]+\.mp4(?:$|\?)/i.test(videoName(video)))
      || videos.find(video => String(video.label || '').toUpperCase() === 'ENCODER' && !/(?:^|\/)0-[^/]+\.mp4(?:$|\?)/i.test(videoName(video)))
      || null;
  }
  function fallbackVideos(value) {
    return videoList(value).filter(video => video && typeof video === 'object'
      && /^https?:\/\//i.test(videoURL(video))
      && /(?:^|\/)0-[^/]+\.mp4(?:$|\?)/i.test(videoName(video)));
  }
  function option(video) {
    const url = videoURL(video);
    return {url, sourceName: String(video.file_key || video.fileKey || new URL(url).pathname.split('/').pop() || '0.mp4'), label: String(video.label || ''), size: Number(video.size) || 0};
  }
  function job(schedule, capture, fallbackCourseName = '') {
    let video = selectVideo(capture), requiresCrop = false, options = [];
    let url = video && videoURL(video);
    if (!video || !/^https?:\/\//i.test(url)) {
      options = fallbackVideos(capture).map(option);
      if (!options.length) return null;
      requiresCrop = true; video = null; ({url} = options[0]);
    }
    const captureCode = schedule.capture_code || schedule.captureCode || payload(capture)?.code || '';
    const started = schedule.start_time || schedule.startTime || '', parts = dateTime(started);
    const course = schedule.course || {}, name = course.name || schedule.name || fallbackCourseName || '课程PPT';
    return {
      id: String(captureCode || schedule.id), scheduleId: String(schedule.id || ''), captureCode: String(captureCode),
      url, sourceName: requiresCrop ? options[0].sourceName : String(video.file_key || video.fileKey || new URL(url).pathname.split('/').pop() || '2.mp4'),
      course: {name, date: parts.date, start: parts.start}, startTime: started,
      label: requiresCrop ? options[0].label : String(video.label || ''), size: requiresCrop ? options[0].size : Number(video.size) || 0,
      options, requiresCrop, cropConfirmed: false, selected: !requiresCrop, state: requiresCrop ? 'needs-crop' : 'pending'
    };
  }
  function eligible(schedule) {
    const status = String(schedule?.status || '').toUpperCase();
    return !!(schedule?.capture_code || schedule?.captureCode) && !['UPCOMING', 'TRANSCODING', 'LIVE', 'CANCELLED'].includes(status);
  }
  function trackKey(source) {
    return root.PPTLibrary.key({sourceKey: source?.sourceKey || (source?.url ? 'url:' + source.url : ''), sourceName: source?.sourceName});
  }
  function zeroTrack(source) { return /(?:^|\/)0-[^/]+\.mp4(?:$|\?)/i.test(source?.sourceName || ''); }
  function validCrop(rect) {
    return !!rect && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(rect[key])) && rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= 1 && rect.y + rect.h <= 1;
  }
  function cropMatches(override, source, aspect) {
    return validCrop(override?.crop) && Number.isFinite(override.aspect) && override.aspect > 0 && Number.isFinite(aspect) && aspect > 0 && zeroTrack(source)
      && override.track === trackKey(source) && Math.abs(aspect / override.aspect - 1) <= .01 + Number.EPSILON;
  }
  function automatic(job) { return !job.requiresCrop || !!(job.cropConfirmed && job.cropOverride && !job.cropRejected); }
  const api = {courseId, schedules, selectVideo, fallbackVideos, job, eligible, trackKey, zeroTrack, validCrop, cropMatches, automatic};
  root.PPTBatch = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
