# ClientFlow

고객별 자료 요청과 제출 상태, 마감일을 한곳에서 관리하는 웹서비스입니다.

배포 주소: [https://clientflow.sadyj.workers.dev](https://clientflow.sadyj.workers.dev)

## 주요 기능

- **대시보드**
  - 고객별 진행률과 마감 확인이 필요한 고객을 확인합니다.
  - 오늘 마감인 자료와 지연된 자료를 따로 확인합니다.
  - 고객은 마감일 지남, 오늘 마감, 진행 중, 완료 순으로 표시합니다.
- **고객 관리**
  - 고객 이름과 메모를 추가, 수정, 삭제합니다.
  - 고객 이름으로 목록을 검색하고 가나다순으로 확인합니다.
  - CSV 또는 엑셀 파일로 고객과 자료 요청을 가져옵니다.
  - CSV 입력용 템플릿을 다운로드합니다.
- **자료 요청 관리**
  - 고객별 자료 이름, 메모, 마감일을 등록하고 수정하거나 삭제합니다.
  - 제출 상태를 요청 전, 요청함, 제출 완료로 관리합니다.
  - 마감일까지 남은 날짜, 오늘 마감, 지연 여부를 확인합니다.
- **자료 일괄 등록**
  - 자주 요청하는 자료를 카테고리로 저장합니다.
  - 저장한 카테고리를 선택한 고객에게 한 번에 등록합니다.
- **AI 요청문 만들기**
  - 아직 제출되지 않은 자료를 바탕으로 고객에게 보낼 요청문 초안을 만듭니다.
  - 만든 초안은 수정하거나 복사할 수 있습니다.

## 사용 기술

- React + TypeScript
- Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Workers AI

## 로컬에서 실행하기

```bash
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173)을 엽니다.

## 확인하기

아래 명령은 타입 검사, 화면 빌드, 배포 전 확인을 한 번에 실행합니다.

```bash
npm run check
```

## 운영 환경에 배포하기

DB 구조가 바뀌었으면 먼저 운영 DB에 마이그레이션을 적용합니다.

```bash
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

## 프로젝트 구조

```text
src/App.tsx       화면과 사용자 동작
src/App.css       화면 스타일
worker/index.ts   Cloudflare Workers API
migrations/       D1 데이터베이스 변경 기록
wrangler.json     Workers와 D1 연결 설정
```

## 참고

- 운영 DB에 개발 데이터를 옮길 때는 먼저 운영 데이터를 확인한 뒤 데이터만 가져옵니다.
- 이 서비스는 로그인, 실제 문자·이메일 발송, 결제 기능을 포함하지 않습니다.
