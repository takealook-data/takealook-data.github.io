"""새 글 md 파일들의 front matter를 읽어 FCM topic "new-post"로 data 메시지를 보낸다.

사용: send_fcm.py <added_files.txt>
환경: FCM_SERVICE_ACCOUNT_JSON — Firebase 서비스 계정 키 JSON 전문

data 페이로드 계약(앱 PushService와 동일):
  { "title": ..., "body": ..., "path": "/2026/07/lean-analytics/" }
"""
import json
import os
import re
import sys

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

TOPIC = "new-post"
MAX_NOTIFICATIONS = 3  # 한 push에 글이 몰려도 알림 폭탄은 만들지 않는다


def parse_front_matter(path):
    """단순 front matter 파서 — title / excerpt / permalink만 뽑는다."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = re.match(r"\A---\n(.*?)\n---", text, re.S)
    if not m:
        return {}
    fields = {}
    for key in ("title", "excerpt", "permalink"):
        km = re.search(rf"^{key}:\s*(.+)$", m.group(1), re.M)
        if km:
            fields[key] = km.group(1).strip().strip("\"'")
    return fields


def derive_path(md_path, fm):
    """글 URL 경로. front matter permalink 우선, 없으면 파일명에서 사이트 규칙대로 만든다.

    _config.yml: permalink: /:year/:month/:title/  (컬렉션에도 동일 적용 — 라이브 URL로 확인)
    예: _posts/2026-06-07-google-ai-agent-trends-2026.md → /2026/06/google-ai-agent-trends-2026/
    """
    if fm.get("permalink"):
        return fm["permalink"]
    name = os.path.basename(md_path)
    m = re.match(r"(\d{4})-(\d{2})-\d{2}-(.+)\.md$", name)
    if m:
        return f"/{m.group(1)}/{m.group(2)}/{m.group(3)}/"
    return "/"


def main():
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["FCM_SERVICE_ACCOUNT_JSON"]),
        scopes=["https://www.googleapis.com/auth/firebase.messaging"],
    )
    creds.refresh(Request())
    endpoint = f"https://fcm.googleapis.com/v1/projects/{creds.project_id}/messages:send"
    headers = {"Authorization": f"Bearer {creds.token}"}

    with open(sys.argv[1], encoding="utf-8") as f:
        files = [line.strip() for line in f if line.strip()]

    for path in files[:MAX_NOTIFICATIONS]:
        fm = parse_front_matter(path)
        if not fm.get("title"):
            print(f"skip (title 없음): {path}")
            continue
        message = {
            "message": {
                "topic": TOPIC,
                "data": {
                    "title": fm["title"],
                    "body": fm.get("excerpt", "새 글이 올라왔어요"),
                    "path": derive_path(path, fm),
                },
                "android": {"priority": "high"},
            }
        }
        r = requests.post(endpoint, headers=headers, json=message, timeout=30)
        # 실패해도 응답 본문은 찍지 않는다 — 로그는 PUBLIC 레포에서 누구나 본다
        print(f"{path} → HTTP {r.status_code}")
        r.raise_for_status()

    skipped = len(files) - min(len(files), MAX_NOTIFICATIONS)
    if skipped:
        print(f"{skipped}건은 알림 상한({MAX_NOTIFICATIONS})으로 생략")


if __name__ == "__main__":
    main()
