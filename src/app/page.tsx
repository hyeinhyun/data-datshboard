import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function OverviewPage() {
  return (
    <PagePlaceholder
      title="개요"
      description="Superpack을 고르면 KPI 카드와 분포 차트가 표시됩니다."
      phase="Phase 1"
      features={[
        "Superpack 선택기와 Datapack / Category / Sub-category / 언어 / variant / 태그 필터",
        "KPI 카드: Datapack 수, Dataset 수, 총 샘플, 학습 샘플, MX(1)/MX(2) 샘플",
        "Category 스택 막대(variant 구분), Datapack 비율, 언어 비율, 가중치 표",
        "차트 클릭 시 해당 조건으로 Dataset 테이블 이동",
      ]}
    />
  );
}
