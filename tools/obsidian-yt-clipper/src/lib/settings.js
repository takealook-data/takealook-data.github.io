/** 확장 전역 설정: 기본값 + chrome.storage.sync 래퍼. */

export const DEFAULT_NOTE_TEMPLATE = `---
title: "{{title}}"
source: {{url}}
channel: "{{channel}}"
channel_url: {{channelUrl}}
published: {{published}}
duration: {{duration}}
video_id: {{videoId}}
clipped: {{clippedAt}}
tags: [youtube]
---

![thumbnail]({{thumbnail}})

## 설명

{{description}}

## 자막

{{transcript}}
`;

export const DEFAULTS = {
  /** 큐로 쓸 재생목록 이름. ID가 비어 있으면 이 이름으로 찾거나 새로 만든다. */
  queuePlaylistTitle: '📥 Clip',
  queuePlaylistId: '',

  /** 노트 전달 방식: 'local-rest' | 'download' | 'uri' */
  delivery: 'download',
  /** Obsidian Local REST API 플러그인 설정 */
  localRestPort: 27123,
  localRestApiKey: '',
  /** obsidian:// URI 방식에서 쓰는 볼트 이름 */
  vaultName: '',
  /** 볼트 기준 저장 폴더 (앞뒤 슬래시 없이) */
  noteFolder: 'Clippings/YouTube',
  filenameTemplate: '{{date}} {{safeTitle}}',

  /** 자막 언어 우선순위 */
  transcriptLangs: ['ko', 'en'],
  /** 자막에 타임스탬프 링크를 붙일지 */
  transcriptTimestamps: true,
  /** 자막 문단을 이 초 단위로 묶는다 (0이면 줄마다) */
  transcriptChunkSeconds: 30,

  noteTemplate: DEFAULT_NOTE_TEMPLATE,

  /** 큐 일괄 처리 시 영상 사이 대기(ms). 너무 짧으면 YouTube가 조인다. */
  queueDelayMs: 1500,
  /** 클리핑 성공 시 큐에서 자동 제거 */
  removeAfterClip: true,
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch) {
  await chrome.storage.sync.set(patch);
  return getSettings();
}
