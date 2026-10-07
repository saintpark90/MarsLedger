import { useState, type FormEvent } from "react";
import { useLedger } from "../context/LedgerContext";
import { explainError } from "../lib/connection";
import { Button, Field, TextInput } from "../components/Ui";

export function LoginPage() {
  const ledger = useLedger();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!email.includes("@") || password.length < 6) {
      setMessage("이메일과 6자 이상 비밀번호를 입력해 주세요.");
      return;
    }
    if (mode === "up" && password !== passwordConfirm) {
      setMessage("비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "in") await ledger.signIn(email.trim(), password);
      else await ledger.signUp(email.trim(), password);
    } catch (error) {
      setMessage(explainError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <div className="sheet border-l-8 border-l-spine p-6">
        <p className="text-xs tracking-[0.2em] text-muted">MARS LEDGER</p>
        <h1 className="mt-1 text-3xl font-semibold">가계부</h1>
        <p className="mt-2 text-sm leading-6 text-muted">휴대폰에서 모은 카드·은행 알림을 이 계정으로 확인합니다.</p>
        <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event)}>
          <Field label="이메일">
            <TextInput type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="비밀번호">
            <TextInput type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          {mode === "up" && (
            <Field label="비밀번호 확인">
              <TextInput type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
            </Field>
          )}
          {message && <p className="text-sm text-clay">{message}</p>}
          {ledger.notice && <p className="text-sm text-pine">{ledger.notice}</p>}
          <Button tone="ink" type="submit" disabled={busy} className="w-full">
            {mode === "in" ? "로그인" : "가입"}
          </Button>
        </form>
        <button
          className="mt-4 text-sm text-pine"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setPasswordConfirm("");
            setMessage(null);
          }}
        >
          {mode === "in" ? "계정이 없으면 가입" : "이미 계정이 있으면 로그인"}
        </button>
      </div>
    </div>
  );
}
