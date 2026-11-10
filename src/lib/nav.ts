import type { LucideIcon } from "lucide-react";
import {
  Database,
  Download,
  FlaskConical,
  Images,
  LayoutDashboard,
  Layers,
  Package,
  Settings,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: "개요",
    href: "/",
    icon: LayoutDashboard,
    description: "Superpack별 KPI와 분포 차트",
  },
  {
    title: "Superpack",
    href: "/superpacks",
    icon: Layers,
    description: "학습 데이터 믹스. Excel 탭 하나 또는 직접 구성",
  },
  {
    title: "Datapack",
    href: "/datapacks",
    icon: Package,
    description: "Dataset 묶음. 어느 Superpack에 속하는지 표시",
  },
  {
    title: "Dataset",
    href: "/datasets",
    icon: Database,
    description: "Manifest 행 단위. variant별 경로·샘플 수·가중치",
  },
  {
    title: "실험",
    href: "/experiments",
    icon: FlaskConical,
    description: "학습 설정(YAML)별로 어떤 데이터 파일을 썼는지",
  },
  {
    title: "샘플",
    href: "/samples",
    icon: Images,
    description: "대화(Q/A)와 이미지를 샘플 단위로 탐색",
  },
  {
    title: "가져오기",
    href: "/import",
    icon: Download,
    description: "Excel Manifest, HuggingFace 데이터셋, 작업 현황",
  },
  {
    title: "설정",
    href: "/settings",
    icon: Settings,
    description: "경로 재매핑, 이미지 루트, HF 토큰 확인",
  },
];

/** Returns true when `pathname` is the item itself or one of its sub-routes. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
