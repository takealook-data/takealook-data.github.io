/**
 * 서비스 워커: 인증 · 큐 조작 · 추출 요청 · 노트 전달을 엮는 오케스트레이터.
 */
import { getSettings, setSettings } from './lib/settings.js';
import {
  ensureQueuePlaylist,
  listQueue,
  addToQueue,
  removeFromQueue,
  listMyPlaylists,
  signOut,
} from './lib/youtube.js';
import { buildNote } from './lib/template.js';
import { deliver, toDataUrl } from './lib/obsidian.js';

const JOB_KEY = 'job';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * MV3 서비스 워커는 30초 유휴 시 종료된다. 긴 작업 중에는 주기적으로 확장 API를
 * 호출해 유휴 타이머를 리셋한다(팝업이 닫혀도 큐 처리가 이어지도록).
 */
async function withKeepAlive(fn) {
  const timer = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}

/* ---------------------------------------------------------------- 작업 상태 */

async function setJob(patch) {
  const prev = (await chrome.storage.session.get(JOB_KEY))[JOB_KEY] || {};
  const job = { ...prev, ...patch, updatedAt: Date.now() };
  await chrome.storage.session.set({ [JOB_KEY]: job });
  // 팝업이 닫혀 있으면 수신자가 없어 reject 된다. 무시해도 되는 상황.
  chrome.runtime.sendMessage({ type: 'job', job }).catch(() => {});
  return job;
}

async function getJob() {
  return (await chrome.storage.session.get(JOB_KEY))[JOB_KEY] || null;
}

/* ------------------------------------------------------ YouTube 탭 확보/통신 */

function isYouTubeTab(tab) {
  return tab?.url?.startsWith('https://www.youtube.com/');
}

function waitForLoad(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('YouTube 탭 로딩 시간 초과'));
    }, timeoutMs);

    const listener = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** 확장 설치 전부터 열려 있던 탭에는 콘텐츠 스크립트가 없다. 핑으로 걸러낸다. */
async function hasContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { target: 'content', action: 'ping', timeoutMs: 1000 });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

/**
 * 추출은 youtube.com 컨텍스트에서만 가능하다. 쓸 수 있는 탭이 있으면 재사용하고,
 * 없으면 백그라운드 탭을 잠깐 띄웠다가 닫는다.
 */
