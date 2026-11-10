# SFT Data Dashboard

VLM(비전-언어 모델) SFT 학습 데이터를 한눈에 보고 다루는 팀 내부 대시보드입니다.

- **Superpack → Datapack → Dataset → Variant → Sample** 계층으로 데이터를 정리합니다.
- Excel Manifest(탭 = Superpack)를 가져오고, Datapack을 조합해 새 Superpack을 만들고, MX weight를 편집해 Excel/JSON으로 내보냅니다.
- LLaVA 형식 대화 JSON을 스트리밍으로 색인해 샘플(Q/A + 이미지)을 탐색합니다. 마크다운·KaTeX 렌더링, 전문 검색, 키보드 이동.
- HuggingFace 데이터셋 링크를 LLaVA JSON + 이미지 폴더로 변환해 Dataset으로 등록합니다.
- LLaMA-Factory 실험 디렉터리를 스캔해 `dataset_info.json`과 학습 YAML을 찾고, 실험(설정)마다 어떤 JSON/JSONL 데이터를 썼는지 정리합니다.
- Datapack/Dataset에 자유 형식 태그, ⌘K 전역 검색, SSE 실시간 갱신, 파일 변경 감시.

개발 계획과 아키텍처는 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)에 있습니다.

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Recharts · TanStack Table
· SQLite via `node:sqlite` (FTS5, 네이티브 빌드 없음) · stream-json · sharp · Python 3.11 워커(`workers/`, uv)

## 요구 사항

