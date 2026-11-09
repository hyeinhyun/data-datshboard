import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "샘플" };

export default function SamplesPage() {
  return (
    <PagePlaceholder
      title="샘플"
      description="Dataset과 variant를 고르고 샘플을 클릭하면 대화(Q/A)와 이미지를 볼 수 있습니다."
      phase="Phase 4 · 5"
      features={[
        "썸네일 그리드 / 리스트 토글, FTS 검색, 턴 수·길이·이미지 유무 필터",
        "상세 패널: 이미지 뷰어(확대·축소·원본), system / human / gpt 말풍선",
        "마크다운 + KaTeX(\\boxed{}) + 코드 하이라이트, 원문(raw) 토글",
        "← → 키로 이전/다음, 무작위 샘플, 같은 id의 다른 variant로 점프",
      ]}
    />
  );
}
