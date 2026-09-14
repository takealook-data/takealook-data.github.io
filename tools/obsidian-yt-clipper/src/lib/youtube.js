/**
 * YouTube Data API v3 래퍼.
 *
 * 나중에 볼 동영상(WL)은 2016-09-12 breaking change 이후 API로 조회/수정이
 * 불가능하다. 그래서 이 확장은 사용자가 소유한 일반 재생목록을 큐로 쓴다.
 * 일반 재생목록은 조회·추가·삭제가 모두 공식 API로 가능하다.
 */

const API = 'https://www.googleapis.com/youtube/v3';

/** Chrome 프로필 계정으로 OAuth 토큰을 받는다. */
async function getToken({ interactive = true } = {}) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err || !token) {
        reject(new Error(err?.message || 'OAuth 토큰을 받지 못했습니다.'));
        return;
      }
      resolve(token);
    });
  });
}

async function dropToken(token) {
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}

export async function signOut() {
  try {
    const token = await getToken({ interactive: false });
    await dropToken(token);
  } catch {
    // 캐시된 토큰이 없으면 할 일 없음
  }
}

/** 401이면 캐시 토큰을 버리고 한 번만 재시도한다. */
async function call(path, { method = 'GET', params = {}, body, retry = true } = {}) {
  const token = await getToken({ interactive: retry });
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) {
    await dropToken(token);
    return call(path, { method, params, body, retry: false });
  }
  if (res.status === 204) return null;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason;
    const message = json?.error?.message || res.statusText;
    throw new Error(`YouTube API ${res.status}${reason ? ` (${reason})` : ''}: ${message}`);
  }
  return json;
}

/** 내 재생목록 전체 (페이지네이션 포함). */
export async function listMyPlaylists() {
  const out = [];
  let pageToken;
  do {
    const page = await call('/playlists', {
      params: { part: 'snippet,contentDetails', mine: 'true', maxResults: 50, pageToken },
    });
    out.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * 큐 재생목록을 확보한다. ID가 있으면 그대로, 없으면 제목으로 찾고,
 * 그래도 없으면 비공개로 새로 만든다.
 */
export async function ensureQueuePlaylist({ queuePlaylistId, queuePlaylistTitle }) {
  if (queuePlaylistId) return { id: queuePlaylistId, created: false };

  const mine = await listMyPlaylists();
  const hit = mine.find((p) => p.snippet?.title === queuePlaylistTitle);
  if (hit) return { id: hit.id, title: hit.snippet.title, created: false };

  const made = await call('/playlists', {
    method: 'POST',
    params: { part: 'snippet,status' },
    body: {
      snippet: { title: queuePlaylistTitle, description: 'Obsidian 클리핑 대기열' },
      status: { privacyStatus: 'private' },
    },
  });
  return { id: made.id, title: made.snippet.title, created: true };
}

/** 큐 항목 목록. playlistItemId는 삭제에 쓰이므로 같이 들고 다닌다. */
export async function listQueue(playlistId, { max = 200 } = {}) {
  const out = [];
  let pageToken;
  do {
    const page = await call('/playlistItems', {
      params: { part: 'snippet,contentDetails', playlistId, maxResults: 50, pageToken },
    });
    for (const item of page.items || []) {
      out.push({
        playlistItemId: item.id,
        videoId: item.contentDetails?.videoId,
        title: item.snippet?.title,
        channel: item.snippet?.videoOwnerChannelTitle,
        thumbnail: item.snippet?.thumbnails?.medium?.url,
        position: item.snippet?.position,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < max);

  // 비공개/삭제된 영상은 videoId가 없을 수 있다.
  return out.filter((v) => v.videoId);
}

export async function addToQueue(playlistId, videoId) {
  return call('/playlistItems', {
    method: 'POST',
    params: { part: 'snippet' },
    body: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } },
  });
}

export async function removeFromQueue(playlistItemId) {
  return call('/playlistItems', { method: 'DELETE', params: { id: playlistItemId } });
}
