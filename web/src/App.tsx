import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Button } from "./components/Ui";
import { LedgerProvider, useLedger } from "./context/LedgerContext";
import { AnalyticsPage } from "./pages/Analytics";
import { CardsPage } from "./pages/Cards";
import { Dashboard } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import { RecurringPage } from "./pages/Recurring";
import { RulesPage } from "./pages/Rules";
import { SettingsPage } from "./pages/Settings";
import { TransactionsPage } from "./pages/Transactions";

export function App() {
  const base = import.meta.env.BASE_URL;
  const basename = base === "/" ? undefined : base.replace(/\/$/, "");
  return (
    <BrowserRouter basename={basename}>
      <LedgerProvider>
        <Gate />
      </LedgerProvider>
    </BrowserRouter>
  );
}

function Gate() {
  const ledger = useLedger();
  if (ledger.phase === "loading") {
    return (
      <div className="grid min-h-screen place-items-center">
        <p>가계부를 열고 있습니다</p>
      </div>
    );
  }
  if (ledger.phase === "error") {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-5">
        <h1 className="text-2xl font-semibold">장부를 열지 못했습니다</h1>
        <p className="text-sm leading-6 text-muted">{ledger.error}</p>
        <div className="flex gap-2">
          <Button tone="ink" onClick={() => window.location.reload()}>
            다시 시도
          </Button>
          <Button tone="ghost" onClick={() => void ledger.disconnectSupabase()}>
            연결 해제
          </Button>
        </div>
      </div>
    );
  }
  if (ledger.phase === "login") return <LoginPage />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
