/*
 * MONEY GARDEN — root component: owns all state, storage load/persist,
 * every action handler, the header (weather + streak), tab nav, footer
 * ("the shed") with storage disclosure and two-step reset, and the toast.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Commitment, Goal, Invest, State, Transaction } from "../engine/types";
import { DEFAULT_INVEST, STORAGE_KEY } from "../engine/types";
import { fmt, uid, todayISO } from "../engine/format";
import { derive, weatherFor } from "../engine/stats";
import { bumpStreak, deserialize, emptyState, sampleState, serialize } from "../engine/state";
import { buildBackup, parseBackup, type ImportPreview } from "../engine/backup";
import { createStore } from "../engine/storage";
import { C } from "./theme";
import { Overview } from "./tabs/Overview";
import { Log } from "./tabs/Log";
import { Budgets } from "./tabs/Budgets";
import { Garden } from "./tabs/Garden";
import { Orchard } from "./tabs/Orchard";
import { Advice } from "./tabs/Advice";

const store = createStore();

const TABS = [
  { id: "overview", label: "Overview", icon: "🌤️" },
  { id: "log",      label: "Log",      icon: "✏️" },
  { id: "budgets",  label: "Budgets",  icon: "🧺" },
  { id: "garden",   label: "Garden",   icon: "🌷" },
  { id: "orchard",  label: "Orchard",  icon: "🌳" },
  { id: "advice",   label: "Advice",   icon: "🪴" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function MoneyGarden() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  const memoryFallback = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const importInput = useRef<HTMLInputElement>(null);

  /* ---------- load & persist ---------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await store.get(STORAGE_KEY);
        if (res && res.value) {
          // deserialize = JSON.parse + migrate (fills missing invest keys,
          // defaults commitments, keeps unknown fields).
          setState(deserialize(res.value));
          return;
        }
      } catch { /* key missing or storage unavailable */ }
      setStateSafe(emptyState(), true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStateSafe = (next: State, skipToastOnFail = false) => {
    setState(next);
    void (async () => {
      const r = await store.set(STORAGE_KEY, serialize(next));
      // The memory tier reports persisted: false — disclose it once, like the
      // reference's one-time "session only" toast.
      if (!r.persisted && !memoryFallback.current && !skipToastOnFail) {
        memoryFallback.current = true;
        showToast("Saving is unavailable here — changes live in this session only.");
      }
    })();
  };

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  /* ---------- derived numbers (engine) ---------- */
  const derived = useMemo(() => (state ? derive(state) : null), [state]);

  if (!state || !derived) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "grid", placeItems: "center", fontFamily: "'DM Sans', sans-serif", color: C.ink }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🌱</div>
          <div>Preparing your garden…</div>
        </div>
      </div>
    );
  }

  /* ---------- actions ---------- */
  const addTransaction = (tx: Omit<Transaction, "id">) => {
    const next: State = { ...state, transactions: [{ ...tx, id: uid() }, ...state.transactions] };
    next.streak = bumpStreak(state.streak);
    if (next.streak.count > state.streak.count && next.streak.count > 1) {
      showToast(`🔥 ${next.streak.count}-day logging streak — keep it growing!`);
    }
    setStateSafe(next);
  };

  const deleteTransaction = (id: string) =>
    setStateSafe({ ...state, transactions: state.transactions.filter((t) => t.id !== id) });

  const addGoal = (g: Omit<Goal, "id">) => setStateSafe({ ...state, goals: [...state.goals, { ...g, id: uid() }] });

  const waterGoal = (id: string, amount: number) => {
    const goals = state.goals.map((g) => {
      if (g.id !== id) return g;
      const saved = Math.min(g.target, g.saved + amount);
      if (saved >= g.target && g.saved < g.target) showToast(`🌸 "${g.name}" is in full bloom — goal reached!`);
      return { ...g, saved };
    });
    const tx: Transaction = { id: uid(), type: "saving", amount, category: "other", note: `→ ${state.goals.find((g) => g.id === id)?.name}`, date: todayISO() };
    setStateSafe({ ...state, goals, transactions: [tx, ...state.transactions], streak: bumpStreak(state.streak) });
  };

  const deleteGoal = (id: string) => setStateSafe({ ...state, goals: state.goals.filter((g) => g.id !== id) });
  const setBudget = (catId: string, v: string) => setStateSafe({ ...state, budgets: { ...state.budgets, [catId]: Number(v) || 0 } });
  const setIncome = (v: string) => setStateSafe({ ...state, income: Number(v) || 0 });

  const setInvest = (patch: Partial<Invest>) => setStateSafe({ ...state, invest: { ...(state.invest || DEFAULT_INVEST), ...patch } });
  const addHolding = (h: { name: string; value: number }) => {
    setInvest({ holdings: [...((state.invest || DEFAULT_INVEST).holdings || []), { ...h, id: uid() }] });
    showToast(`🌳 "${h.name}" planted in the orchard`);
  };
  const updateHolding = (id: string, value: string) =>
    setInvest({ holdings: (state.invest || DEFAULT_INVEST).holdings.map((h) => (h.id === id ? { ...h, value: Math.max(0, Number(value) || 0) } : h)) });
  const deleteHolding = (id: string) =>
    setInvest({ holdings: (state.invest || DEFAULT_INVEST).holdings.filter((h) => h.id !== id) });

  const waterOrchard = (id: string, amount: number) => {
    const inv = state.invest || DEFAULT_INVEST;
    const target = inv.holdings.find((h) => h.id === id);
    if (!target || !(amount > 0)) return;
    const holdings = inv.holdings.map((h) => (h.id === id ? { ...h, value: (Number(h.value) || 0) + amount } : h));
    const tx: Transaction = { id: uid(), type: "saving", amount, category: "other", note: `→ Orchard: ${target.name}`, date: todayISO() };
    setStateSafe({ ...state, invest: { ...inv, holdings }, transactions: [tx, ...state.transactions], streak: bumpStreak(state.streak) });
    showToast(`💧 ${fmt(amount)} watered into "${target.name}"`);
  };

  const addCommitment = (c: Omit<Commitment, "id">) => {
    setStateSafe({ ...state, commitments: [...(state.commitments || []), { ...c, id: uid() }] });
    showToast(c.kind === "inst" ? `🪜 "${c.name}" staked to the trellis` : `🌿 "${c.name}" vine planted`);
  };
  const deleteCommitment = (id: string) =>
    setStateSafe({ ...state, commitments: (state.commitments || []).filter((c) => c.id !== id) });
  const logCommitmentPayment = (id: string) => {
    const c = (state.commitments || []).find((x) => x.id === id);
    if (!c) return;
    const tx: Transaction = { id: uid(), type: "expense", amount: Number(c.amount) || 0, category: c.category || "subs", note: `${c.kind === "inst" ? "Installment" : "Subscription"}: ${c.name}`, date: todayISO() };
    const commitments = (state.commitments || []).map((x) => (x.id === id && x.kind === "inst" ? { ...x, paidCount: (x.paidCount || 0) + 1 } : x));
    setStateSafe({ ...state, commitments, transactions: [tx, ...state.transactions], streak: bumpStreak(state.streak) });
    showToast(`💸 ${fmt(c.amount)} logged for "${c.name}"`);
  };

  /* ---------- backup: export & import ---------- */
  const saveBackup = () => {
    const { filename, json } = buildBackup(state);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast("🌾 Backup saved — keep it somewhere safe.");
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseBackup(await file.text());
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setPendingImport(result.preview);
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const { counts } = pendingImport;
    setStateSafe(pendingImport.state);
    setPendingImport(null);
    setTab("overview");
    showToast(`🌱 Garden restored — ${counts.transactions} transactions, ${counts.goals} goals.`);
  };

  const isEmpty = state.transactions.length === 0 && state.goals.length === 0;
  const weather = weatherFor(derived.health);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* ===== header ===== */}
      <header style={{ maxWidth: 980, margin: "0 auto", padding: "26px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 700 }}>
              {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "clamp(30px, 5vw, 44px)", margin: "2px 0 0", lineHeight: 1.05 }}>
              Money Garden
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="mg-card" style={{ padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }} title="Garden health — budget pace, saving, and logging habits">
              <span style={{ fontSize: 22 }}>{weather.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{weather.word} · {derived.health}/100</div>
                <div style={{ fontSize: 11.5, color: C.inkSoft }}>{weather.blurb}</div>
              </div>
            </div>
            <div className="mg-card" style={{ padding: "8px 14px", textAlign: "center" }} title="Days in a row you've logged something">
              <div style={{ fontWeight: 700, fontSize: 14 }}>🔥 {state.streak.count}</div>
              <div style={{ fontSize: 11, color: C.inkSoft }}>day streak</div>
            </div>
          </div>
        </div>

        {/* tabs */}
        <nav style={{ display: "flex", gap: 6, marginTop: 18, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="mg-tab mg-btn"
              style={{
                padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 600, fontSize: 14,
                background: tab === t.id ? C.ink : "transparent",
                color: tab === t.id ? "#fff" : C.ink,
              }}>
              <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "16px 20px 60px" }}>
        {isEmpty && (
          <div className="mg-card" style={{ padding: 24, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20 }}>Fresh soil 🌱</div>
              <div style={{ color: C.inkSoft, fontSize: 14 }}>Log your first expense or plant a goal — or explore with sample data first.</div>
            </div>
            <button className="mg-btn" onClick={() => setStateSafe(sampleState())}
              style={{ background: C.leaf, color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>
              Plant sample data
            </button>
          </div>
        )}

        {tab === "overview" && <Overview state={state} d={derived} setIncome={setIncome} goTo={(t) => setTab(t as TabId)} />}
        {tab === "log" && <Log state={state} d={derived} addTransaction={addTransaction} deleteTransaction={deleteTransaction} />}
        {tab === "budgets" && <Budgets state={state} d={derived} setBudget={setBudget} addCommitment={addCommitment} deleteCommitment={deleteCommitment} logCommitmentPayment={logCommitmentPayment} />}
        {tab === "garden" && <Garden state={state} addGoal={addGoal} waterGoal={waterGoal} deleteGoal={deleteGoal} />}
        {tab === "orchard" && <Orchard state={state} d={derived} setInvest={setInvest} addHolding={addHolding} updateHolding={updateHolding} deleteHolding={deleteHolding} waterOrchard={waterOrchard} />}
        {tab === "advice" && <Advice state={state} d={derived} />}

        {/* ===== import confirm card ===== */}
        {pendingImport && (
          <section className="mg-card" style={{ marginTop: 24, padding: 20, border: `1.5px solid ${C.marigold}` }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Restore from backup? 🏦</div>
            <p style={{ margin: "0 0 6px", fontSize: 13.5, color: C.inkSoft }}>
              This backup contains <b className="mg-num" style={{ color: C.ink }}>{pendingImport.counts.transactions}</b> transactions · <b className="mg-num" style={{ color: C.ink }}>{pendingImport.counts.goals}</b> goals · <b className="mg-num" style={{ color: C.ink }}>{pendingImport.counts.commitments}</b> commitments · <b className="mg-num" style={{ color: C.ink }}>{pendingImport.counts.holdings}</b> holdings{pendingImport.exportedAt ? <> · exported {pendingImport.exportedAt}</> : null}.
            </p>
            <p style={{ margin: "0 0 12px", fontSize: 13.5, color: C.tomato, fontWeight: 600 }}>
              ⚠ Importing replaces your current garden ({state.transactions.length} transactions, {state.goals.length} goals).
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="mg-btn" onClick={confirmImport}
                style={{ background: C.tomato, border: `1.5px solid ${C.tomato}`, borderRadius: 10, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
                Replace my garden
              </button>
              <button className="mg-btn" onClick={() => setPendingImport(null)}
                style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* ===== the shed — housekeeping ===== */}
        <footer style={{ marginTop: 28, paddingTop: 16, borderTop: `1.5px dashed ${C.border}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft }}>
            🧰 The shed · your data saves automatically to this app's storage. Edit anything in place; delete a logged entry with its ✕.
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="mg-btn" onClick={saveBackup}
              style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
              ⬇️ Save backup
            </button>
            <button className="mg-btn" onClick={() => importInput.current?.click()}
              style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
              ⬆️ Import backup
            </button>
            <input ref={importInput} type="file" accept=".json,application/json" style={{ display: "none" }}
              onChange={(e) => {
                void onImportFile(e.target.files?.[0]);
                e.target.value = ""; // allow re-picking the same file
              }} />
            {!isEmpty && (
              <button className="mg-btn" onClick={() => { setStateSafe(sampleState()); setConfirmReset(false); showToast("🌼 Sample garden replanted"); }}
                style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
                Replant sample data
              </button>
            )}
            {confirmReset ? (
              <button className="mg-btn" onClick={() => { setStateSafe(emptyState()); setConfirmReset(false); setTab("overview"); showToast("🍂 Fresh soil — everything cleared"); }}
                style={{ background: C.tomato, border: `1.5px solid ${C.tomato}`, borderRadius: 10, padding: "7px 14px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
                Really erase everything?
              </button>
            ) : (
              <button className="mg-btn" onClick={() => { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); }}
                style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
                Start fresh…
              </button>
            )}
          </div>
        </footer>
      </main>

      {toast && (
        <div role="status" style={{
          position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)",
          background: C.ink, color: "#fff", padding: "12px 20px", borderRadius: 14,
          fontWeight: 600, boxShadow: "0 10px 30px rgba(28,53,42,.35)", animation: "mg-pop .25s ease", zIndex: 50, maxWidth: "90vw",
        }}>{toast}</div>
      )}
    </div>
  );
}
