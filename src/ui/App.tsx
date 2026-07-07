/*
 * MONEY GARDEN — root component: owns all state, storage load/persist,
 * every action handler, the header (weather + streak), tab nav, footer
 * ("the shed") with storage disclosure and two-step reset, and the toast.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Commitment, Goal, Invest, State, Transaction } from "../engine/types";
import { DEFAULT_INVEST, STORAGE_KEY } from "../engine/types";
import { fmt, monthKey, monthLabel, uid, todayISO } from "../engine/format";
import { derive, deriveMonthView, weatherFor } from "../engine/stats";
import { monthRange } from "../engine/trends";
import { bumpStreak, deserialize, emptyState, insertGoal, removeTransaction, sampleState, serialize, updateCommitment, updateGoal, updateTransaction } from "../engine/state";
import { buildBackup, parseBackup, type ImportPreview } from "../engine/backup";
import { createStore } from "../engine/storage";
import { C, resolveTheme, THEME_COLOR, THEME_KEY, type ThemeMode } from "./theme";
import { Overview } from "./tabs/Overview";
import { Log } from "./tabs/Log";
import { Budgets } from "./tabs/Budgets";
import { Garden } from "./tabs/Garden";
import { Orchard } from "./tabs/Orchard";
import { Seasons } from "./tabs/Seasons";
import { Advice } from "./tabs/Advice";

const store = createStore();

const TABS = [
  { id: "overview", label: "Overview", icon: "🌤️" },
  { id: "log",      label: "Log",      icon: "✏️" },
  { id: "budgets",  label: "Budgets",  icon: "🧺" },
  { id: "garden",   label: "Garden",   icon: "🌷" },
  { id: "orchard",  label: "Orchard",  icon: "🌳" },
  { id: "seasons",  label: "Seasons",  icon: "🍂" },
  { id: "advice",   label: "Advice",   icon: "🪴" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function MoneyGarden() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  /** YYYY-MM being browsed; null = today. Affects Overview, Log, Budget plots. */
  const [viewYm, setViewYm] = useState<string | null>(null);
  /** ☀️ day / 🌙 night / 🌗 auto (follows the clock, day 7am–7pm). */
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
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

  /* ---------- theme: day / night / auto ---------- */
  useEffect(() => {
    (async () => {
      const res = await store.get(THEME_KEY);
      const v = res?.value;
      if (v === "day" || v === "night" || v === "auto") setThemeMode(v);
    })();
  }, []);

  useEffect(() => {
    const apply = () => {
      const t = resolveTheme(themeMode);
      document.documentElement.dataset.theme = t;
      // Keep the PWA chrome (address bar / title bar) in the same weather.
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[t]);
    };
    apply();
    if (themeMode !== "auto") return;
    // In auto, the garden crosses dusk/dawn while open — re-check each
    // minute and whenever the tab wakes up.
    const iv = setInterval(apply, 60_000);
    document.addEventListener("visibilitychange", apply);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", apply);
    };
  }, [themeMode]);

  const cycleTheme = () => {
    const next: ThemeMode = themeMode === "day" ? "night" : themeMode === "night" ? "auto" : "day";
    setThemeMode(next);
    void store.set(THEME_KEY, next);
    showToast(next === "day" ? "☀️ Day garden" : next === "night" ? "🌙 Night garden" : "🌗 Following the clock — day 7am–7pm");
  };

  /* ---------- derived numbers (engine) ---------- */
  const derived = useMemo(() => (state ? derive(state) : null), [state]);
  const monthView = useMemo(() => (state && viewYm ? deriveMonthView(state, viewYm) : null), [state, viewYm]);
  const months = useMemo(() => (state ? monthRange(state) : []), [state]);

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

  // removeTransaction/updateTransaction also water/drain a linked goal when
  // the entry carries a goalId (see engine/state.ts).
  const deleteTransaction = (id: string) => {
    const existing = state.transactions.find((t) => t.id === id);
    if (!existing) return;
    const drainedGoal = existing.goalId ? state.goals.find((g) => g.id === existing.goalId) : undefined;
    setStateSafe(removeTransaction(state, id));
    showToast(drainedGoal ? `🍂 Entry deleted — "${drainedGoal.name}" adjusted too` : "🍂 Entry deleted");
  };

  const editTransaction = (id: string, patch: Partial<Omit<Transaction, "id">>) => {
    const existing = state.transactions.find((t) => t.id === id);
    if (!existing) return;
    const adjustedGoal =
      existing.goalId && patch.amount !== undefined && patch.amount !== existing.amount
        ? state.goals.find((g) => g.id === existing.goalId)
        : undefined;
    setStateSafe(updateTransaction(state, id, patch));
    showToast(adjustedGoal ? `✏️ Entry updated — "${adjustedGoal.name}" adjusted too` : "✏️ Entry updated");
  };

  const addGoal = (g: Omit<Goal, "id">) => {
    const movingLifebuoy = g.isEmergency && state.goals.some((x) => x.isEmergency);
    setStateSafe(insertGoal(state, { ...g, id: uid() }));
    if (movingLifebuoy) showToast(`🛟 "${g.name}" is now your emergency fund`);
  };

  const editGoal = (id: string, patch: Partial<Omit<Goal, "id" | "saved">>) => {
    const existing = state.goals.find((x) => x.id === id);
    if (!existing) return;
    const movingLifebuoy = patch.isEmergency === true && state.goals.some((x) => x.isEmergency && x.id !== id);
    setStateSafe(updateGoal(state, id, patch));
    showToast(movingLifebuoy ? `🛟 "${patch.name ?? existing.name}" is now your emergency fund` : "✏️ Goal updated");
  };

  // Spend from a goal: one honest expense entry (it hits budgets and monthly
  // spend like any other) that also drains the goal via its goalId. The UI
  // caps the amount at the balance so the entry stays exactly reversible.
  const drawFromGoal = (id: string, amount: number, category: string, note: string) => {
    const goal = state.goals.find((g) => g.id === id);
    if (!goal || !(amount > 0) || amount > goal.saved) return;
    const tx: Transaction = { id: uid(), type: "expense", amount, category, note: note.trim() || `From "${goal.name}"`, date: todayISO(), goalId: id };
    const goals = state.goals.map((g) => (g.id === id ? { ...g, saved: g.saved - amount } : g));
    setStateSafe({ ...state, goals, transactions: [tx, ...state.transactions], streak: bumpStreak(state.streak) });
    showToast(`🪣 ${fmt(amount)} drawn from "${goal.name}"`);
  };

  const waterGoal = (id: string, amount: number) => {
    const goals = state.goals.map((g) => {
      if (g.id !== id) return g;
      // No target cap (v0.7.0): overflowing is truthful, and it keeps the
      // journal entry exactly reversible.
      const saved = g.saved + amount;
      if (saved >= g.target && g.saved < g.target) showToast(`🌸 "${g.name}" is in full bloom — goal reached!`);
      return { ...g, saved };
    });
    // goalId links the entry so later edits/deletes can adjust the goal too.
    const tx: Transaction = { id: uid(), type: "saving", amount, category: "other", note: `→ ${state.goals.find((g) => g.id === id)?.name}`, date: todayISO(), goalId: id };
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
    // commitmentId links the entry: the next-due date derives from it and
    // deleting it reverts the payment (incl. installment paidCount).
    const tx: Transaction = { id: uid(), type: "expense", amount: Number(c.amount) || 0, category: c.category || "subs", note: `${c.kind === "inst" ? "Installment" : "Subscription"}: ${c.name}`, date: todayISO(), commitmentId: c.id };
    const commitments = (state.commitments || []).map((x) => (x.id === id && x.kind === "inst" ? { ...x, paidCount: (x.paidCount || 0) + 1 } : x));
    setStateSafe({ ...state, commitments, transactions: [tx, ...state.transactions], streak: bumpStreak(state.streak) });
    showToast(`💸 ${fmt(c.amount)} logged for "${c.name}"`);
  };

  const editCommitment = (id: string, patch: Partial<Omit<Commitment, "id">>) => {
    setStateSafe(updateCommitment(state, id, patch));
    showToast("✏️ Commitment updated");
  };

  // A tended garden isn't always a watered one — no-spend days keep the
  // streak alive without inventing a journal entry.
  const markNoSpendDay = () => {
    const bumped = bumpStreak(state.streak);
    if (bumped === state.streak) {
      showToast("🌱 Today's already tended — see you tomorrow.");
      return;
    }
    setStateSafe({ ...state, streak: bumped });
    showToast("🌵 A no-spend day — the garden rests.");
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
    setViewYm(null);
    setTab("overview");
    showToast(`🌱 Garden restored — ${counts.transactions} transactions, ${counts.goals} goals.`);
  };

  /* ---------- month navigation ---------- */
  const currentYm = monthKey();
  const shownYm = viewYm ?? currentYm;
  const shownIdx = months.indexOf(shownYm);
  const canPrev = shownIdx > 0;
  const canNext = viewYm !== null;
  const goToMonth = (ym: string) => setViewYm(ym === currentYm ? null : ym);

  const isEmpty = state.transactions.length === 0 && state.goals.length === 0;
  const weather = weatherFor(derived.health);
  const navBtnStyle = (enabled: boolean) => ({
    border: "none", background: "transparent", cursor: enabled ? "pointer" : "default",
    color: C.inkSoft, fontWeight: 700, fontSize: 18, lineHeight: 1, padding: "0 6px",
    opacity: enabled ? 1 : 0.25,
  } as const);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* ===== header ===== */}
      <header style={{ maxWidth: 980, margin: "0 auto", padding: "26px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: -6 }}>
              <button className="mg-btn" onClick={() => canPrev && goToMonth(months[shownIdx - 1])} disabled={!canPrev}
                aria-label="Previous month" style={navBtnStyle(canPrev)}>‹</button>
              <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: viewYm ? C.amber : C.inkSoft, fontWeight: 700 }}>
                {monthLabel(shownYm, true)}
              </div>
              <button className="mg-btn" onClick={() => canNext && goToMonth(months[shownIdx + 1] ?? currentYm)} disabled={!canNext}
                aria-label="Next month" style={navBtnStyle(canNext)}>›</button>
              {viewYm && (
                <button className="mg-btn" onClick={() => setViewYm(null)}
                  style={{ marginLeft: 4, border: `1.5px solid ${C.amber}`, background: C.tintAmber, color: C.amber, borderRadius: 999, padding: "2px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                  ↩ today
                </button>
              )}
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "clamp(30px, 5vw, 44px)", margin: "2px 0 0", lineHeight: 1.05 }}>
              Money Garden
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="mg-btn" onClick={cycleTheme} aria-label="Switch theme (day, night, or auto)"
              title={themeMode === "day" ? "Day garden — tap for night" : themeMode === "night" ? "Night garden — tap for auto" : "Auto: follows the clock, day 7am–7pm — tap for day"}
              style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "8px 12px", fontSize: 20, lineHeight: 1, cursor: "pointer" }}>
              {themeMode === "day" ? "☀️" : themeMode === "night" ? "🌙" : "🌗"}
            </button>
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
                color: tab === t.id ? C.inkContrast : C.ink,
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
            <button className="mg-btn" onClick={() => { setStateSafe(sampleState()); setViewYm(null); }}
              style={{ background: C.leaf, color: C.inkContrast, border: "none", borderRadius: 12, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>
              Plant sample data
            </button>
          </div>
        )}

        {tab === "overview" && <Overview state={state} d={derived} view={monthView} setIncome={setIncome} goTo={(t) => setTab(t as TabId)} />}
        {tab === "log" && <Log state={state} d={derived} view={monthView} addTransaction={addTransaction} deleteTransaction={deleteTransaction} updateTransaction={editTransaction} markNoSpend={markNoSpendDay} />}
        {tab === "budgets" && <Budgets state={state} d={derived} view={monthView} setBudget={setBudget} addCommitment={addCommitment} deleteCommitment={deleteCommitment} logCommitmentPayment={logCommitmentPayment} updateCommitment={editCommitment} />}
        {tab === "garden" && <Garden state={state} addGoal={addGoal} waterGoal={waterGoal} deleteGoal={deleteGoal} updateGoal={editGoal} drawFromGoal={drawFromGoal} />}
        {tab === "orchard" && <Orchard state={state} d={derived} setInvest={setInvest} addHolding={addHolding} updateHolding={updateHolding} deleteHolding={deleteHolding} waterOrchard={waterOrchard} />}
        {tab === "seasons" && <Seasons state={state} goToMonth={(ym) => { goToMonth(ym); setTab("overview"); }} />}
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
                style={{ background: C.tomato, border: `1.5px solid ${C.tomato}`, borderRadius: 10, padding: "8px 16px", fontWeight: 700, fontSize: 13, color: C.inkContrast, cursor: "pointer" }}>
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
            🧰 The shed · your data saves automatically to this app's storage. Edit a logged entry with its ✏️, delete with its ✕.
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
              <button className="mg-btn" onClick={() => { setStateSafe(sampleState()); setConfirmReset(false); setViewYm(null); showToast("🌼 Sample garden replanted"); }}
                style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
                Replant sample data
              </button>
            )}
            {confirmReset ? (
              <button className="mg-btn" onClick={() => { setStateSafe(emptyState()); setConfirmReset(false); setViewYm(null); setTab("overview"); showToast("🍂 Fresh soil — everything cleared"); }}
                style={{ background: C.tomato, border: `1.5px solid ${C.tomato}`, borderRadius: 10, padding: "7px 14px", fontWeight: 700, fontSize: 13, color: C.inkContrast, cursor: "pointer" }}>
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
          background: C.ink, color: C.inkContrast, padding: "12px 20px", borderRadius: 14,
          fontWeight: 600, boxShadow: `0 10px 30px ${C.shadow}`, animation: "mg-pop .25s ease", zIndex: 50, maxWidth: "90vw",
        }}>{toast}</div>
      )}
    </div>
  );
}
