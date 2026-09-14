/** 순수 로직(template.js) 스모크 테스트. node --test test/ 로 실행. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNote, renderTranscript, formatDuration, fillTemplate } from '../src/lib/template.js';
import { DEFAULTS } from '../src/lib/settings.js';

const video = {
  videoId: 'dQw4w9WgXcQ',
  title: 'RAG 파이프라인 설계: 실전 사례 / 주의점?',
  channel: '테스트 채널',
  channelId: 'UC123',
  description: '본문 설명\n두 번째 줄',
  lengthSeconds: 3725,
  viewCount: 1234,
  publishDate: '2025-03-04T00:00:00-08:00',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg',
  transcript: [
    { start: 0, text: '안녕하세요' },
    { start: 12, text: '오늘은 RAG를 다룹니다' },
    { start: 45.5, text: '먼저 청킹부터' },
  ],
  transcriptLang: 'ko',
};

test('formatDuration', () => {
  assert.equal(formatDuration(59), '0:59');
  assert.equal(formatDuration(605), '10:05');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatDuration(0), '');
  assert.equal(formatDuration(undefined), '');
});

test('fillTemplate 은 알 수 없는 키를 비운다', () => {
  assert.equal(fillTemplate('a{{x}}b{{nope}}c', { x: 1 }), 'a1bc');
});

test('renderTranscript 는 chunkSeconds 로 문단을 묶는다', () => {
  const out = renderTranscript(video.transcript, {
    videoId: video.videoId,
    timestamps: true,
    chunkSeconds: 30,
  });
  const paras = out.split('\n\n');
  assert.equal(paras.length, 2, '0초·12초는 한 문단, 45초는 새 문단');
  assert.match(paras[0], /^\[0:00\]\(https:\/\/youtu\.be\/dQw4w9WgXcQ\?t=0\) 안녕하세요 오늘은/);
  assert.match(paras[1], /\?t=45\) 먼저 청킹부터$/);
});

test('renderTranscript 는 자막이 없으면 안내 문구', () => {
  assert.equal(renderTranscript([], { videoId: 'x' }), '_자막 없음_');
});

test('buildNote 는 파일 경로와 프런트매터를 만든다', () => {
  const note = buildNote(video, DEFAULTS);

  // 파일명에서 / : ? 같은 금지 문자가 빠져야 한다
  assert.equal(note.path.startsWith('Clippings/YouTube/'), true);
  assert.equal(note.filename.endsWith('.md'), true);
  assert.equal(/[\\:*?"<>|]/.test(note.filename), false, `금지문자 남음: ${note.filename}`);

  assert.match(note.markdown, /^---\n/);
  assert.match(note.markdown, /source: https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  assert.match(note.markdown, /duration: 1:02:05/);
  assert.match(note.markdown, /published: 2025-03-04/);
  assert.match(note.markdown, /channel_url: https:\/\/www\.youtube\.com\/channel\/UC123/);
  assert.match(note.markdown, /## 자막/);
});

test('buildNote 는 YAML 을 깨뜨리는 따옴표/줄바꿈을 정리한다', () => {
  const note = buildNote({ ...video, title: '큰"따옴표"\n줄바꿈', channel: 'a"b' }, DEFAULTS);
  const frontmatter = note.markdown.split('---')[1];
  assert.equal(frontmatter.includes('"큰\'따옴표\' 줄바꿈"'), true, frontmatter);
  assert.equal(frontmatter.includes('a\'b'), true);
});

test('buildNote 는 폴더가 비어도 동작한다', () => {
  const note = buildNote(video, { ...DEFAULTS, noteFolder: '' });
  assert.equal(note.path.includes('/'), false);
});
