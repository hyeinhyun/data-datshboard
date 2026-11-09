import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "가져오기" };

export default function ImportPage() {
  return (
    <PagePlaceholder
      title="가져오기"
      description="Excel Manifest와 HuggingFace 데이터셋을 가져오고, 색인·변환 작업 현황을 봅니다."
      phase="Phase 1 · 4 · 6"
      features={[
        "Excel: 탭 → Superpack, 행 → Dataset. 적용 전 시트별 요약과 충돌 목록",
        "HuggingFace: 링크 → 스키마 미리보기 → 필드 매핑 → LLaVA JSON + 이미지 변환",
        "images.zip 같은 보조 파일은 hf CLI로 받아 해제, HF_TOKEN 자동 적용",
        "작업 현황: 진행률, 로그, 취소",
      ]}
    />
  );
}
