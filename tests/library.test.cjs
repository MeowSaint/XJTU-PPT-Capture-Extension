const test = require('node:test');
const assert = require('node:assert/strict');
const library = require('../library.js');

test('source identity separates courses, local files and independent batch recordings', () => {
  const a = {page: 'https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/1', sourceKey: 'file:["a.mp4",10,1]', sourceName: 'a.mp4'};
  assert.equal(library.key(a), library.key({...a}));
  assert.notEqual(library.key(a), library.key({...a, sourceKey: 'file:["a.mp4",11,1]'}));
  assert.notEqual(library.key(a), library.key({...a, page: a.page.replace('/42/', '/43/')}));
  assert.equal(library.key({...a, batchJobId: 'rec1'}), library.key({...a, batchJobId: 'rec1', sourceKey: 'url:renewed-token'}));
  assert.notEqual(library.key({...a, batchJobId: 'rec1'}), library.key({...a, batchJobId: 'rec2'}));
});

test('signed media links retain lesson identity while resource parameters and opaque downloads stay distinct', () => {
  const sourceKey = value => 'url:https://cdn.invalid/2-record.mp4?id=1&' + new URLSearchParams({token: value, expires: value === 'a' ? '100' : '200'});
  const source = {page: 'https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/1', sourceKey: sourceKey('a')};
  assert.equal(library.key(source), library.key({...source, sourceKey: sourceKey('b')}));
  assert.notEqual(library.key(source), library.key({...source, sourceKey: source.sourceKey.replace('id=1', 'id=2')}));
  assert.notEqual(library.key({sourceKey: 'url:https://cdn.invalid/download?token=one'}), library.key({sourceKey: 'url:https://cdn.invalid/download?token=two'}));
});

test('course identity groups course pages and fallback names without conflating site origins', () => {
  assert.equal(library.courseKey('https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/a'), library.courseKey('https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/b'));
  assert.notEqual(library.courseKey('https://a.invalid/?courseId=42'), library.courseKey('https://b.invalid/?courseId=42'));
  assert.equal(library.courseKey('', {name: '  模式识别  '}), library.courseKey('', {name: '模式识别'}));
});

test('interrupted task states and crop settings are restored without mutating stored input', () => {
  const input = {id: 'lesson', task: {id: 'scan', state: 'running', checkpoint: 12}, crop: {x: .1,y: .2,w: .5,h: .6}, suspects: [{start: 3,end: 4,time: 3.5}]};
  const restored = library.recover(input);
  assert.equal(restored.task.state, 'paused'); assert.equal(input.task.state, 'running');
  assert.deepEqual(restored.crop, input.crop); assert.equal(restored.task.checkpoint, 12);
  assert.equal(library.recover({...input,task: {...input.task,state: 'done'}}).task.state, 'done');
});

test('suspect ranges merge overlapping intervals, ignore invalid bounds and keep chronological order', () => {
  assert.deepEqual(library.mergeRanges([{start: 5,end: 7,time: 6},{start: 1,end: 2,time: 1}], {start: 1.5,end: 3,time: 2}), [{start: 1,end: 3,time: 1},{start: 5,end: 7,time: 6}]);
  assert.deepEqual(library.mergeRanges([], {start: NaN,end: 5,time: 4}), []);
});
