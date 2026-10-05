import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useLedger } from "../context/LedgerContext";
import { useInstallPrompt } from "./useInstall";
import { Button } from "./Ui";

const primary = [
  { to: "/", label: "홈", icon: "⌂" },
  { to: "/transactions", label: "내역", icon: "☰" },
  { to: "/analytics", label: "분석", icon: "◈" },
  { to: "/recurring", label: "이체", icon: "↻" },
  { to: "/settings", label: "설정", icon: "⚙" },
];

const side = [
  ...primary.slice(0, 4),
  { to: "/cards", label: "카드", icon: "▢" },
  { to: "/rules", label: "분류", icon: "⌗" },
  { to: "/settings", label: "설정", icon: "⚙" },
];

export function Layout({ children }: { children: ReactNode }) {
  const ledger = useLedger();
  const install = useInstallPrompt();
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-sheet/80 md:flex md:flex-col">
        <div className="border-l-8 border-spine px-5 py-6">
          <p className="text-xs tracking-[0.22em] text-muted">MARS LEDGER</p>
          <h1 className="mt-1 text-2xl font-semibold">가계부</h1>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {side.map((item) => (
            <SideLink key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>
        <p className="px-5 py-4 text-xs leading-5 text-muted">금융 알림만 모으고, 데이터는 연결한 Supabase에 저장됩니다.</p>
      </aside>
      <div className="min-w-0 flex-1 pb-24 md:pb-8">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 md:px-8">
          <div className="md:hidden">
            <p className="text-[11px] tracking-[0.18em] text-muted">MARS LEDGER</p>
            <p className="text-lg font-semibold">가계부</p>
          </div>
          <p className="hidden text-sm text-muted md:block">
            {ledger.mode === "supabase" ? `${ledger.email} · 동기화됨` : "이 브라우저 데모"}
          </p>
          <div className="flex items-center gap-2">
            {install.canInstall && (
              <Button tone="pine" onClick={() => void install.install()}>
                앱 설치
              </Button>
            )}
          </div>
        </header>
        {(ledger.error || ledger.notice || ledger.mode === "local") && (
          <div className="space-y-2 px-4 pt-4 md:px-8">
            {ledger.mode === "local" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm">
                <p>데모 모드입니다. 휴대폰 알림과 맞추려면 설정에서 Supabase를 연결하세요.</p>
                <Button tone="ghost" onClick={() => void ledger.loadSample()}>
                  예시 데이터
                </Button>
              </div>
            )}
            {ledger.notice && <Message tone="pine" text={ledger.notice} onClose={ledger.clearMessage} />}
            {ledger.error && <Message tone="clay" text={ledger.error} onClose={ledger.clearMessage} />}
          </div>
        )}
        <main className="px-4 py-5 md:px-8">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-sheet/95 backdrop-blur md:hidden">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? "text-pine" : "text-muted"}`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SideLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-pine-soft font-medium text-pine" : "text-ink hover:bg-paper"}`
      }
    >
      {label}
    </NavLink>
  );
}

function Message({ tone, text, onClose }: { tone: "pine" | "clay"; text: string; onClose: () => void }) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ${tone === "pine" ? "bg-pine-soft text-pine" : "bg-clay-soft text-clay"}`}>
      <p>{text}</p>
      <button onClick={onClose} className="shrink-0" aria-label="닫기">
        닫기
      </button>
    </div>
  );
}
