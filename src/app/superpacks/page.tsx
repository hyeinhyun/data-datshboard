import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Superpack" };

export default function SuperpacksPage() {
  return (
    <PagePlaceholder
      title="Superpack"
      description="학습 데이터 믹스 하나. Excel 탭에서 가져오거나 Datapack을 골라 직접 구성합니다."
      phase="Phase 1 · 3"
      features={[
        "Excel에서 가져온 Superpack 목록과 Dataset 수·총 샘플 수",
        "Datapack 멀티셀렉트로 새 Superpack 만들기, 순서·가중치 편집",
        "Dataset별 MX weight (1)/(2) 편집과 집계 자동 재계산",
        "Manifest와 같은 구조의 Excel 또는 학습 스크립트용 JSON으로 내보내기",
      ]}
    />
  );
}
