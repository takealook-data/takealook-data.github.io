/**
 * page.js 는 MAIN world 전용이라 import 할 수 없다. vm 에 가짜 window/fetch 를
 * 깔고 실제 파일을 그대로 실행해서 메시지 프로토콜까지 통째로 검증한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../src/content/page.js', import.meta.url), 'utf8');
const ORIGIN = 'https://www.youtube.com';

const PLAYER = {
  playabilityStatus: { status: 'OK' },
  videoDetails: {
    videoId: 'abc12345678',
    title: 'JSON 안에 } 가 들어간 "제목"',
    author: '테스트 채널',
    channelId: 'UC999',
    shortDescription: '설명\n둘째 줄',
    lengthSeconds: '612',
    viewCount: '4242',
    thumbnail: { thumbnails: [{ url: 'low.jpg' }, { url: 'high.jpg' }] },
  },
  microformat: { playerMicroformatRenderer: { publishDate: '2025-06-01T00:00:00-07:00' } },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { languageCode: 'en', kind: 'asr', baseUrl: `${ORIGIN}/api/timedtext?lang=en&kind=asr` },
        { languageCode: 'ko', baseUrl: `${ORIGIN}/api/timedtext?lang=ko` },
      ],
    },
  },
};

const CAPTIONS = {
  events: [
    { tStartMs: 0, segs: [{ utf8: '첫' }, { utf8: ' 줄' }] },
    { tStartMs: 5000 }, // segs 없는 이벤트는 버려져야 한다
    { tStartMs: 8000, segs: [{ utf8: '둘째\n줄' }] },
  ],
};

function playlistPage(videos, token) {
  const contents = videos.map((v) => ({
    playlistVideoRenderer: {
      videoId: v.id,
      title: { runs: [{ text: v.title }] },
      shortBylineText: { runs: [{ text: v.channel }] },
      lengthSeconds: '100',
    },
  }));
  if (token) {
    contents.push({
      continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } },
    });
  }
  return {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [{
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [{
                  itemSectionRenderer: {
                    contents: [{ playlistVideoListRenderer: { contents } }],
                  },
                }],
              },
            },
          },
        }],
      },
    },
  };
}

/** page.js 를 가짜 페이지 컨텍스트에서 부팅하고 호출 헬퍼를 돌려준다. */
function boot({ fetchImpl, globals = {} } = {}) {
  const listeners = [];
  const posted = [];

  const window = {
    addEventListener: (type, fn) => type === 'message' && listeners.push(fn),
    postMessage: (data) => posted.push(data),
    ...globals,
  };
  window.self = window;

  const context = vm.createContext({
    window,
    location: { origin: ORIGIN },
    fetch: fetchImpl,
    URL,
    URLSearchParams,
    JSON,
    console,
    setTimeout,
  });
  vm.runInContext(SOURCE, context);

  const call = async (action, payload = {}) => {
    const id = `t-${action}-${posted.length}`;
    for (const fn of listeners) {
      await fn({ source: window, data: { source: 'yoc-bridge', id, action, payload } });
    }
    // 핸들러가 await 체인을 도는 동안 마이크로태스크를 흘려 보낸다.
    for (let i = 0; i < 50 && !posted.some((m) => m.id === id); i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    const reply = posted.find((m) => m.id === id);
    assert.ok(reply, `${action} 응답 없음`);
    return clone(reply);
  };

  return { call, posted };
}

const ok = (body) => ({ ok: true, status: 200, text: async () => body, json: async () => body });

/** vm 안에서 만들어진 객체는 프로토타입이 달라 deepEqual 이 걸린다.
 *  실제 postMessage 도 구조화 복제를 거치므로 동일하게 맞춰 준다. */
const clone = (value) => JSON.parse(JSON.stringify(value));

test('부팅하면 ready 를 알린다', () => {
  const { posted } = boot({ fetchImpl: async () => ok('') });
  assert.deepEqual(clone(posted.at(-1)), {
    source: 'yoc-page',
    id: 'ready',
    ok: true,
    data: { ready: true },
  });
});

test('watch 페이지 HTML 에서 플레이어 응답과 자막을 뽑는다', async () => {
  const requested = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.includes('timedtext')) return ok(CAPTIONS);
    // 중괄호가 섞인 앞뒤 스크립트가 있어도 파서가 견뎌야 한다.
    return ok(
      `<script>var meta = {a:{b:1}};</script>` +
        `<script>var ytInitialPlayerResponse = ${JSON.stringify(PLAYER)};</script>` +
        `<script>var after = {c:2};</script>`,
    );
  };

  const { call } = boot({ fetchImpl });
  const reply = await call('extractVideo', { videoId: 'abc12345678', transcriptLangs: ['ko', 'en'] });

  assert.equal(reply.ok, true, reply.error);
  const v = reply.data;
  assert.equal(v.title, 'JSON 안에 } 가 들어간 "제목"');
  assert.equal(v.channel, '테스트 채널');
  assert.equal(v.lengthSeconds, 612);
  assert.equal(v.publishDate, '2025-06-01T00:00:00-07:00');
  assert.equal(v.thumbnail, 'high.jpg', '가장 큰 썸네일을 골라야 한다');

  // ko 수동 자막이 en 자동생성보다 우선
  assert.equal(v.transcriptLang, 'ko');
  assert.deepEqual(v.transcript, [
    { start: 0, text: '첫 줄' },
    { start: 8, text: '둘째 줄' },
  ]);
  assert.equal(requested.some((u) => u.includes('fmt=json3')), true);
});

