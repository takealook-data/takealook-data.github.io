/**
 * MAIN world content script.
 *
 * youtube.com 페이지 컨텍스트에서 직접 도는 유일한 코드다. 여기서만
 * window.ytInitialPlayerResponse / ytInitialData / ytcfg 같은 페이지 전역을
 * 읽을 수 있고, fetch가 진짜 동일 출처라 로그인 쿠키가 그대로 실린다.
 * 확장 API는 못 쓰므로 ISOLATED world의 bridge.js와 postMessage로 대화한다.
 */
(() => {
  const IN = 'yoc-bridge';
  const OUT = 'yoc-page';

  /**
   * HTML 안의 `var NAME = {...};` 에서 JSON을 꺼낸다.
   * 문자열/이스케이프를 인식하는 괄호 카운터라 욕심쟁이 정규식보다 안전하다.
   */
  function extractJson(html, name) {
    const start = html.indexOf(name);
    if (start === -1) return null;
    const open = html.indexOf('{', start);
    if (open === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = open; i < html.length; i += 1) {
      const ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(open, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  async function fetchPageJson(path, name) {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) throw new Error(`${path} 요청 실패 (${res.status})`);
    const html = await res.text();
    const data = extractJson(html, name);
    if (!data) throw new Error(`${path} 에서 ${name} 를 찾지 못했습니다. 로그인 상태를 확인하세요.`);
    return data;
  }

  /** 현재 탭의 플레이어 응답이 원하는 영상이면 재사용, 아니면 watch 페이지를 받아온다. */
  async function getPlayerResponse(videoId) {
    const current = window.ytInitialPlayerResponse;
    if (current?.videoDetails?.videoId === videoId) return current;
    return fetchPageJson(`/watch?v=${encodeURIComponent(videoId)}`, 'ytInitialPlayerResponse');
  }

  /** 선호 언어 → 수동 자막 우선, 그다음 자동 생성(asr), 마지막으로 아무거나. */
  function pickCaptionTrack(tracks, langs) {
    if (!tracks?.length) return null;
    const code = (t) => (t.languageCode || '').toLowerCase();
    for (const lang of langs) {
      const want = String(lang).toLowerCase();
      const manual = tracks.find((t) => code(t).startsWith(want) && t.kind !== 'asr');
      if (manual) return manual;
      const asr = tracks.find((t) => code(t).startsWith(want));
      if (asr) return asr;
    }
    return tracks[0];
  }

  async function fetchTranscript(track) {
    if (!track?.baseUrl) return [];
    const url = new URL(track.baseUrl, location.origin);
    url.searchParams.set('fmt', 'json3');

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);

    return (body?.events || [])
      .filter((e) => Array.isArray(e.segs))
      .map((e) => ({
        start: (e.tStartMs ?? 0) / 1000,
        text: e.segs.map((s) => s.utf8 || '').join('').replace(/\n/g, ' ').trim(),
      }))
      .filter((s) => s.text);
  }

  async function extractVideo({ videoId, transcriptLangs }) {
    const player = await getPlayerResponse(videoId);
    const details = player?.videoDetails;
    if (!details) throw new Error('영상 정보를 읽지 못했습니다 (비공개이거나 삭제된 영상일 수 있습니다).');

    const status = player?.playabilityStatus;
    if (status?.status && !['OK', 'LIVE_STREAM_OFFLINE'].includes(status.status)) {
      throw new Error(`재생 불가 상태: ${status.status} ${status.reason || ''}`.trim());
    }

    const micro = player?.microformat?.playerMicroformatRenderer;
    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const track = pickCaptionTrack(tracks, transcriptLangs || ['ko', 'en']);
    const transcript = await fetchTranscript(track).catch(() => []);
    const thumbs = details.thumbnail?.thumbnails || [];

    return {
      videoId: details.videoId,
      title: details.title,
      channel: details.author,
      channelId: details.channelId,
      description: details.shortDescription,
      lengthSeconds: Number(details.lengthSeconds) || 0,
      viewCount: Number(details.viewCount) || 0,
      publishDate: micro?.publishDate || micro?.uploadDate || '',
      thumbnail: thumbs.at(-1)?.url || '',
      transcript,
      transcriptLang: track ? `${track.languageCode}${track.kind === 'asr' ? ' (자동생성)' : ''}` : '',
    };
  }

  /** 재생목록 응답에서 항목 배열을 꺼낸다 (첫 로드 / continuation 공통). */
  function playlistItems(data) {
    return (
      data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
        ?.playlistVideoListRenderer?.contents ||
      data?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems ||
      []
    );
  }

  function continuationToken(items) {
    return items.at(-1)?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  }

  function parseVideos(items) {
    return items.flatMap((item) => {
      const v = item.playlistVideoRenderer;
      if (!v?.videoId) return [];
      return [{
        videoId: v.videoId,
        title: v.title?.runs?.[0]?.text || v.title?.simpleText || '',
        channel: v.shortBylineText?.runs?.[0]?.text || '',
        lengthSeconds: Number(v.lengthSeconds) || 0,
      }];
    });
  }

  /**
   * 나중에 볼 동영상(WL) 전체를 긁는다.
   * 공식 API로는 접근이 막혀 있어 로그인 세션 + InnerTube로만 가능하다.
   */
  async function harvestWatchLater({ limit = 5000 } = {}) {
    const first = await fetchPageJson('/playlist?list=WL', 'ytInitialData');
    let items = playlistItems(first);
    const videos = parseVideos(items);
    let token = continuationToken(items);

    const apiKey = window.ytcfg?.get?.('INNERTUBE_API_KEY');
    const context = window.ytcfg?.get?.('INNERTUBE_CONTEXT');

    while (token && videos.length < limit && apiKey && context) {
      const res = await fetch(`/youtubei/v1/browse?key=${apiKey}&prettyPrint=false`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, continuation: token }),
      });
      if (!res.ok) break;
      const page = await res.json();
      items = playlistItems(page);
      if (!items.length) break;
      videos.push(...parseVideos(items));
      token = continuationToken(items);
    }

    return { videos, truncated: Boolean(token) };
  }

  const ACTIONS = {
    ping: async () => ({ ok: true }),
    extractVideo,
    harvestWatchLater,
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (msg?.source !== IN || !ACTIONS[msg.action]) return;

    try {
      const data = await ACTIONS[msg.action](msg.payload || {});
      window.postMessage({ source: OUT, id: msg.id, ok: true, data }, location.origin);
    } catch (err) {
      window.postMessage(
        { source: OUT, id: msg.id, ok: false, error: String(err?.message || err) },
        location.origin,
      );
    }
  });

  window.postMessage({ source: OUT, id: 'ready', ok: true, data: { ready: true } }, location.origin);
})();
