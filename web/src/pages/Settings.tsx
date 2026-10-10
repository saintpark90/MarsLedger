import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLedger } from "../context/LedgerContext";
import { accountLabel, mainAccount, unseenSignals } from "../lib/accounts";
import { readConnection } from "../lib/connection";
import { monthLabel, parseAmountInput, previousMonth, seoulParts, won } from "../lib/format";
import { latestSalaryDeposit } from "../lib/forecast";
import { useInstallPrompt } from "../components/useInstall";
import { AccountThumb } from "../components/Thumbs";
import { Button, Field, TextInput } from "../components/Ui";
import type { BankAccount, Salary } from "../lib/types";

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
  const currentSalaries = ledger.snap.salaries.filter((salary) => salary.year === today.year && salary.month === today.month);
  const previousSalaries = ledger.snap.salaries.filter((salary) => salary.year === previous.year && salary.month === previous.month);
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
                <p className="inline-flex items-center gap-2">
                  <AccountThumb name={signal.bankName || "통장"} bankName={signal.bankName} size="sm" />
                  <span>
                    알림에서 <strong>{signal.bankName || "통장"}{signal.last4 ? ` ${signal.last4}` : ""}</strong>을 찾았습니다.
                  </span>
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
            <div className="flex items-center gap-2">
              {(accountName.trim() || bankName.trim()) && (
                <AccountThumb name={accountName || bankName} bankName={bankName} size="sm" />
              )}
              <TextInput className="min-w-0 flex-1" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="생활비" />
            </div>
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

      <section className="sheet space-y-4 p-4">
        <div>
          <h3 className="font-semibold">급여</h3>
          <p className="mt-1 text-sm text-muted">
            이름에 급여, 상여를 구분해 둡니다. 입금명에 그 이름이 있고 회사명으로 끝나면 그 항목으로 봅니다. 한 번이라도 들어오면 그 금액으로 계산하고, 날짜는 참고만 합니다.
          </p>
        </div>
        <SalaryMonth year={today.year} month={today.month} salaries={currentSalaries} payday={ledger.snap.settings.payday} />
        <SalaryMonth year={previous.year} month={previous.month} salaries={previousSalaries} payday={ledger.snap.settings.payday} canAdd />
      </section>

      <section className="sheet space-y-2 p-4 text-sm leading-6">
        <h3 className="font-semibold">계산 기준</h3>
        <p>각 통장 잔액에서, 그 통장으로 지정한 자동이체 가운데 오늘 포함 아직 지나지 않은 항목을 뺍니다. 통장이 비어 있는 기존 자동이체는 메인 통장에서 나갑니다. 이체일 31일은 그 달의 말일입니다.</p>
        <p>카드 청구액은 카드에 정한 이용기간의 사용 합계입니다. 이번 달 출금이 아직 지나기 전이면 그 청구액을 빼고, 지금 쌓인 이용금액도 출금일이 다음 달이어도 이번 달 남는 돈에서 뺍니다. 직접 입력한 금액이 있으면 그 값을 씁니다.</p>
        <p>이번 달에 같은 날 항목이 없으면 지난달 급여와 상여를 이어서 메인에 보여 줍니다. 입금명에 항목 이름이 있고 회사명으로 끝나면 그 항목이 들어온 것으로 보고, 가장 최근 입금 금액을 다음 예상에도 씁니다. 날짜는 그때쯤 들어온다는 참고입니다.</p>
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

function SalaryMonth({
  year,
  month,
  salaries,
  payday,
  canAdd = false,
}: {
  year: number;
  month: number;
  salaries: Salary[];
  payday: number;
  canAdd?: boolean;
}) {
  const ledger = useLedger();
  const [day, setDay] = useState(String(payday));
  const [amount, setAmount] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("급여");
  const rows = [...salaries].sort((left, right) => (left.day ?? payday) - (right.day ?? payday));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{monthLabel(year, month)}</p>
      {rows.length === 0 && <p className="text-sm text-muted">입력 없음</p>}
      {rows.map((salary) => (
        <SalaryRow key={salary.id} salary={salary} peers={rows} payday={payday} />
      ))}
      {canAdd && (
        <div className="space-y-2 rounded-lg bg-white p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="이름">
              <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="급여, 상여" />
            </Field>
            <Field label="회사명">
              <TextInput value={company} onChange={(event) => setCompany(event.target.value)} placeholder="아세아제지" />
            </Field>
          </div>
          <div className="grid gap-2 md:grid-cols-[100px_1fr_auto] md:items-end">
            <Field label="날짜">
              <TextInput inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} />
            </Field>
            <Field label="금액">
              <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Button
              tone="pine"
              onClick={() => {
                const payDay = Number(day);
                const value = parseAmountInput(amount);
                if (payDay < 1 || payDay > 31 || value <= 0) return;
                void ledger.saveSalary(year, month, value, false, payDay, company, title);
                setAmount("");
                setCompany("");
                setTitle("급여");
              }}
            >
              추가
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SalaryRow({ salary, peers, payday }: { salary: Salary; peers: Salary[]; payday: number }) {
  const ledger = useLedger();
  const day = salary.day && salary.day >= 1 ? salary.day : payday;
  const [amount, setAmount] = useState(String(salary.amount));
  const [company, setCompany] = useState(salary.company ?? "");
  const [title, setTitle] = useState(salary.title ?? "");
  const [received, setReceived] = useState(salary.received);
  const deposit = latestSalaryDeposit(
    { ...salary, company, title },
    peers.map((item) => (item.id === salary.id ? { ...item, company, title } : item)),
    ledger.snap.transactions,
  );

  return (
    <div className="space-y-2 rounded-lg bg-white p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="이름">
          <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="급여, 상여" />
        </Field>
        <Field label="회사명">
          <TextInput value={company} onChange={(event) => setCompany(event.target.value)} placeholder="아세아제지" />
        </Field>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <Field label="예상 금액">
          <TextInput inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={received} onChange={(event) => setReceived(event.target.checked)} />
          들어옴
        </label>
      </div>
      <p className="text-sm text-muted">{title.trim() || "급여"} · {day}일은 참고입니다. 빨간날이면 전날에 들어와도 이름과 회사명으로 찾습니다.</p>
      {deposit && <p className="text-sm text-muted">최근 입금 {deposit.merchant} {won(deposit.amount)}을 계산 기준으로 씁니다.</p>}
      <div className="flex gap-2">
        <Button
          tone="ghost"
          onClick={() => {
            const value = parseAmountInput(amount);
            if (value <= 0) return;
            void ledger.saveSalary(salary.year, salary.month, value, received, day, company, title);
          }}
        >
          저장
        </Button>
        <Button tone="clay" onClick={() => void ledger.clearSalary(salary.year, salary.month, salary.day)}>
          삭제
        </Button>
      </div>
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
        <p className="flex items-center gap-2 font-medium">
          <AccountThumb name={name || account.name} bankName={bankName || account.bankName} size="sm" />
          <span>
            {accountLabel(account)}
            {account.isMain ? " · 메인" : ""}
          </span>
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
