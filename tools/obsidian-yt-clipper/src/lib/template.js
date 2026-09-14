/** 추출된 영상 데이터를 Obsidian 노트(파일명 + 마크다운)로 렌더링한다. */

const ILLEGAL_FILENAME = /[\\/:*?"<>|#^[\]]/g;

export function formatDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function toIsoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** YAML 프런트매터 안에서 따옴표/줄바꿈이 문서를 깨뜨리지 않게 다듬는다. */
function yamlSafe(text) {
  return String(text ?? '').replace(/"/g, "'").replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * 자막 세그먼트를 마크다운으로. chunkSeconds 단위로 묶어 문단을 만들고,
 * 옵션에 따라 문단 앞에 타임스탬프 링크를 붙인다.
 */
export function renderTranscript(segments, { videoId, timestamps, chunkSeconds }) {
  if (!segments?.length) return '_자막 없음_';

  const chunk = Number(chunkSeconds) || 0;
  const groups = [];
  for (const seg of segments) {
    const text = seg.text?.trim();
    if (!text) continue;
    const last = groups.at(-1);
    if (chunk > 0 && last && seg.start - last.start < chunk) {
      last.parts.push(text);
    } else {
      groups.push({ start: seg.start, parts: [text] });
    }
  }

  return groups
    .map((g) => {
      const body = g.parts.join(' ');
      if (!timestamps) return body;
      const t = Math.floor(g.start);
      return `[${formatDuration(t) || '0:00'}](https://youtu.be/${videoId}?t=${t}) ${body}`;
    })
    .join('\n\n');
}

/** 템플릿의 {{key}}를 values로 치환. 알 수 없는 키는 빈 문자열로 만든다. */
export function fillTemplate(template, values) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) =>
    values[key] === undefined || values[key] === null ? '' : String(values[key]),
  );
}

export function buildNote(video, settings) {
  const clippedAt = new Date();
  const transcript = renderTranscript(video.transcript, {
    videoId: video.videoId,
    timestamps: settings.transcriptTimestamps,
    chunkSeconds: settings.transcriptChunkSeconds,
  });

  const values = {
    title: yamlSafe(video.title),
    rawTitle: video.title ?? '',
    safeTitle: String(video.title ?? video.videoId).replace(ILLEGAL_FILENAME, '').trim().slice(0, 120),
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
    shortUrl: `https://youtu.be/${video.videoId}`,
    videoId: video.videoId,
    channel: yamlSafe(video.channel),
    channelUrl: video.channelId ? `https://www.youtube.com/channel/${video.channelId}` : '',
    published: toIsoDate(video.publishDate),
    duration: formatDuration(video.lengthSeconds),
    durationSeconds: video.lengthSeconds ?? '',
    views: video.viewCount ?? '',
    thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/maxresdefault.jpg`,
    description: (video.description || '').trim() || '_설명 없음_',
    transcript,
    transcriptLang: video.transcriptLang || '',
    clippedAt: clippedAt.toISOString(),
    date: clippedAt.toISOString().slice(0, 10),
  };

  const filename = fillTemplate(settings.filenameTemplate, values)
    .replace(ILLEGAL_FILENAME, '')
    .replace(/\s+/g, ' ')
    .trim() || video.videoId;

  const folder = String(settings.noteFolder || '').replace(/^\/+|\/+$/g, '');

  return {
    path: folder ? `${folder}/${filename}.md` : `${filename}.md`,
    filename: `${filename}.md`,
    markdown: fillTemplate(settings.noteTemplate, values),
  };
}
