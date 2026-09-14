/** 팝업 UI. 실제 작업은 전부 서비스 워커가 하고 여기서는 요청/표시만 한다. */

const $ = (id) => document.getElementById(id);
let watchLater = [];

async function send(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res?.ok) throw new Error(res?.error || '알 수 없는 오류');
  return res.data;
}

function status(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
  el.hidden = !text;
}

/** 버튼을 눌러 도는 동안 잠그고, 결과/오류를 상태줄에 찍는다. */
async function guard(button, pendingText, fn) {
  const label = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = '…';
  }
  status(pendingText);
  try {
    const out = await fn();
    return out;
  } catch (err) {
    status(String(err?.message || err), 'error');
    return undefined;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = label;
    }
  }
}

function renderQueue(items) {
  $('queue-count').textContent = items.length;
  const list = $('queue-list');
  list.replaceChildren();

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '비어 있음';
    list.append(li);
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title;
    title.title = item.title;

    const channel = document.createElement('div');
    channel.className = 'channel';
    channel.textContent = item.channel || '';

    const clip = document.createElement('button');
    clip.className = 'link';
    clip.textContent = '클립';
    clip.addEventListener('click', async () => {
      const res = await guard(clip, `클리핑: ${item.title}`, () =>
        send('clipVideo', { videoId: item.videoId, playlistItemId: item.playlistItemId }),
      );
      if (res) {
        status(`저장됨: ${res.path}`, 'ok');
        loadQueue();
      }
    });

    li.append(title, channel, clip);
    list.append(li);
  }
}

async function loadQueue() {
  try {
    renderQueue(await send('listQueue'));
  } catch (err) {
    $('queue-count').textContent = '!';
    status(String(err?.message || err), 'error');
  }
}

function renderJob(job) {
  if (!job) return;
  const suffix = job.failed ? ` (실패 ${job.failed})` : '';
  if (job.running) {
    status(`처리 중… ${job.done}/${job.total}${suffix}`);
  } else if (job.message) {
    status(job.message, job.failed ? 'error' : 'ok');
  }
}

/* ------------------------------------------------------------------ 이벤트 */

$('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$('clip-current').addEventListener('click', async (e) => {
  const res = await guard(e.target, '현재 영상 추출 중…', () => send('clipCurrentTab'));
  if (res) {
    status(`저장됨: ${res.path}${res.transcriptLang ? `\n자막: ${res.transcriptLang}` : '\n자막 없음'}`, 'ok');
    loadQueue();
  }
});

$('refresh-queue').addEventListener('click', () => loadQueue());

$('process-queue').addEventListener('click', async (e) => {
  await guard(e.target, '큐 처리를 시작합니다…', () => send('processQueue'));
  loadQueue();
});

$('harvest-wl').addEventListener('click', async (e) => {
  const res = await guard(e.target, 'WL 목록을 읽는 중…', () => send('harvestWatchLater'));
  if (!res) return;

  watchLater = res.videos;
  $('wl-result').hidden = false;
  $('wl-summary').textContent =
    `${watchLater.length}건${res.truncated ? ' (일부만 로드됨)' : ''} 확인됨`;
  status('');
});

$('wl-import').addEventListener('click', async (e) => {
  if (!watchLater.length) return;
  // insert 는 건당 50 유닛이라 기본 할당량(10,000/일)으로는 하루 200건이 한계다.
  const over = watchLater.length > 200;
  const ok = confirm(
    `${watchLater.length}건을 큐 재생목록에 추가합니다.\n` +
      `YouTube API 할당량을 건당 50유닛 사용합니다.` +
      (over ? `\n\n200건을 넘으면 오늘 할당량이 소진되어 중간에 멈춥니다.` : ''),
  );
  if (!ok) return;

  await guard(e.target, '큐로 가져오는 중…', () =>
    send('importWatchLater', { videoIds: watchLater.map((v) => v.videoId) }),
  );
  loadQueue();
});

$('wl-export').addEventListener('click', async (e) => {
  if (!watchLater.length) return;
  const res = await guard(e.target, '마크다운 저장 중…', () =>
    send('exportWatchLater', { videos: watchLater }),
  );
  if (res) status(`watch-later.md 저장됨 (${res.count}건)`, 'ok');
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'job') renderJob(message.job);
});

loadQueue();
send('getJob').then(renderJob).catch(() => {});
