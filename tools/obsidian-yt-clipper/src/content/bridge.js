/**
 * ISOLATED world content script.
 *
 * 확장(팝업/서비스 워커)과 MAIN world의 page.js 사이를 중계한다.
 * MAIN world에서는 chrome.* 를 쓸 수 없고, ISOLATED world에서는 페이지 전역을
 * 볼 수 없어서 이 다리가 필요하다.
 */
(() => {
  const OUT = 'yoc-bridge';
  const IN = 'yoc-page';
  const pending = new Map();
  let seq = 0;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (msg?.source !== IN) return;

    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    entry.resolve(msg.ok ? { ok: true, data: msg.data } : { ok: false, error: msg.error });
  });

  function callPage(action, payload, timeoutMs) {
    const id = `yoc-${Date.now()}-${(seq += 1)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, error: `페이지 응답 시간 초과 (${action})` });
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      window.postMessage({ source: OUT, id, action, payload }, location.origin);
    });
  }

  /** page.js는 document_idle에 주입되므로 준비될 때까지 짧게 폴링한다. */
  async function waitForPage(attempts = 20) {
    for (let i = 0; i < attempts; i += 1) {
      const res = await callPage('ping', {}, 500);
      if (res.ok) return true;
    }
    return false;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== 'content') return undefined;

    (async () => {
      if (!(await waitForPage())) {
        sendResponse({ ok: false, error: '페이지 스크립트가 준비되지 않았습니다. 탭을 새로고침해 주세요.' });
        return;
      }
      sendResponse(await callPage(message.action, message.payload, message.timeoutMs || 60000));
    })();

    return true; // 비동기 응답
  });
})();
