# VLM SFT Data Dashboard 개발 계획

작성일: 2026-11-09 (5차 수정 — 확정 사항·ViRL39K 스키마 반영)

## 1. 데이터 구조 (확인된 사실)

### 1-1. 계층: Superpack → Datapack → Dataset → Variant → Sample

```
Superpack  (= Excel 탭 하나. 학습 데이터 믹스 하나. 예: base+added+mmoth+intvl)
 └─ Datapack  (= 행의 Datapack 컬럼 값. 예: base, added, mmoth, intvl)
     └─ Dataset  (= 행 하나. 예: ShareGPT4o, LVIS (OCR))
         └─ Variant  (longer / longans / shortans: JSON 경로 + 샘플 수 + sft weight)
             └─ Sample  (JSON 배열의 원소 하나: id, image, conversations)
```

- **같은 Datapack이 여러 Superpack에 포함될 수 있다.** 그래서 Datapack마다 "어느 Superpack에 들어 있는지"를 보여줘야 한다.
- **Superpack은 사용자가 Datapack을 골라 새로 만들 수 있다.** (Excel 없이 대시보드에서 조합)
- MX weight (1)/(2)는 **Superpack 안에서 Dataset(행)마다 다른 값**이다. (확정)
- 같은 Dataset이 여러 탭에 있을 때 variant 경로·샘플 수가 항상 같은지는 **미확인** → 가져오기 시 충돌 감지로 대응

### 1-2. Manifest Excel

- 탭(시트) 하나 = Superpack 하나. 시트 이름이 Superpack 이름.
- 각 시트의 행 = Dataset. 컬럼은 아래 표. 예시: `data/samples/manifest_example.tsv`, 헤더 정규화 매핑: `data/samples/manifest_header_mapping.json`

| 그룹        | 컬럼                                                                   | 의미                                   |
| ----------- | ---------------------------------------------------------------------- | -------------------------------------- |
| 분류        | Datapack, Category, Sub-category, 언어, Dataset                        | 식별·분류 축                           |
| 원본        | orign json                                                             | 가공 전 JSON 파일명                    |
| Variant ×3  | longer / longans / shortans 각각 `json path`, `# sample`, `sft weight` | 빈 경로면 해당 variant 없음            |
| 믹스 가중치 | MX weight (1), MX weight (2)                                           | Superpack 내 믹스 비율 두 시나리오     |
| 집계        | # samples in total / training / MX weight / MX weight (2)              | 파생 수치 (대시보드에서 재계산해 검증) |
| 기타        | 비고                                                                   | 자유 텍스트                            |

JSON 경로는 `/group-volume/lit/data/sr-llava/finetune/json/...` 형태의 서버 마운트 절대 경로.
**이미지 루트는 `/group-volume/lit/data/sr-llava/finetune/image_folder`** (확정). 샘플의 `image`는 이 폴더 기준 상대 경로.

### 1-3. 샘플 JSON (LLaVA 대화 형식)

예시: `data/samples/conversation_example.json`

- 샘플 객체 배열. `id`, `image`(이미지 루트 기준 상대 경로), `conversations[]`(`from`: system|human|gpt, `value`)
- 멀티턴, `<|image|>` 토큰이 이미지 위치, 답변에 마크다운 + LaTeX(`\boxed{}`)
- 파일당 수만~수십만 샘플 → 스트리밍 파싱 필수

## 2. 요구사항 요약

| #   | 기능                 | 설명                                                                                                                                                         |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | 개요 대시보드        | Superpack 선택 → KPI·차트. Datapack / Category / Sub-category / 언어 / variant / 태그 필터                                                                   |
| B   | Superpack 관리       | Excel 가져오기(탭 → Superpack). **Datapack을 골라 새 Superpack 생성**, 가중치 편집, Excel/JSON으로 내보내기                                                  |
| C   | Datapack 목록·상세   | 포함된 Dataset, **소속 Superpack 목록 표기**, 태그                                                                                                           |
| D   | Dataset 테이블·상세  | Manifest 컬럼 테이블, variant별 경로·수치·색인 상태                                                                                                          |
| E   | 샘플 탐색기          | Dataset·variant 선택 → 샘플 목록 → 클릭 → 대화(Q/A) + 이미지 상세                                                                                            |
| F   | HuggingFace 가져오기 | **HF 데이터셋 링크 입력 → LLaVA JSON + 이미지 폴더로 변환** → Dataset으로 등록                                                                               |
| G   | 태그                 | 사용자가 Datapack·Dataset에 태그 추가/삭제, 태그로 필터                                                                                                      |
| H   | 실시간 갱신          | 파일 변경·색인 완료·태그 변경 시 열린 브라우저 자동 갱신                                                                                                     |
| I   | 전역 검색            | 상단 검색창(⌘K 커맨드 팔레트)에서 Superpack·Datapack·Dataset·태그·샘플(FTS)을 한 번에 검색, 결과 클릭 시 해당 화면으로 이동. 각 목록 화면에도 자체 검색·필터 |
| —   | 인증                 | 없음 (내부망)                                                                                                                                                |