async function withYouTubeTab(fn) {
  const open = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  for (const tab of open) {
    if (await hasContentScript(tab.id)) return fn(tab.id);
  }

  const tab = await chrome.tabs.create({ url: 'https://www.youtube.com/', active: false });
  try {
    await waitForLoad(tab.id);
    return await fn(tab.id);
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function askPage(tabId, action, payload, timeoutMs) {
  let res;
  try {
    res = await chrome.tabs.sendMessage(tabId, { target: 'content', action, payload, timeoutMs });
  } catch {
    throw new Error('YouTube 탭과 통신하지 못했습니다. 탭을 새로고침한 뒤 다시 시도하세요.');
  }
  if (!res?.ok) throw new Error(res?.error || '페이지 스크립트 응답이 없습니다.');
  return res.data;
}

/* ------------------------------------------------------------------ 클리핑 */

async function clipVideo({ videoId, playlistItemId, tabId }) {
  const settings = await getSettings();

  const run = (id) =>
    askPage(id, 'extractVideo', { videoId, transcriptLangs: settings.transcriptLangs }, 60000);

  const video = tabId ? await run(tabId) : await withYouTubeTab(run);
  const note = buildNote(video, settings);
  const result = await deliver(note, settings);

  if (playlistItemId && settings.removeAfterClip) {
    await removeFromQueue(playlistItemId);
  }
  return { ...result, title: video.title, videoId: video.videoId, transcriptLang: video.transcriptLang };
}

async function clipCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const videoId = tab?.url ? new URL(tab.url).searchParams.get('v') : null;
  if (!isYouTubeTab(tab) || !videoId) {
    throw new Error('현재 탭이 YouTube 영상 페이지가 아닙니다.');
  }
  return clipVideo({ videoId, tabId: tab.id });
}

/* -------------------------------------------------------------- 큐 일괄처리 */

async function resolveQueue() {
  const settings = await getSettings();
  const playlist = await ensureQueuePlaylist(settings);
  if (playlist.id !== settings.queuePlaylistId) {
    await setSettings({ queuePlaylistId: playlist.id });
  }
  return playlist.id;
}

async function processQueue() {
  const settings = await getSettings();
  const playlistId = await resolveQueue();
  const items = await listQueue(playlistId);

  await setJob({ kind: 'queue', running: true, total: items.length, done: 0, failed: 0, log: [] });
  if (!items.length) return setJob({ running: false, message: '큐가 비어 있습니다.' });

  let done = 0;
  let failed = 0;
  const log = [];

  // 큐를 훑는 동안 탭을 매번 새로 열지 않도록 하나만 잡고 재사용한다.
  await withYouTubeTab(async (tabId) => {
    for (const item of items) {
      try {
        const res = await clipVideo({ videoId: item.videoId, playlistItemId: item.playlistItemId, tabId });
        done += 1;
        log.push({ ok: true, title: res.title || item.title });
      } catch (err) {
        failed += 1;
        log.push({ ok: false, title: item.title, error: String(err?.message || err) });
      }
      await setJob({ done, failed, log: log.slice(-50) });
      await sleep(settings.queueDelayMs);
    }
  });

  return setJob({ running: false, message: `완료 ${done}건 / 실패 ${failed}건` });
}

/* ------------------------------------------------- 나중에 볼 동영상 마이그레이션 */

async function harvestWatchLater() {
  return withYouTubeTab((tabId) => askPage(tabId, 'harvestWatchLater', {}, 120000));
}

/**
 * WL에서 긁은 영상을 큐 재생목록으로 복사한다.
 * playlistItems.insert 는 호출당 50 유닛이고 기본 일일 할당량이 10,000이라
 * 하루 200건이 상한이다. 그 이상은 나눠서 돌려야 한다.
 */
async function importWatchLater({ videoIds }) {
  const settings = await getSettings();
  const playlistId = await resolveQueue();

  await setJob({ kind: 'import', running: true, total: videoIds.length, done: 0, failed: 0, log: [] });

  let done = 0;
  let failed = 0;
  const log = [];

  for (const videoId of videoIds) {
    try {
      await addToQueue(playlistId, videoId);
      done += 1;
    } catch (err) {
      failed += 1;
      const message = String(err?.message || err);
      log.push({ ok: false, title: videoId, error: message });
      if (message.includes('quotaExceeded')) {
        await setJob({ running: false, done, failed, log, message: '일일 할당량 초과. 내일 이어서 진행하세요.' });
        return getJob();
      }
    }
    await setJob({ done, failed, log: log.slice(-50) });
    await sleep(300);
  }

  return setJob({ running: false, message: `추가 ${done}건 / 실패 ${failed}건` });
}

/** 할당량을 쓰지 않는 대안: 목록을 마크다운 파일로 내려받는다. */
async function exportWatchLater({ videos }) {
  const lines = [
    '# YouTube 나중에 볼 동영상',
    '',
    `> ${new Date().toISOString().slice(0, 10)} 기준 ${videos.length}건`,
    '',
    ...videos.map((v) => `- [ ] [${v.title}](https://www.youtube.com/watch?v=${v.videoId}) — ${v.channel}`),
    '',
  ].join('\n');

  const id = await chrome.downloads.download({
    url: toDataUrl(lines),
    filename: 'watch-later.md',
    conflictAction: 'uniquify',
    saveAs: false,
  });
  return { downloadId: id, count: videos.length };
}

/* ------------------------------------------------------------- 메시지 라우터 */

const HANDLERS = {
  getSettings: () => getSettings(),
  setSettings: (p) => setSettings(p),
  getJob: () => getJob(),
  listPlaylists: () => listMyPlaylists().then((ps) => ps.map((p) => ({ id: p.id, title: p.snippet.title }))),
  resolveQueue: () => resolveQueue(),
  listQueue: async () => listQueue(await resolveQueue()),
  clipCurrentTab: () => clipCurrentTab(),
  clipVideo: (p) => clipVideo(p),
  processQueue: () => withKeepAlive(processQueue),
  harvestWatchLater: () => withKeepAlive(harvestWatchLater),
  importWatchLater: (p) => withKeepAlive(() => importWatchLater(p)),
  exportWatchLater: (p) => exportWatchLater(p),
  signOut: () => signOut(),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) return undefined;

  handler(message.payload || {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));

  return true; // 비동기 응답
});