- Node.js 24 이상 (`nvm use 24`)
- Python 3.11 이상과 [uv](https://docs.astral.sh/uv/) — HuggingFace 변환 워커용 (없어도 대시보드 나머지는 동작)

## 시작하기 (개발)

```bash
npm install
cp .env.example .env.local        # 경로·토큰 설정 (아래 참고)
cd workers && uv sync && cd ..    # Python 워커 (선택)
npm run dev                       # http://localhost:3000
```

실제 데이터 볼륨 없이 써 보려면 로컬 데모 데이터를 만듭니다.

```bash
node scripts/make-demo-data.mjs --samples 300
```

그다음 `.env.local`에 `IMAGE_ROOT=<리포 절대경로>/data/samples/demo/images`, `OUTPUT_ROOT=<리포 절대경로>/data/hf_out`을 넣고
가져오기 화면에서 `data/samples/manifest_local_demo.tsv`를 올린 뒤 Dataset 상세에서 **색인**을 누르면 샘플 탐색기가 채워집니다.

## 사용 흐름

1. **가져오기 › Excel Manifest**: xlsx(탭마다 Superpack) 또는 csv/tsv를 올립니다. 미리보기에서 신규/갱신·충돌을 확인하고 적용합니다.
   같은 Dataset의 variant 경로가 기존과 다르면 충돌로 표시되고, "덮어쓰기"를 켠 경우에만 바뀝니다.
2. **개요**: Superpack을 고르면 KPI(Datapack/Dataset/총 샘플/학습 샘플/MX(1)/MX(2))와 Category별 variant 누적 막대, Datapack·언어 비율이 보입니다. 필터는 URL에 저장됩니다.
3. **Dataset 상세 › 색인**: variant의 JSON을 SQLite에 스트리밍 색인합니다. 진행률은 가져오기 › 작업 탭과 헤더에 실시간으로 표시됩니다.
4. **샘플**: variant를 고르고 썸네일/리스트에서 샘플을 클릭하면 이미지와 대화(system/human/gpt)가 열립니다. ← → 로 이동, 무작위, 전문 검색, 같은 id의 다른 variant로 점프.
5. **Superpack › 새 Superpack**: Datapack을 골라 믹스를 만들고 MX weight를 편집한 뒤 Excel(Manifest 형식) 또는 JSON으로 내보냅니다.
6. **가져오기 › HuggingFace**: 링크 조회 → 필드 매핑(자동 추천) → 옵션 → 변환. 완료되면 Dataset(source=hf)이 등록되고 바로 색인됩니다.
7. **태그**: Datapack/Dataset 상세에서 추가·삭제. 모든 목록의 필터와 ⌘K 검색에서 쓸 수 있습니다.
8. **실험**: 루트 디렉터리(예: `.../Gauss4/scripts/training`)를 입력하고 **스캔**합니다.
   - 하위의 모든 `dataset_info.json`을 읽어 항목의 `file_name`(JSON 배열 또는 JSONL)을 Dataset(source=file, Datapack = 파일이 있는 폴더)으로 등록합니다.
     `formatting`(sharegpt/alpaca), `columns`, `tags`, `ranking`을 그대로 따라 대화로 변환해 색인합니다. 상대 경로는 dataset_info.json 폴더 기준입니다.
   - `dataset:`/`eval_dataset:` 키가 있는 YAML을 학습 설정으로 보고, `dataset_dir`(YAML 폴더 기준) 또는 가장 가까운 상위 폴더의 dataset_info.json에서 키를 찾습니다.
   - 실험 화면은 폴더별로 설정을 묶어 학습 데이터(키별 샘플 수·없는 파일·등록 안 된 키), 모델, template, cutoff, lr, epoch를 보여 줍니다. 설정 상세에서 전체 YAML과 레지스트리 항목을 봅니다.
   - Dataset 상세의 **사용한 실험**에서 반대로 그 파일을 쓴 설정을 볼 수 있습니다. **데이터 모두 색인**으로 루트·실험 단위 일괄 색인.
   - 다시 스캔하면 설정은 제자리에서 갱신되고, 경로·형식이 같은 파일의 색인은 유지됩니다. 체크포인트·`runs`·숨김 폴더는 탐색하지 않습니다.

## 환경 변수

`.env.example`에 전체 목록이 있습니다. 핵심:

| 변수                                  | 의미                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `DATA_DIR`                            | SQLite(`app.db`), 썸네일 캐시, 작업 파일 저장 위치 (기본 `./data`)        |
| `PATH_PREFIX_FROM` / `PATH_PREFIX_TO` | Manifest의 `/group-volume/...` 경로를 현재 마운트 지점으로 치환           |
| `IMAGE_ROOT`                          | 샘플 `image` 필드의 기준 디렉터리 (`.../finetune/image_folder`)           |
| `OUTPUT_ROOT`                         | HuggingFace 변환 JSON 저장 위치. 이미지는 `IMAGE_ROOT/hf_imports/<이름>/` |
| `HF_TOKEN`                            | 비공개·gated 데이터셋용. 서버에서만 사용하며 브라우저로 내려가지 않음     |
| `PYTHON_BIN`                          | 워커 인터프리터 (기본 `./workers/.venv/bin/python`)                       |
| `MANIFEST_PATH`                       | (선택) 서버의 Manifest 파일을 감시해 변경 시 알림                         |
| `STALE_CHECK_MS` / `AUTO_REINDEX`     | 색인된 JSON의 변경 감지 주기와 자동 재색인 여부                           |

## 스크립트

| 명령                                                    | 설명                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                           | 개발 서버                                                                                                                                                                                         |
| `npm run build` / `npm start`                           | 프로덕션 빌드(standalone)·실행                                                                                                                                                                    |
| `npm run lint` / `npm run typecheck` / `npm run format` | ESLint / TypeScript / Prettier                                                                                                                                                                    |
| `npm test`                                              | Vitest 유닛 테스트 (파서, 가져오기, Superpack, 색인, 샘플 쿼리, HF 헬퍼)                                                                                                                          |
| `npm run test:e2e`                                      | Playwright E2E (`npx playwright install chromium` 1회 필요. Playwright가 Chromium을 지원하지 않는 OS(macOS 13 등)에서는 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`로 설치된 Google Chrome 사용) |
| `npm run worker:test`                                   | Python 워커 pytest                                                                                                                                                                                |
| `node scripts/make-demo-data.mjs`                       | 로컬 데모 데이터 생성                                                                                                                                                                             |

## 배포 (Docker)

```bash
docker compose up -d --build
```

- `/group-volume`을 같은 경로로 마운트하므로 Manifest 경로를 그대로 씁니다. 다른 곳에 마운트하면 `PATH_PREFIX_TO`를 바꾸세요.
- HF 변환 결과를 볼륨에 쓰므로 읽기 전용으로 마운트하지 않습니다.
- `dashboard-data` 볼륨에 SQLite·썸네일·HF 다운로드 캐시가 쌓입니다.
- 헬스체크: `GET /api/health`.
- **인증이 없습니다.** 내부망/VPN 뒤에 두거나 리버스 프록시에서 접근을 제한하세요.

## API 요약

| 경로                                                                                     | 설명                                                                   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/import/excel`                                                                 | Manifest 미리보기/적용 (multipart: file, mode, overwrite)              |
| `GET/POST /api/superpacks`, `GET/PATCH/DELETE /api/superpacks/:id`                       | Superpack 조회·생성·구성/가중치 수정·삭제                              |
| `POST /api/superpacks/:id/duplicate`, `GET /api/superpacks/:id/export?format=xlsx\|json` | 복제, 내보내기                                                         |
| `GET/POST/DELETE /api/taggings`                                                          | 태그 조회·추가·삭제                                                    |
| `POST /api/index`                                                                        | variant/dataset/datapack/superpack/experiment/root 범위 색인 작업 큐잉 |
| `GET/POST /api/experiments/roots`, `POST/DELETE /api/experiments/roots/:id`              | 실험 루트 목록·등록+스캔, 다시 스캔·삭제                               |
| `GET /api/jobs`, `POST /api/jobs/:id/cancel`                                             | 작업 목록, 취소                                                        |
| `GET /api/samples`, `GET /api/samples/:id`                                               | 샘플 목록(필터·검색·페이지·random=1), 상세                             |
| `GET /api/images/<path>?w=256`                                                           | IMAGE_ROOT 하위 이미지 원본/썸네일                                     |
| `POST /api/hf/inspect`, `POST /api/hf/import`                                            | HF 스키마 조회, 변환 작업 큐잉                                         |
| `GET /api/search?q=`                                                                     | 전역 검색                                                              |
| `GET /api/events`                                                                        | SSE (데이터 변경, 작업 진행률)                                         |
| `GET /api/health`                                                                        | 헬스체크                                                               |

## 디렉터리

```
src/app/             라우트 (개요, superpacks, datapacks, datasets, samples, import, settings, api/*)
src/components/      layout, overview, charts, datasets, superpacks, samples, import, jobs, tags, search, realtime, ui(shadcn)
src/lib/db           node:sqlite 클라이언트·마이그레이션
src/lib/manifest     Excel/TSV 파서, 헤더 정규화, 가져오기(충돌 감지)
src/lib/queries      overview, datapacks, datasets, superpacks, samples, tags, search
src/lib/indexer      LLaVA JSON 스트리밍 색인
src/lib/jobs         작업 큐·핸들러
src/lib/hf           Python 워커 실행, HF 가져오기 작업
src/lib/realtime     이벤트 버스, 감시자
workers/             Python HF 변환 워커 (uv 프로젝트)
scripts/             데모 데이터 생성
data/samples/        픽스처 (manifest 예시, 대화 JSON 예시)
tests/unit, tests/e2e
docs/                개발 계획
```