## 3. 기술 스택

| 영역             | 선택                                                                      | 이유                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 프레임워크       | Next.js 15 (App Router), React 19, TypeScript                             | 프론트 + API 한 저장소                                                                                                                                       |
| UI               | Tailwind CSS, shadcn/ui                                                   | 대시보드 컴포넌트, 멀티셀렉트·커맨드 팔레트                                                                                                                  |
| 차트             | Recharts                                                                  | 스택 막대·비율·분포                                                                                                                                          |
| 테이블           | TanStack Table + Virtual                                                  | 가상 스크롤                                                                                                                                                  |
| Excel            | SheetJS                                                                   | 다중 시트 읽기·쓰기(내보내기)                                                                                                                                |
| JSON 스트리밍    | stream-json                                                               | 대용량 배열 순회                                                                                                                                             |
| 저장소           | SQLite (better-sqlite3) + Drizzle ORM, FTS5                               | 단일 파일, 설치 불필요                                                                                                                                       |
| 이미지           | Route Handler 스트리밍 + sharp 썸네일                                     | 루트 밖 접근 차단                                                                                                                                            |
| 텍스트           | react-markdown, remark-math, rehype-katex, rehype-highlight               | 마크다운 + 수식 + 코드                                                                                                                                       |
| 작업 큐          | 서버 내 큐(p-queue) + jobs 테이블 + 진행률 SSE                            | 색인·HF 변환을 요청과 분리                                                                                                                                   |
| **HF 변환 워커** | **Python 3.11 + `datasets` + `huggingface_hub` + Pillow**                 | HF 데이터셋 스키마가 제각각(이미지 bytes/URL/경로, 필드명)이라 `datasets` 라이브러리가 가장 견고. Next.js가 child_process로 실행, 진행률은 stdout JSON lines |
| 실시간           | SSE + chokidar                                                            |                                                                                                                                                              |
| 테스트           | Vitest, Playwright, pytest(워커)                                          |                                                                                                                                                              |
| 배포             | Docker (Node + Python 한 이미지) + docker-compose, `/group-volume` 마운트 |                                                                                                                                                              |

## 4. 아키텍처

```
[브라우저]
  /                      개요 (Superpack 선택기 + 필터 + KPI + 차트)
  /superpacks            목록 → /superpacks/[id] 구성(Datapack 추가/제거, 가중치 편집, 내보내기), /superpacks/new
  /datapacks             목록(소속 Superpack 배지, 태그) → /datapacks/[id]
  /datasets              테이블 → /datasets/[id] (variant 카드, 색인 상태, 태그)
  /samples               탐색기 → 상세 패널 (대화 + 이미지)
  /import                Excel 가져오기 / HF 가져오기 마법사 / 작업 현황
  /settings              경로 재매핑, 이미지 루트, 출력 루트
  EventSource → /api/events

[Next.js 서버]
  /api/import/excel      다중 시트 파싱 → superpacks/datapacks/datasets/variants/memberships upsert
  /api/import/hf         HF 링크 검사(스키마 미리보기) → 필드 매핑 → 변환 작업 시작
  /api/superpacks        CRUD, 구성 변경, 가중치, /export (xlsx|json)
  /api/datapacks         목록·상세(소속 superpacks 포함), 태그
  /api/datasets          목록·상세, 태그
  /api/tags              태그 CRUD, 자동완성
  /api/search            전역 검색: 이름·카테고리·태그·경로(LIKE) + 샘플(FTS) 통합 결과
  /api/stats             Superpack·필터 기준 집계
  /api/samples           목록·검색·상세
  /api/images/[...path]  스트리밍·썸네일
  /api/jobs              작업 목록·상태·취소
  /api/events            SSE
  jobs/indexer           stream-json → samples 배치 insert
  jobs/hf-import         child_process: python workers/hf_import.py --repo ... --mapping ... --out ...
  watcher                Manifest·JSON mtime 감시

[Python 워커]  workers/hf_import.py
  load_dataset(repo, config, split, streaming=True) → 필드 매핑 적용 → 이미지 저장(jpg/png) →
  LLaVA JSON 기록 → 진행률 JSON lines 출력 → 완료 시 샘플 수·경로 보고

[저장소]
  data/app.db   data/thumbs/   data/exports/
  OUTPUT_ROOT/<dataset>/{dataset.json, images/}    HF 변환 결과
  /group-volume/... (읽기 전용 마운트)              기존 JSON·이미지
```

