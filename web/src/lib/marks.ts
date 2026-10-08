import { canonicalBank } from "./accounts";

export type Mark = {
  bg: string;
  fg: string;
  label: string;
  icon?: string;
};

const BANKS: { name: string; bg: string; fg: string; label: string; icon: string }[] = [
  { name: "카카오뱅크", bg: "#FEE500", fg: "#191600", label: "카뱅", icon: "/brands/kakaobank.png" },
  { name: "토스뱅크", bg: "#0064FF", fg: "#FFFFFF", label: "토스", icon: "/brands/toss.png" },
  { name: "토스", bg: "#0064FF", fg: "#FFFFFF", label: "토스", icon: "/brands/toss.png" },
  { name: "케이뱅크", bg: "#1400C8", fg: "#FFFFFF", label: "케이", icon: "/brands/kbank.png" },
  { name: "신한은행", bg: "#0046FF", fg: "#FFFFFF", label: "신한", icon: "/brands/shinhan.png" },
  { name: "국민은행", bg: "#FFBC00", fg: "#191600", label: "KB", icon: "/brands/kb.png" },
  { name: "우리은행", bg: "#0067B1", fg: "#FFFFFF", label: "우리", icon: "/brands/woori.png" },
  { name: "하나은행", bg: "#009490", fg: "#FFFFFF", label: "하나", icon: "/brands/hana.png" },
  { name: "농협은행", bg: "#009A44", fg: "#FFFFFF", label: "농협", icon: "/brands/nh.png" },
  { name: "NH농협", bg: "#009A44", fg: "#FFFFFF", label: "농협", icon: "/brands/nh.png" },
  { name: "IBK기업은행", bg: "#00447C", fg: "#FFFFFF", label: "IBK", icon: "/brands/ibk.png" },
  { name: "기업은행", bg: "#00447C", fg: "#FFFFFF", label: "IBK", icon: "/brands/ibk.png" },
];

const CARDS: { test: string; bg: string; fg: string; label: string; icon: string }[] = [
  { test: "삼성", bg: "#1428A0", fg: "#FFFFFF", label: "삼성", icon: "/brands/samsungcard.png" },
  { test: "현대", bg: "#111111", fg: "#FFFFFF", label: "현대", icon: "/brands/hyundaicard.png" },
  { test: "롯데", bg: "#1428A0", fg: "#FFFFFF", label: "롯데", icon: "/brands/lottecard.png" },
  { test: "신한", bg: "#0046FF", fg: "#FFFFFF", label: "신한", icon: "/brands/shinhancard.png" },
  { test: "국민", bg: "#FFBC00", fg: "#191600", label: "KB", icon: "/brands/kbcard.png" },
  { test: "kb", bg: "#FFBC00", fg: "#191600", label: "KB", icon: "/brands/kbcard.png" },
  { test: "우리", bg: "#0067B1", fg: "#FFFFFF", label: "우리", icon: "/brands/wooricard.png" },
  { test: "하나", bg: "#009490", fg: "#FFFFFF", label: "하나", icon: "/brands/hanacard.png" },
  { test: "농협", bg: "#009A44", fg: "#FFFFFF", label: "농협", icon: "/brands/nhcard.png" },
  { test: "bc", bg: "#E31C3D", fg: "#FFFFFF", label: "BC", icon: "/brands/bccard.png" },
  { test: "비씨", bg: "#E31C3D", fg: "#FFFFFF", label: "BC", icon: "/brands/bccard.png" },
  { test: "페이북", bg: "#E31C3D", fg: "#FFFFFF", label: "BC", icon: "/brands/bccard.png" },
  { test: "씨티", bg: "#00A3E0", fg: "#FFFFFF", label: "씨티", icon: "/brands/citi.png" },
  { test: "citi", bg: "#00A3E0", fg: "#FFFFFF", label: "씨티", icon: "/brands/citi.png" },
];

const FALLBACKS = ["#2a5278", "#1e6a45", "#8e2f2a", "#6b4b8a", "#8a5a2a", "#3e4a3d"];

export function accountMark(bankName: string, name = ""): Mark {
  const known = canonicalBank(bankName) ?? canonicalBank(name);
  const palette = BANKS.find((bank) => bank.name === known);
  if (palette) return palette;
  const text = (bankName || name || "통장").trim();
  const extra = CARDS.find((card) => text.replace(/\s+/g, "").toLowerCase().includes(card.test) && card.icon === "/brands/citi.png");
  if (extra) return extra;
  return { bg: fallbackColor(text), fg: "#FFFFFF", label: shortLabel(text) };
}

export function cardMark(name: string, color?: string): Mark {
  const compact = name.replace(/\s+/g, "").toLowerCase();
  const known = CARDS.find((card) => compact.includes(card.test));
  if (known) return known;
  const text = name.trim() || "카드";
  return { bg: color && color !== "#1a4f8b" ? color : fallbackColor(text), fg: "#FFFFFF", label: shortLabel(text) };
}

function shortLabel(text: string): string {
  const compact = text.replace(/\s+/g, "");
  return [...compact].slice(0, 2).join("") || "통장";
}

function fallbackColor(text: string): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACKS[hash % FALLBACKS.length];
}
