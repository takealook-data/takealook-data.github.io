/** 설정 화면. 값 읽기/쓰기는 서비스 워커를 거쳐 storage.sync 로 간다. */
import { DEFAULT_NOTE_TEMPLATE } from '../lib/settings.js';

const $ = (id) => document.getElementById(id);

/** 필드 id → 직렬화 방식. 나머지는 문자열 그대로. */
const FIELDS = {
  queuePlaylistTitle: 'text',
  queuePlaylistId: 'text',
  removeAfterClip: 'bool',
  queueDelayMs: 'number',
  delivery: 'text',
  localRestPort: 'number',
  localRestApiKey: 'text',
  vaultName: 'text',
  noteFolder: 'text',
  filenameTemplate: 'text',
  transcriptLangs: 'list',
  transcriptTimestamps: 'bool',
  transcriptChunkSeconds: 'number',
  noteTemplate: 'text',
};

async function send(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res?.ok) throw new Error(res?.error || '알 수 없는 오류');
  return res.data;
}

function status(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `inline ${kind}`;
}

/** 선택한 전달 방식에 해당하는 블록만 보여 준다. */
function syncDeliveryVisibility() {
  const mode = $('delivery').value;
  for (const el of document.querySelectorAll('[data-when]')) {
    el.hidden = el.dataset.when !== mode;
  }
}

function load(settings) {
  for (const [id, kind] of Object.entries(FIELDS)) {
    const el = $(id);
    if (!el) continue;
    const value = settings[id];
    if (kind === 'bool') el.checked = Boolean(value);
    else if (kind === 'list') el.value = (value || []).join(', ');
    else el.value = value ?? '';
  }
  syncDeliveryVisibility();
}

function collect() {
  const patch = {};
  for (const [id, kind] of Object.entries(FIELDS)) {
    const el = $(id);
    if (!el) continue;
    if (kind === 'bool') patch[id] = el.checked;
    else if (kind === 'number') patch[id] = Number(el.value);
    else if (kind === 'list') patch[id] = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else patch[id] = el.value;
  }
  return patch;
}

/* ------------------------------------------------------------------ 이벤트 */

$('delivery').addEventListener('change', syncDeliveryVisibility);

$('save').addEventListener('click', async () => {
  try {
    await send('setSettings', collect());
    status('저장했습니다.', 'ok');
  } catch (err) {
    status(String(err?.message || err), 'error');
  }
});

$('reset-template').addEventListener('click', () => {
  $('noteTemplate').value = DEFAULT_NOTE_TEMPLATE;
  status('기본 템플릿을 넣었습니다. 저장을 눌러 주세요.');
});

$('load-playlists').addEventListener('click', async () => {
  status('재생목록을 불러오는 중…');
  try {
    const playlists = await send('listPlaylists');
    const select = $('queuePlaylistId');
    const current = select.value;

    select.replaceChildren(new Option('(이름으로 찾거나 새로 만들기)', ''));
    for (const p of playlists) select.append(new Option(p.title, p.id));
    select.value = current;

    status(`${playlists.length}개 불러옴`, 'ok');
  } catch (err) {
    status(String(err?.message || err), 'error');
  }
});

$('test-rest').addEventListener('click', async () => {
  const result = $('rest-result');
  result.textContent = '확인 중…';
  result.className = 'inline';

  const port = Number($('localRestPort').value) || 27123;
  const key = $('localRestApiKey').value;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    if (body.authenticated) {
      result.textContent = `연결됨 (${body.service || 'Obsidian'})`;
      result.className = 'inline ok';
    } else {
      result.textContent = '서버는 응답하지만 인증에 실패했습니다. API Key를 확인하세요.';
      result.className = 'inline error';
    }
  } catch {
    result.textContent = '연결 실패. Obsidian이 켜져 있고 Local REST API 플러그인이 활성화됐는지 확인하세요.';
    result.className = 'inline error';
  }
});

$('sign-out').addEventListener('click', async () => {
  await send('signOut');
  status('로그아웃했습니다. 다음 요청 때 다시 인증합니다.', 'ok');
});

send('getSettings').then(load).catch((err) => status(String(err?.message || err), 'error'));
