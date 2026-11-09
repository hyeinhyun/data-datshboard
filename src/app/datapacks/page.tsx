import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Datapack" };

export default function DatapacksPage() {
  return (
    <PagePlaceholder
      title="Datapack"
      description="Dataset의 묶음입니다. 각 Datapack이 어느 Superpack에 포함되는지 표시합니다."
      phase="Phase 2"
      features={[
        "Datapack 테이블: 이름, Dataset 수, 총 샘플, 소속 Superpack 배지, 태그",
        "상세: 포함된 Dataset 목록, Superpack 목록, 태그 편집",
        "태그(자유 형식, 예: filtered) 추가·삭제와 태그 필터",
      ]}
    />
  );
}
