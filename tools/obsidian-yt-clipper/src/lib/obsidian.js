/**
 * 노트를 Obsidian으로 보내는 어댑터 3종.
 *
 * local-rest : Local REST API 커뮤니티 플러그인에 PUT. 볼트에 바로 꽂힌다(권장).
 * download   : 다운로드 폴더에 .md로 저장. 플러그인 없이 되지만 수동 이동이 필요.
 * uri        : obsidian://new URI. 설치만 되어 있으면 되지만 길이 제한이 크다.
 */

/** 서비스 워커에는 URL.createObjectURL이 없어서 data URL을 직접 만든다. */
export function toDataUrl(text, mime = 'text/markdown') {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:${mime};charset=utf-8;base64,${btoa(binary)}`;
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function viaLocalRest(note, settings) {
  const port = Number(settings.localRestPort) || 27123;
  const res = await fetch(`http://127.0.0.1:${port}/vault/${encodePath(note.path)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/markdown',
      ...(settings.localRestApiKey ? { Authorization: `Bearer ${settings.localRestApiKey}` } : {}),
    },
    body: note.markdown,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Local REST API ${res.status}: ${detail.slice(0, 200) || res.statusText}`);
  }
  return { delivered: 'local-rest', path: note.path };
}

async function viaDownload(note) {
  const id = await chrome.downloads.download({
    url: toDataUrl(note.markdown),
    filename: note.path,
    conflictAction: 'uniquify',
    saveAs: false,
  });
  return { delivered: 'download', path: note.path, downloadId: id };
}

async function viaUri(note, settings) {
  if (!settings.vaultName) throw new Error('obsidian:// 방식은 옵션에서 볼트 이름이 필요합니다.');
  const url =
    'obsidian://new?' +
    new URLSearchParams({
      vault: settings.vaultName,
      file: note.path.replace(/\.md$/, ''),
      content: note.markdown,
  }).toString();

  if (url.length > 30000) {
    throw new Error('노트가 너무 길어 obsidian:// URI로 보낼 수 없습니다. local-rest나 download를 쓰세요.');
  }
  const tab = await chrome.tabs.create({ url, active: false });
  // Obsidian이 URI를 넘겨받으면 탭은 빈 채로 남으므로 정리해 준다.
  setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 2000);
  return { delivered: 'uri', path: note.path };
}

export async function deliver(note, settings) {
  switch (settings.delivery) {
    case 'local-rest':
      return viaLocalRest(note, settings);
    case 'uri':
      return viaUri(note, settings);
    case 'download':
    default:
      return viaDownload(note);
  }
}
