# SFT Data Dashboard

VLM(비전-언어 모델) SFT 학습 데이터를 한눈에 보는 팀 내부 대시보드입니다.

- **Superpack → Datapack → Dataset → Variant → Sample** 계층으로 데이터를 정리합니다.
- Excel Manifest(탭 = Superpack)를 가져오고, Datapack을 조합해 새 Superpack을 만듭니다.
- LLaVA 형식 대화 JSON을 색인해 샘플(Q/A + 이미지)을 탐색합니다.
- HuggingFace 데이터셋 링크를 LLaVA JSON + 이미지 폴더로 변환해 등록합니다.

개발 계획과 아키텍처는 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)에 있습니다.

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · SQLite · Python worker(`workers/`, HuggingFace 변환)

## 요구 사항

- Node.js 24 이상 (`nvm use 24`)
- Python 3.11 이상과 [uv](https://docs.astral.sh/uv/) (HF 변환 워커용)

## 시작하기

```bash
npm install
cp .env.example .env.local      # 경로·토큰 설정
npm run dev                     # http://localhost:3000
```

Python 워커:

```bash
cd workers && uv sync && uv run pytest
```

## 스크립트

| 명령                              | 설명                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                     | 개발 서버                                                   |
| `npm run build` / `npm start`     | 프로덕션 빌드·실행                                          |
| `npm run lint`                    | ESLint                                                      |
| `npm run typecheck`               | TypeScript 검사                                             |
| `npm run format` / `format:check` | Prettier                                                    |
| `npm test`                        | Vitest 유닛 테스트                                          |
| `npm run test:e2e`                | Playwright E2E (`npx playwright install chromium` 1회 필요) |

## 환경 변수

`.env.example`을 참고하세요. 핵심은 네 가지입니다.

- `PATH_PREFIX_FROM` / `PATH_PREFIX_TO`: Manifest의 `/group-volume/...` 경로를 현재 마운트 지점으로 치환
- `IMAGE_ROOT`: 샘플 `image` 필드의 기준 디렉터리
- `OUTPUT_ROOT`: HuggingFace 변환 결과 JSON 저장 위치
- `HF_TOKEN`: 비공개·gated 데이터셋용. 서버에서만 사용

## 디렉터리

```
src/app/          라우트 (개요, superpacks, datapacks, datasets, samples, import, settings)
src/components/   layout/, ui/(shadcn), 화면별 컴포넌트
src/lib/          nav, db, parsers, indexer, jobs, realtime (단계별로 추가)
workers/          Python HF 변환 워커 (uv 프로젝트)
data/samples/     개발용 픽스처 (manifest 예시, 대화 JSON 예시)
tests/            unit/ (Vitest), e2e/ (Playwright)
docs/             개발 계획
```
