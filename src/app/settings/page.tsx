import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "설정" };

export default function SettingsPage() {
  return (
    <PagePlaceholder
      title="설정"
      description="경로 재매핑, 이미지 루트, HuggingFace 토큰 상태를 확인합니다."
      phase="Phase 1 · 6"
      features={[
        "PATH_PREFIX_FROM / PATH_PREFIX_TO 경로 재매핑 확인",
        "IMAGE_ROOT, OUTPUT_ROOT 확인과 샘플 이미지 열림 검증",
        "HF_TOKEN 유효성 확인(whoami). 토큰 값은 브라우저로 내려보내지 않음",
      ]}
    />
  );
}
