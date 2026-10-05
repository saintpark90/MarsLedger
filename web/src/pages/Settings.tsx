import { useState } from "react";
import { Link } from "react-router-dom";
import { useLedger } from "../context/LedgerContext";
import { readConnection } from "../lib/connection";
import { monthLabel, parseAmountInput, previousMonth, seoulParts, won } from "../lib/format";
import { useInstallPrompt } from "../components/useInstall";
import { Button, Field, TextInput } from "../components/Ui";

export function SettingsPage() {
  const ledger = useLedger();
  const today = seoulParts();
  const previous = previousMonth(today.year, today.month);
  const install = useInstallPrompt();
  const connection = readConnection();
  const [balance, setBalance] = useState(String(ledger.snap.settings.mainBalance || ""));
  const [payday, setPayday] = useState(String(ledger.snap.settings.payday));
  const currentSalary = ledger.snap.salaries.find((salary) => salary.year === today.year && salary.month === today.month);
  const previousSalary = ledger.snap.salaries.find((salary) => salary.year === previous.year && salary.month === previous.month);
  const [currentAmount, setCurrentAmount] = useState(currentSalary ? String(currentSalary.amount) : "");
  const [currentReceived, setCurrentReceived] = useState(currentSalary?.received ?? false);
  const [previousAmount, setPreviousAmount] = useState(previousSalary ? String(previousSalary.amount) : "");
  const [url, setUrl] = useState(connection?.url ?? "");
  const [anonKey, setAnonKey] = useState(connection?.anonKey ?? "");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">설정</h2>
        <p className="text-sm text-muted">통장 잔액, 급여일, 서버 연결을 여기서 관리합니다.</p>
      </div>

      <section className="sheet space-y-3 p-4">
        <h3 className="font-semibold">메인 통장</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="현재 잔액">
            <TextInput inputMode="numeric" value={balance} onChange={(event) => setBalance(event.target.value)} />
          </Field>
          <Field label="급여일">
            <TextInput inputMode="numeric" value={payday} onChange={(event) => setPayday(event.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ledger.snap.settings.syncBalance}
            onChange={(event) => void ledger.saveSettings({ ...ledger.snap.settings, syncBalance: event.target.checked })}
          />
          알림에 잔액이 있으면 갱신을 제안
        </label>
        <Button
          tone="ink"
          onClick={() => {
            const day = Number(payday);
            if (day < 1 || day > 31) return;
            void ledger.saveSettings({
              ...ledger.snap.settings,
              mainBalance: parseAmountInput(balance),
              payday: day,
              balanceAsOf: new Date().toISOString(),
            });
          }}
        >
          잔액과 급여일 저장
        </Button>
        {ledger.snap.settings.balanceAsOf && (
          <p className="text-sm text-muted">마지막 잔액 기준 {new Date(ledger.snap.settings.balanceAsOf).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
        )}
      </section>

      <section className="sheet space-y-3 p-4">
        <h3 className="font-semibold">급여</h3>
        <p className="text-sm text-muted">
          이번 달 금액이 없으면 지난달 급여로 예상 잔액을 계산합니다. 입금 완료로 표시하면 이미 통장 잔액에 들어 있는 것으로 보고 다시 더하지 않습니다.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={`${monthLabel(today.year, today.month)} 급여`}>
            <TextInput inputMode="numeric" value={currentAmount} onChange={(event) => setCurrentAmount(event.target.value)} />
          </Field>
          <Field label={`${monthLabel(previous.year, previous.month)} 급여`}>
            <TextInput inputMode="numeric" value={previousAmount} onChange={(event) => setPreviousAmount(event.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={currentReceived} onChange={(event) => setCurrentReceived(event.target.checked)} />
          이번 달 급여가 이미 들어옴
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            tone="pine"
            onClick={() => {
              const amount = parseAmountInput(currentAmount);
              if (amount <= 0) return;
              void ledger.saveSalary(today.year, today.month, amount, currentReceived);
            }}
          >
            이번 달 저장
          </Button>
          <Button tone="ghost" onClick={() => void ledger.clearSalary(today.year, today.month)}>
            이번 달 입력 지우기
          </Button>
          <Button
            tone="ghost"
            onClick={() => void ledger.saveSalary(previous.year, previous.month, parseAmountInput(previousAmount), true)}
          >
            지난달 저장
          </Button>
        </div>
        <p className="text-sm text-muted">
          이번 달 {currentSalary ? won(currentSalary.amount) : "미입력"} · 지난달 {previousSalary ? won(previousSalary.amount) : "미입력"}
        </p>
      </section>

      <section className="sheet space-y-2 p-4 text-sm leading-6">
        <h3 className="font-semibold">계산 기준</h3>
        <p>현재 메인 통장 잔액에서 오늘 포함 아직 지나지 않은 자동이체를 뺍니다.</p>
        <p>카드 청구액은 지난달 신용 결제 합계이고, 직접 입력한 금액이 있으면 그 값을 씁니다. 결제일이 지나기 전이면 빼고, 지난 뒤면 이미 빠진 것으로 봅니다.</p>
        <p>급여일이 되기 전이거나 이번 달 급여를 미입금으로 표시하면 급여를 더합니다. 이번 달 급여가 비어 있으면 지난달 금액입니다.</p>
        <p>
          카드와 분류 규칙은 <Link className="text-pine" to="/cards">카드</Link>, <Link className="text-pine" to="/rules">분류</Link>에서 수정합니다.
        </p>
      </section>

      <section className="sheet space-y-3 p-4">
        <h3 className="font-semibold">Supabase 연결</h3>
        <p className="text-sm text-muted">프로젝트 URL과 anon public 키를 넣으면 이 브라우저와 휴대폰 앱이 같은 장부를 사용합니다.</p>
        <Field label="Project URL">
          <TextInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://xxxx.supabase.co" />
        </Field>
        <Field label="anon public key">
          <TextInput type="password" value={anonKey} onChange={(event) => setAnonKey(event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            tone="ink"
            onClick={() => {
              const message = ledger.connectSupabase(url, anonKey);
              if (message) window.alert(message);
            }}
          >
            연결
          </Button>
          {ledger.mode === "supabase" && (
            <Button tone="ghost" onClick={() => void ledger.disconnectSupabase()}>
              연결 해제
            </Button>
          )}
          {ledger.mode === "supabase" && (
            <Button tone="ghost" onClick={() => void ledger.signOut()}>
              로그아웃
            </Button>
          )}
        </div>
      </section>

      <section className="sheet space-y-2 p-4">
        <h3 className="font-semibold">웹앱 설치</h3>
        {install.installed && <p className="text-sm">이미 설치되어 있습니다.</p>}
        {install.canInstall && (
          <Button tone="pine" onClick={() => void install.install()}>
            이 기기에 설치
          </Button>
        )}
        {!install.canInstall && !install.installed && (
          <p className="text-sm text-muted">
            안드로이드 Chrome에서는 메뉴의 앱 설치 또는 홈 화면에 추가를 사용합니다. 아이폰 Safari에서는 공유 버튼의 홈 화면에 추가를 사용합니다.
          </p>
        )}
      </section>

      {ledger.mode === "local" && (
        <section className="sheet space-y-2 p-4">
          <h3 className="font-semibold">데모 장부</h3>
          <div className="flex gap-2">
            <Button tone="ghost" onClick={() => void ledger.loadSample()}>
              예시 데이터
            </Button>
            <Button
              tone="clay"
              onClick={() => {
                if (window.confirm("이 브라우저의 데모 장부를 비울까요?")) void ledger.resetDemo();
              }}
            >
              비우기
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