### 데이터 모델

- `superpacks`: id, name, source(`excel`|`user`), description, created_at, updated_at
- `datapacks`: id, name, description, created_at
- `datasets`: id, datapack_id, name, category, sub_category, language, origin_json, note, source(`excel`|`hf`), hf_repo(nullable)
- `variants`: id, dataset_id, kind(`longer`|`longans`|`shortans`|`default`), json_path, n_samples_manifest, sft_weight, index_status, n_samples_indexed, indexed_at, file_mtime
- `superpack_datapacks`: superpack_id, datapack_id, position — **소속 관계**
- `superpack_dataset_weights`: superpack_id, dataset_id, mx_weight_1, mx_weight_2, sft_weight_override(JSON, nullable) — Superpack별 가중치
- `tags`: id, name(자유 형식, 예: `filtered`, `v2-candidate`), color
- `taggings`: tag_id, target_type(`datapack`|`dataset`), target_id, created_by(nullable), created_at
- `samples`: id, variant_id, sample_id, image_paths(JSON 배열), n_images, n_turns, has_system, first_question, first_answer_preview, q_chars, a_chars, meta(JSON: HF 보존 컬럼 등), conversations(JSON)
- `samples_fts`: FTS5(first_question, answer_text)
- `jobs`: id, type(`index`|`hf_import`|`excel_import`), status, progress, message, payload(JSON), result(JSON), created_at, finished_at

> HF로 만든 Dataset은 variant 하나(`default`)로 등록하고, 이후 사용자가 Datapack에 넣고 Superpack에 포함시킨다.

### Excel 가져오기 규칙