test('현재 탭의 플레이어 응답이 맞으면 재요청하지 않는다', async () => {
  let calls = 0;
  const { call } = boot({
    fetchImpl: async (input) => {
      calls += 1;
      return String(input).includes('timedtext') ? ok(CAPTIONS) : ok('');
    },
    globals: { ytInitialPlayerResponse: PLAYER },
  });

  const reply = await call('extractVideo', { videoId: 'abc12345678', transcriptLangs: ['ko'] });
  assert.equal(reply.ok, true, reply.error);
  assert.equal(calls, 1, 'watch 페이지를 다시 받지 않고 자막만 받아야 한다');
});

test('재생 불가 영상은 오류로 돌려준다', async () => {
  const blocked = { ...PLAYER, playabilityStatus: { status: 'LOGIN_REQUIRED', reason: '비공개 동영상' } };
  const { call } = boot({
    fetchImpl: async () => ok(`var ytInitialPlayerResponse = ${JSON.stringify(blocked)};`),
  });

  const reply = await call('extractVideo', { videoId: 'abc12345678' });
  assert.equal(reply.ok, false);
  assert.match(reply.error, /LOGIN_REQUIRED/);
});

test('자막 요청이 실패해도 메타데이터는 살린다', async () => {
  const { call } = boot({
    fetchImpl: async (input) => {
      if (String(input).includes('timedtext')) throw new Error('네트워크 오류');
      return ok(`var ytInitialPlayerResponse = ${JSON.stringify(PLAYER)};`);
    },
  });

  const reply = await call('extractVideo', { videoId: 'abc12345678' });
  assert.equal(reply.ok, true, reply.error);
  assert.deepEqual(reply.data.transcript, []);
  assert.equal(reply.data.title, PLAYER.videoDetails.title);
});

test('WL 은 continuation 을 끝까지 따라간다', async () => {
  const fetchImpl = async (input, init) => {
    const url = String(input);
    if (url.includes('/playlist?list=WL')) {
      return ok(`var ytInitialData = ${JSON.stringify(
        playlistPage([{ id: 'v1', title: '첫 영상', channel: 'A' }], 'TOKEN1'),
      )};`);
    }
    if (url.includes('/youtubei/v1/browse')) {
      const { continuation } = JSON.parse(init.body);
      const more = playlistPage(
        [{ id: continuation === 'TOKEN1' ? 'v2' : 'v3', title: '다음 영상', channel: 'B' }],
        continuation === 'TOKEN1' ? 'TOKEN2' : undefined,
      );
      return ok({
        onResponseReceivedActions: [{
          appendContinuationItemsAction: {
            continuationItems:
              more.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content
                .sectionListRenderer.contents[0].itemSectionRenderer.contents[0]
                .playlistVideoListRenderer.contents,
          },
        }],
      });
    }
    throw new Error(`예상치 못한 요청: ${url}`);
  };

  const { call } = boot({
    fetchImpl,
    globals: { ytcfg: { get: (k) => (k === 'INNERTUBE_API_KEY' ? 'KEY' : { client: {} }) } },
  });

  const reply = await call('harvestWatchLater', {});
  assert.equal(reply.ok, true, reply.error);
  assert.deepEqual(reply.data.videos.map((v) => v.videoId), ['v1', 'v2', 'v3']);
  assert.equal(reply.data.truncated, false);
});

test('ytcfg 가 없으면 첫 페이지만 돌려주고 잘렸다고 표시한다', async () => {
  const { call } = boot({
    fetchImpl: async () =>
      ok(`var ytInitialData = ${JSON.stringify(
        playlistPage([{ id: 'v1', title: '첫 영상', channel: 'A' }], 'TOKEN1'),
      )};`),
  });

  const reply = await call('harvestWatchLater', {});
  assert.equal(reply.ok, true, reply.error);
  assert.equal(reply.data.videos.length, 1);
  assert.equal(reply.data.truncated, true);
});

test('로그인이 안 돼 데이터가 없으면 안내 오류를 낸다', async () => {
  const { call } = boot({ fetchImpl: async () => ok('<html>consent wall</html>') });
  const reply = await call('harvestWatchLater', {});
  assert.equal(reply.ok, false);
  assert.match(reply.error, /로그인 상태/);
});
