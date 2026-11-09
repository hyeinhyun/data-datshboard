import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Dataset" };

export default function DatasetsPage() {
  return (
    <PagePlaceholder
      title="Dataset"
      description="Manifest의 행 하나입니다. longer / longans / shortans variant별 경로와 수치를 봅니다."
      phase="Phase 2"
      features={[
        "가상 스크롤 테이블: 정렬, 검색, 컬럼 토글, CSV 내보내기",
        "상세: 분류 정보, variant 카드 3종(경로·샘플 수·sft weight·색인 상태)",
        "Superpack별 MX weight 표, Manifest 수치와 색인 수치 비교·경고",
        "태그 편집, 샘플 탐색기로 바로가기",
      ]}
    />
  );
}