1. 시트마다 Superpack upsert (이름 기준)
2. 행마다 Datapack upsert(이름), Dataset upsert(**datapack + dataset 이름** 기준), variant upsert
3. `superpack_datapacks`에 소속 추가, `superpack_dataset_weights`에 그 시트의 MX weight 기록
4. 같은 Dataset이 다른 시트에서 variant 경로가 다르면 **충돌 경고** 목록에 표시 (덮어쓰기/무시 선택)
5. 집계 컬럼(# samples in total 등)은 저장하되 대시보드에서 재계산 값과 비교해 불일치 표시

### HF 가져오기 흐름

#### 기준 예시: `TIGER-Lab/ViRL39K` (실제 스키마 확인함)

- 저장소 파일: `39Krelease.parquet`, `images.zip`, `README.md` — 이미지가 parquet 안에 bytes로 있지 않고 **별도 zip**에 있음
- 행 구조:
  ```json
  {
    "question": "<image>\nIs the dotted line a line of symmetry?\nChoices:\n(A) yes\n(B) no",
    "answer": "\\boxed{A}",
    "image": ["images/Processed-0430e208-....jpg"],
    "category": "(GradeSchool) Geometric",
    "source": "Processed",
    "qid": "Processed-0430e208-...",
    "PassRate_32BTrained": 0.1875,
    "PassRate_7BBase": -1.0
  }
  ```
- 시사점: ① 이미지 토큰이 `<image>`(우리 포맷은 `<|image|>`) → 토큰 정규화 필요 ② `image`가 **리스트** → 다중 이미지 처리 ③ 이미지 경로는 zip 내부 상대 경로 → zip을 받아 풀어야 함 ④ `category`·`PassRate` 같은 메타는 보존해 필터·태그에 활용(예: PassRate 기준 "filtered" 세트 만들기)

#### 단계

1. **링크 입력** (`https://huggingface.co/datasets/org/name` 또는 `org/name`) → `hf_inspect.py`가 `huggingface_hub`로 파일 목록·config·split·features·미리보기 5행 조회
2. **이미지 소스 자동 판별**: (a) 이미지 컬럼이 bytes/PIL → 파일로 저장 (b) 컬럼이 URL → 다운로드 (c) 컬럼이 상대 경로 + 저장소에 zip/폴더 존재 → **`hf download --repo-type dataset`으로 받아 해제** 후 경로 매칭 (ViRL39K 케이스)
3. **필드 매핑 UI**: question, answer, image(단일/리스트), system prompt(선택), 멀티턴 대화 컬럼(선택), 보존할 메타 컬럼(체크박스). 자동 추천: `question|prompt|instruction|query`, `answer|response|output|solution`, `image|img|images`
4. **옵션**: split, 최대 샘플 수, 이미지 토큰 정규화(`<image>` → `<|image|>`, 토큰 없으면 첫 human 턴 앞에 삽입), 다중 이미지 처리(첫 장만 / 모두: `<|image|>` N개), 이미지 포맷 통일(jpg), 출력 이름
5. **실행**: `hf_import.py`가 parquet을 스트리밍 순회 → 이미지를 `IMAGE_ROOT/<dataset_name>/...`에 저장 → LLaVA JSON을 `OUTPUT_ROOT/<dataset_name>.json`에 기록 (`id`=qid 또는 연번, `meta`에 보존 컬럼) → 진행률 JSON lines
6. **등록**: Dataset(source=`hf`, hf_repo) + variant `default` 생성, 자동 색인 → Datapack 지정(기존/새로) → Superpack에 포함 가능
7. **출력 위치**: `/group-volume` 아래 쓰기 가능(확정). 기본값 `OUTPUT_ROOT=/group-volume/lit/data/sr-llava/finetune/json/hf_imports`, 이미지는 `IMAGE_ROOT/hf_imports/<dataset_name>/` (JSON의 `image` 경로는 image_folder 기준 상대 경로로 기록)

#### HF 토큰

- 서버 환경변수 `HF_TOKEN` 하나로 통일. 워커 시작 시 `huggingface_hub.login(token)` 및 `hf` CLI 환경변수(`HF_TOKEN`)에 전달 → 비공개·gated 데이터셋도 추가 설정 없이 동작
- 설정 화면에서 토큰 유효성 확인(`whoami`) 버튼. 토큰 값은 브라우저로 내려보내지 않음
- `hf` CLI(`huggingface_hub[cli]`)를 Docker 이미지에 포함

### 경로 재매핑

`PATH_PREFIX_FROM=/group-volume`, `PATH_PREFIX_TO=/mnt/gv` 환경변수로 접두어 치환. 이미지는 `IMAGE_ROOT` 기준. HF 결과물은 `OUTPUT_ROOT` 아래.

### 디렉터리 구조

```
src/
  app/
    page.tsx
    superpacks/  page.tsx  new/page.tsx  [id]/page.tsx
    datapacks/   page.tsx  [id]/page.tsx
    datasets/    page.tsx  [id]/page.tsx
    samples/     page.tsx  [id]/page.tsx
    import/      page.tsx  (탭: Excel / HuggingFace / 작업)
    settings/    page.tsx
    api/...
  components/
    overview/    SuperpackPicker, FilterBar, KpiCard, CategoryStackBar, DatapackShare, WeightTable
    superpacks/  SuperpackComposer(Datapack 멀티셀렉트·순서), WeightEditor, ExportMenu
    datapacks/   DatapackTable, DatapackDetail, SuperpackBadges
    datasets/    DatasetTable, DatasetDetail, VariantCard, IndexStatus
    samples/     SampleGrid, SampleDetail, ConversationView, TurnBubble, ImageViewer
    import/      ExcelDropzone, SheetPreview, ConflictList, HfWizard(Step1 링크, Step2 매핑, Step3 옵션), JobList
    tags/        TagChip, TagPicker(자동완성·새 태그 생성), TagFilter
    search/      GlobalSearch(⌘K 팔레트), SearchResultItem
    ui/
  lib/
    db/          schema.ts, client.ts, queries/
    manifest/    parseExcel.ts (다중 시트), normalize.ts, conflicts.ts
    superpack/   compose.ts, stats.ts, export.ts
    indexer/     stream.ts, job.ts
    jobs/        queue.ts, runner.ts, pythonRunner.ts
    hf/          inspect.ts (워커 호출), mapping.ts (자동 추천)
    images/      resolve.ts, thumbnail.ts
    realtime/    bus.ts, watcher.ts
    markdown/    renderer.tsx
workers/
  hf_import.py  hf_inspect.py  requirements.txt  tests/
data/samples/   픽스처
tests/
```

## 5. 개발 단계

### Phase 0 — 셋업 (0.5일)

- [x] create-next-app(TS, Tailwind, App Router, src/), shadcn/ui, ESLint/Prettier/Husky, Vitest, Playwright
- [x] 레이아웃 + 사이드 네비(개요 / Superpack / Datapack / Dataset / 샘플 / 가져오기 / 설정)
- [x] Python 워커 뼈대(`workers/`, requirements, pytest 1개), `.env.example`

**완료**: 모든 페이지가 빈 상태로 뜨고 `npm test`, `pytest` 통과. ✅ 2026-11-09 완료 (Next.js 16.4, Tailwind 4, shadcn base-nova, Vitest 5, Playwright, uv/Python 3.11)

### Phase 1 — Excel 가져오기 + 계층 모델 + 개요 (2일)

- [ ] 스키마: superpacks, datapacks, datasets, variants, superpack_datapacks, superpack_dataset_weights, jobs
- [ ] 다중 시트 파서, 헤더 정규화, 빈 경로 처리, 쉼표 포함 Category
- [ ] `/api/import/excel`: 가져오기 규칙(4-절) 구현, 충돌 목록 반환, 미리보기(적용 전 시트별 요약)
- [ ] `/api/stats`: Superpack 기준 집계 + 필터
- [ ] 개요: SuperpackPicker, KPI(Datapack 수, Dataset 수, 총 샘플, 학습 샘플, MX1/MX2 샘플), 차트(Category 스택 막대 variant 구분, Datapack 비율, 언어 비율, 가중치 표)
- [ ] 테스트: 예시 TSV + 2시트 xlsx 픽스처, 같은 Datapack이 두 시트에 있는 케이스

**완료**: 다중 시트 Excel을 올리면 Superpack별 개요가 보이고 수치가 Manifest와 일치한다.

### Phase 2 — Datapack · Dataset 화면 + 태그 (1.5일)

- [ ] `/datapacks`: 테이블(이름, Dataset 수, 총 샘플, **소속 Superpack 배지**, 태그), 상세(Dataset 목록, Superpack 목록, 태그 편집)
- [ ] `/datasets`: 가상 스크롤 테이블, 정렬·검색·컬럼 토글, 내보내기. 상세: 분류, variant 카드 3종, Superpack별 가중치 표, Manifest vs 색인 수치, 태그
- [ ] 태그: tags/taggings 스키마, `/api/tags`, TagPicker(자동완성·새 태그·색상), TagChip, 모든 목록·개요 FilterBar에 태그 필터
- [ ] 개요 차트 클릭 → 해당 조건으로 Dataset 테이블 이동
- [ ] 전역 검색: `/api/search` + ⌘K 커맨드 팔레트(shadcn Command). Superpack·Datapack·Dataset·태그를 이름·카테고리·경로로 검색, 샘플 FTS 결과는 Phase 5에서 연결

**완료**: Datapack마다 어떤 Superpack에 속하는지 보이고, 태그를 달고 태그로 필터링된다.

### Phase 3 — Superpack 구성·편집·내보내기 (1.5일)

- [ ] `/superpacks/new`: 이름 + Datapack 멀티셀렉트(검색, 태그 필터, 선택 즉시 샘플 수·Dataset 수 미리보기)
- [ ] `/superpacks/[id]`: Datapack 추가/제거·순서, Dataset별 MX weight 편집(기본값 = 해당 Dataset의 다른 Superpack 값 또는 1), 집계 자동 재계산
- [ ] 내보내기: xlsx(Manifest와 같은 컬럼 구조, 시트 1개), JSON(학습 스크립트용 경로+가중치 목록)
- [ ] Excel에서 온 Superpack도 편집 가능하되 `source=excel` 표시, 복제해서 새로 만들기
- [ ] 테스트: 구성 변경 시 집계, 내보낸 xlsx를 다시 가져오면 동일

**완료**: Datapack을 골라 새 Superpack을 만들고 Excel로 내보낼 수 있다.

### Phase 4 — 샘플 색인 (1.5일)

- [ ] stream-json 스트리밍 → 1,000건 배치 insert, 파생 필드(n_turns, 길이, 미리보기, 이미지 유무), FTS
- [ ] jobs 큐(동시 1~2), 진행률 SSE, 취소, 에러 기록(파일 없음·JSON 깨짐)
- [ ] `/import` 작업 탭: 진행률·로그, Dataset 상세에서 variant별 색인 버튼, Superpack 단위 일괄 색인
- [ ] 테스트: 예시 JSON, 깨진 JSON, 경로 재매핑

**완료**: 10만 샘플 JSON을 메모리 급증 없이 색인하고 진행률이 실시간으로 보인다.

### Phase 5 — 샘플 탐색기 (2일)

- [ ] `/api/samples`: Dataset·variant·Superpack 필터, FTS, 턴 수/길이 범위, 이미지 유무, 커서 페이지네이션, 무작위
- [ ] SampleGrid(썸네일/리스트 토글), SampleDetail(이미지 뷰어, ConversationView 말풍선, 마크다운+KaTeX+코드, raw 토글, 메타, JSON 복사)
- [ ] 이전/다음(← →), 무작위, 같은 id의 다른 variant로 점프
- [ ] 썸네일 `?w=256` sharp 캐시, 누락 이미지 플레이스홀더

**완료**: 샘플 클릭 → 이미지와 멀티턴 Q/A, 수식 렌더링, 화살표 이동.

### Phase 6 — HuggingFace 가져오기 (2.5일)

- [ ] `workers/hf_inspect.py`: repo → configs, splits, features, 5행 미리보기 (JSON 출력)
- [ ] `workers/hf_import.py`: streaming 순회, 필드 매핑, 이미지 저장(PIL, bytes/URL/상대경로+zip 모두 처리), `<image>`→`<|image|>` 정규화, 다중 이미지, 메타 보존, LLaVA JSON 기록, 진행률 JSON lines, 최대 샘플 수, 재시작 가능(이어쓰기)
- [ ] `hf download`로 저장소 보조 파일(images.zip 등) 받기·해제·캐시, `HF_TOKEN` 자동 적용
- [ ] `lib/jobs/pythonRunner.ts`: 프로세스 실행·stdout 파싱·취소·타임아웃
- [ ] HfWizard 3단계 UI(링크 → 매핑(자동 추천 + 미리보기) → 옵션·실행)
- [ ] 완료 시 Dataset(source=hf) + variant default 생성 → 자동 색인 → Datapack 지정 UI
- [ ] HF 토큰(비공개 데이터셋)은 서버 환경변수 `HF_TOKEN`로만
- [ ] pytest: ViRL39K 상위 50행으로 변환 검증(zip 이미지 매칭, 토큰 정규화), 매핑 추천 유닛 테스트

**완료**: HF 링크를 넣으면 JSON+이미지가 생성되고 탐색기에서 샘플이 열린다.

### Phase 7 — 실시간 갱신 (1일)

- [ ] 이벤트 버스, `/api/events` SSE, 클라이언트 훅(refetch, 폴링 폴백)
- [ ] chokidar: Manifest 변경 → 재가져오기 제안(자동 덮어쓰기 X, 충돌 가능). JSON mtime 5분 폴링 → 재색인 예약
- [ ] 태그·Superpack 구성 변경도 이벤트로 전파 (여러 사람이 동시에 볼 때)

### Phase 8 — 배포 (0.5일)

- [ ] Dockerfile(Node 20 + Python 3.11 단일 이미지, standalone), docker-compose(`data/`, `OUTPUT_ROOT`, `/group-volume:ro`)
- [ ] 헬스체크, README(실행·경로·HF 토큰·색인·내보내기)
- [ ] Playwright E2E: Excel 가져오기 → Superpack 생성 → 태그 → 샘플 열기

### Phase 9 — 개선 (선택)

- 샘플 단위 태그·플래그·코멘트, 플래그 내보내기
- variant 나란히 비교, 토큰 수 추정, 길이 분포
- MX weight 시뮬레이터(가중치 조절 → 믹스 구성·총 샘플 즉시 재계산)
- HF 외 소스(로컬 parquet/JSONL/CSV → LLaVA JSON 변환)
- 로그인(Auth.js), 변경 이력(누가 태그·가중치를 바꿨는지)

## 6. 일정

| 단계                      | 소요 | 누적 |
| ------------------------- | ---- | ---- |
| 0 셋업                    | 0.5  | 0.5  |
| 1 Excel + 계층 + 개요     | 2    | 2.5  |
| 2 Datapack·Dataset + 태그 | 1.5  | 4    |
| 3 Superpack 구성·내보내기 | 1.5  | 5.5  |
| 4 샘플 색인               | 1.5  | 7    |
| 5 샘플 탐색기             | 2    | 9    |
| 6 HF 가져오기             | 2.5  | 11.5 |
| 7 실시간                  | 1    | 12.5 |
| 8 배포                    | 0.5  | 13   |

MVP 약 13 작업일(1인). Phase 3까지(5.5일)면 Excel 기반 Superpack 관리·개요·태그를 쓸 수 있고, Phase 5까지(9일)면 샘플 탐색이 된다. HF 가져오기는 독립적이라 순서를 앞당기거나 병렬로 진행할 수 있다.

## 7. 리스크 및 대응

| 리스크                                                                             | 대응                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 같은 Dataset이 시트마다 variant 경로·수치가 다름                                   | Dataset 식별은 datapack+이름. 충돌은 가져오기 미리보기에서 목록으로 보여주고 선택 |
| MX weight가 Dataset 단위가 아니라 Datapack 단위일 수도 있음                        | 스키마는 Dataset 단위로 두고, Datapack 단위면 UI에서 일괄 적용. 8절 확인          |
| HF 데이터셋 스키마가 제각각(이미지 bytes/URL/zip 상대경로, 대화 배열, 다중 이미지) | 소스 자동 판별 + 매핑 마법사 + 미리보기. 다중 이미지는 첫 장만/모두 옵션          |
| HF 다운로드가 수십 GB                                                              | streaming + 최대 샘플 수 옵션, 작업 취소·이어쓰기                                 |
| Python 의존성으로 Docker 이미지 커짐                                               | multi-stage 빌드, 워커를 별도 컨테이너로 분리 가능하게 CLI 인터페이스 유지        |
| JSON 파일 수백 MB~GB                                                               | stream-json + 배치 insert                                                         |
| 개발 PC에서 `/group-volume` 접근 불가                                              | 경로 재매핑 + 픽스처로 개발, 실서버 E2E                                           |
| 이미지 루트 하위에 HF 결과물을 쓰다가 기존 폴더와 이름 충돌                        | `hf_imports/<dataset_name>/` 하위로 격리, 같은 이름 재가져오기는 덮어쓰기 확인    |
| 여러 사람이 동시에 Superpack·태그 편집                                             | 마지막 저장 우선 + SSE로 즉시 반영. 변경 이력은 Phase 9                           |
| 로그인 없음                                                                        | 내부망 전용. 편집 기능이 있으므로 필요 시 Phase 9에 추가                          |

## 8. 확정된 사항

| 항목                                   | 결정                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| MX weight 단위                         | Superpack 안에서 Dataset(행)마다 다른 값                                                                  |
| 같은 Dataset의 탭 간 variant 일치 여부 | 미확인 → 가져오기 시 충돌 감지·선택 UI로 대응                                                             |
| HF 변환 결과 저장                      | `/group-volume` 아래 쓰기 가능. JSON은 `.../json/hf_imports/`, 이미지는 `image_folder/hf_imports/<name>/` |
| HF 예시 데이터셋                       | `TIGER-Lab/ViRL39K` (parquet + images.zip, `<image>` 토큰, 이미지 리스트)                                 |
| HF 토큰                                | `HF_TOKEN` 환경변수 → 워커·`hf` CLI에 자동 적용                                                           |
| 이미지 루트                            | `/group-volume/lit/data/sr-llava/finetune/image_folder`                                                   |
| 태그                                   | 자유 형식 텍스트 (예: `filtered`), Datapack·Dataset 대상. 샘플 단위는 Phase 9                             |
| 인증                                   | 없음                                                                                                      |

## 9. 남은 확인 사항 (진행하면서 확인 가능)

1. 실행 서버에 `/group-volume`이 마운트되어 있는지, Docker 실행 권한이 있는지
2. Manifest Excel의 탭 수와 행 수 (성능 가늠용)
3. 개발 PC에서 `/group-volume`에 접근 가능한지 (불가하면 픽스처로 개발 후 서버에서 검증)
