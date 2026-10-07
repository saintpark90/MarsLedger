import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLedger } from "../context/LedgerContext";
import { accountLabel, mainAccount, unseenSignals } from "../lib/accounts";
import { readConnection } from "../lib/connection";
import { monthLabel, parseAmountInput, previousMonth, seoulParts, won } from "../lib/format";
import { useInstallPrompt } from "../components/useInstall";
import { Button, Field, TextInput } from "../components/Ui";
import type { BankAccount } from "../lib/types";

export function SettingsPage() {
  const ledger = useLedger();
  const today = seoulParts();
  const previous = previousMonth(today.year, today.month);
  const install = useInstallPrompt();
  const connection = readConnection();
  const [payday, setPayday] = useState(String(ledger.snap.settings.payday));
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [last4, setLast4] = useState("");
  const [accountBalance, setAccountBalance] = useState("");
  const main = mainAccount(ledger.snap);
  const signals = unseenSignals(ledger.snap.transactions, ledger.snap.accounts);
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
        <p className="text-sm text-muted">통장을 여러 개 등록하고, 그 중 하나를 메인 통장으로 둡니다.</p>
      </div>

      <section className="sheet space-y-4 p-4">
        <div>
          <h3 className="font-semibold">통장</h3>
          <p className="mt-1 text-sm text-muted">
            알림을 보낸 앱 이름(카카오뱅크)으로 은행을 구분하고, 알림의 통장 뒤 4자리가 있으면 같은 은행의 통장도 나눕니다. 예상 잔액과 급여는 메인 통장 기준이고, 자동이체는 항목마다 출금 통장을 정합니다.
          </p>
        </div>
        {signals.length > 0 && (
          <div className="space-y-2">
            {signals.map((signal) => (
              <div key={`${signal.bankName}-${signal.last4}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <p>
                  알림에서 <strong>{signal.bankName || "통장"}{signal.last4 ? ` ${signal.last4}` : ""}</strong>을 찾았습니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    tone="pine"
                    onClick={() =>
                      void ledger.updateAccount(main.id, {
                        bankName: signal.bankName || main.bankName,
                        last4: signal.last4 || main.last4,
                        name: main.name === "메인 통장" && signal.bankName ? signal.bankName : main.name,
                      })
                    }
                  >
                    메인 통장으로 연결
                  </Button>
                  <Button
                    tone="ghost"
                    onClick={() =>
                      void ledger.addAccount({
                        name: signal.bankName || `통장 ${signal.last4}`,
                        bankName: signal.bankName,
                        last4: signal.last4,
                        balance: 0,
                      })
                    }
                  >
                    새 통장으로 추가
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-3">
          {ledger.snap.accounts.map((account) => (
            <AccountEditor key={account.id} account={account} canDelete={ledger.snap.accounts.length > 1} />
          ))}
        </div>
        <div className="grid gap-3 border-t border-line pt-3 md:grid-cols-4">
          <Field label="통장 이름">
            <TextInput value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="생활비" />
          </Field>
          <Field label="알림 앱 이름">
            <TextInput value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="카카오뱅크" />
          </Field>
          <Field label="끝 4자리">
            <TextInput inputMode="numeric" value={last4} onChange={(event) => setLast4(event.target.value)} placeholder="8547" />
          </Field>
          <Field label="현재 잔액">
            <TextInput inputMode="numeric" value={accountBalance} onChange={(event) => setAccountBalance(event.target.value)} />
          </Field>
        </div>
        <Button
          tone="ink"
          onClick={() => {
            const tail = last4.trim();
            if (tail && !/^\d{4}$/.test(tail)) return;
            if (!accountName.trim() && !bankName.trim()) return;
            void ledger.addAccount({
              name: accountName,
              bankName,
              last4: tail,
              balance: parseAmountInput(accountBalance),
            });
            setAccountName("");
            setBankName("");
            setLast4("");
            setAccountBalance("");
          }}
        >
          통장 추가
        </Button>
        <div className="grid gap-3 md:grid-cols-2">
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
          알림에 잔액이 있으면 그 통장 잔액 갱신을 제안
        </label>
        <Button
          tone="ghost"
          onClick={() => {
            const day = Number(payday);
            if (day < 1 || day > 31) return;
            void ledger.saveSettings({ ...ledger.snap.settings, payday: day });
          }}
        >
          급여일 저장
        </Button>
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
        <p>각 통장 잔액에서, 그 통장으로 지정한 자동이체 가운데 오늘 포함 아직 지나지 않은 항목을 뺍니다. 통장이 비어 있는 기존 자동이체는 메인 통장에서 나갑니다. 이체일 31일은 그 달의 말일입니다.</p>
        <p>카드 청구액은 지난달 신용 결제 합계이고, 직접 입력한 금액이 있으면 그 값을 씁니다. 각 카드에 지정한 통장에서, 결제일이 지나기 전이면 빼고 지난 뒤면 이미 빠진 것으로 봅니다.</p>
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

function AccountEditor({ account, canDelete }: { account: BankAccount; canDelete: boolean }) {
  const ledger = useLedger();
  const [name, setName] = useState(account.name);
  const [bankName, setBankName] = useState(account.bankName);
  const [last4, setLast4] = useState(account.last4);
  const [balance, setBalance] = useState(String(account.balance || ""));

  useEffect(() => {
    setName(account.name);
    setBankName(account.bankName);
    setLast4(account.last4);
    setBalance(String(account.balance || ""));
  }, [account.name, account.bankName, account.last4, account.balance]);

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {accountLabel(account)}
          {account.isMain ? " · 메인" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {!account.isMain && (
            <Button tone="ghost" onClick={() => void ledger.updateAccount(account.id, { isMain: true })}>
              메인으로
            </Button>
          )}
          {canDelete && (
            <Button
              tone="clay"
              onClick={() => {
                if (window.confirm(`${account.name} 통장을 삭제할까요?`)) void ledger.deleteAccount(account.id);
              }}
            >
              삭제
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="이름">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="알림 앱 이름">
          <TextInput value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="카카오뱅크" />
        </Field>
        <Field label="끝 4자리">
          <TextInput inputMode="numeric" value={last4} onChange={(event) => setLast4(event.target.value)} placeholder="8547" />
        </Field>
        <Field label="현재 잔액">
          <TextInput inputMode="numeric" value={balance} onChange={(event) => setBalance(event.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          tone="ink"
          onClick={() => {
            const tail = last4.trim();
            if (tail && !/^\d{4}$/.test(tail)) return;
            void ledger.updateAccount(account.id, {
              name: name.trim() || account.name,
              bankName: bankName.trim(),
              last4: tail,
              balance: parseAmountInput(balance),
              balanceAsOf: new Date().toISOString(),
            });
          }}
        >
          저장
        </Button>
        {account.balanceAsOf && (
          <p className="text-sm text-muted">잔액 기준 {new Date(account.balanceAsOf).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
        )}
      </div>
    </div>
  );
}
