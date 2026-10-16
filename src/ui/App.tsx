/*
 * MONEY GARDEN — root component: owns all state, storage load/persist,
 * every action handler, the header (weather + streak), tab nav, footer
 * ("the shed") with storage disclosure and two-step reset, and the toast.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Commitment, Goal, Invest, State, Transaction } from "../engine/types";
import { DEFAULT_INVEST, STORAGE_KEY, UNREADABLE_KEY_PREFIX } from "../engine/types";
import { fmt, monthKey, monthLabel, uid, todayISO } from "../engine/format";
import { derive, deriveMonthView, weatherFor } from "../engine/stats";
import { monthRange } from "../engine/trends";
import { bumpStreak, canRemoveTransaction, deleteGoal as engineDeleteGoal, emptyState, insertGoal, isFreshGarden, linkedAmountBounds, loadSaved, removeTransaction, sampleState, serialize, setupEmergencyFund, updateCommitment, updateGoal, updateTransaction } from "../engine/state";
import { buildBackup, parseBackup, type ImportPreview } from "../engine/backup";
// A namespace import — like `import actions` in Python, then actions.x():
// keeps engine actions distinct from the App handlers that share their names.
import * as actions from "../engine/actions";
import type { ActionEvent, ActionResult } from "../engine/actions";
import { store } from "./store";
import { downloadText } from "./download";
import { Recovery } from "./Recovery";
import type { StorageMode } from "../engine/storage";
import { checkPersistentStorage, requestPersistentStorage, storageNote } from "./storageNote";
import { C, INSTALL_HINT_KEY, isIOS, isStandalone, isTouchDevice, resolveTheme, THEME_COLOR, THEME_KEY, type ThemeMode } from "./theme";
import { Overview } from "./tabs/Overview";
import { Log } from "./tabs/Log";
import { Budgets } from "./tabs/Budgets";
import { Garden } from "./tabs/Garden";
import { Orchard } from "./tabs/Orchard";
import { Seasons } from "./tabs/Seasons";
import { Advice } from "./tabs/Advice";

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
  // One-shot Log filter preset: the Overview's "Spent from goals" line jumps
  // to the Log pre-filtered to draws. Cleared on any ordinary tab switch so a
  // later manual visit to the Log starts unfiltered.
  const [logPreset, setLogPreset] = useState<"draw" | null>(null);
  const switchTab = (t: TabId) => { setLogPreset(null); setTab(t); };
  const goToDraws = () => { setLogPreset("draw"); setTab("log"); };
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmReplant, setConfirmReplant] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  /** YYYY-MM being browsed; null = today. Affects Overview, Log, Budget plots. */
  const [viewYm, setViewYm] = useState<string | null>(null);
  /** ☀️ day / 🌙 night / 🌗 auto (follows the clock, day 7am–7pm). */
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  /**
   * Install-hint preference: "show" → overlay + Advice-tab tip · "dismissed"
   * (overlay closed) → Advice tip only, in case it was closed hastily ·
   * "muted" (tip's ✕) → neither, ever. Defaults muted until storage is
   * checked, and stays muted for installed (standalone) launches.
   */
  const [installPref, setInstallPref] = useState<"show" | "dismissed" | "muted">("muted");
  const memoryFallback = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const importInput = useRef<HTMLInputElement>(null);

  // Take down the static index.html splash — React is painting now, and the
  // "Preparing your garden…" state below covers the brief storage load.
  useEffect(() => {
    document.getElementById("splash")?.remove();
  }, []);

  /**
   * Set when something IS saved but can't be read safely: the garden is
   * replaced by the Recovery screen and NOTHING is written to the save
   * until the user chooses (see onStartFreshOverUnreadable).
   */
  const [unreadable, setUnreadable] = useState<{ raw: string; reason: string } | null>(null);

  /* ---------- load & persist ---------- */
  useEffect(() => {
    (async () => {
      // store.get never throws (each tier swallows its own errors) and
      // loadSaved never throws (it returns a verdict instead).
      const res = await store.get(STORAGE_KEY);
      const loaded = loadSaved(res?.value);
      if (loaded.kind === "ok") { setState(loaded.state); setStorageMode(res!.mode); }
      else if (loaded.kind === "unreadable") setUnreadable({ raw: res?.value ?? "", reason: loaded.reason });
      // Only a genuinely empty save may be initialized — the old code also
      // landed here when the save failed to parse, erasing the only copy.
      else setStateSafe(emptyState(), true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Where the garden actually lives — the tier that handled the latest
   * load/save of the garden itself (not store.mode(), which other keys like
   * the theme also move). null until storage first answers. Drives the
   * shed's disclosure and, in "memory", the warning banner.
   */
  const [storageMode, setStorageMode] = useState<StorageMode | null>(null);
  /** The browser's answer to "don't evict this site": true/false, null = unknown. */
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const persistStage = useRef<"none" | "checked" | "asked">("none");
  useEffect(() => {
    if (!state || storageMode !== "local") return;
    // A brand-new garden only READS the current answer — Firefox shows a
    // permission prompt for persist(), and a first-time visitor with
    // nothing saved shouldn't meet one. Ask once the garden holds real data.
    if (isFreshGarden(state)) {
      if (persistStage.current !== "none") return;
      persistStage.current = "checked";
      void checkPersistentStorage().then(setPersisted);
      return;
    }
    if (persistStage.current === "asked") return;
    persistStage.current = "asked";
    void requestPersistentStorage().then(setPersisted);
  }, [state, storageMode]);

  // The user chose to start fresh over an unreadable save. Tuck the raw
  // string away under its own key first; overwrite only if that copy
  // persisted or the user already downloaded one — never with neither.
  const onStartFreshOverUnreadable = async (downloaded: boolean): Promise<boolean> => {
    if (!unreadable) return false;
    const kept = await store.set(`${UNREADABLE_KEY_PREFIX}:${new Date().toISOString()}`, unreadable.raw);
    if (!kept.persisted && !downloaded) return false;
    setUnreadable(null);
    setStateSafe(emptyState());
    showToast(kept.persisted
      ? "🌱 Fresh soil — the unreadable data was set aside, not erased."
      : "🌱 Fresh soil — your downloaded file is the copy of the old data.");
    return true;
  };

  const setStateSafe = (next: State, skipToastOnFail = false) => {
    setState(next);
    void (async () => {
      const r = await store.set(STORAGE_KEY, serialize(next));
      // Follows every save: a mid-session quota failure drops to memory
      // (banner appears), and a later successful write brings it back.
      setStorageMode(r.mode);
      // The memory tier reports persisted: false — also toast it once, like
      // the reference's one-time "session only" toast.
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

  /* ---------- install hint (browser-tab users only) ---------- */
  useEffect(() => {
    // Installed users never see either surface; others get their saved level.
    if (isStandalone()) return;
    (async () => {
      const res = await store.get(INSTALL_HINT_KEY);
      const v = res?.value;
      setInstallPref(v === "muted" ? "muted" : v === "dismissed" ? "dismissed" : "show");
    })();
  }, []);

  const dismissInstall = () => {
    setInstallPref("dismissed");
    void store.set(INSTALL_HINT_KEY, "dismissed");
  };
  const muteInstallTip = () => {
    setInstallPref("muted");
    void store.set(INSTALL_HINT_KEY, "muted");
  };

  // Escape dismisses via a document listener, so the button needs no
  // autofocus — which would paint the focus ring the moment the dialog opens.
  useEffect(() => {
    if (installPref !== "show") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismissInstall(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installPref]);

  /* ---------- derived numbers (engine) ---------- */
  const derived = useMemo(() => (state ? derive(state) : null), [state]);
  const monthView = useMemo(() => (state && viewYm ? deriveMonthView(state, viewYm) : null), [state, viewYm]);
  const months = useMemo(() => (state ? monthRange(state) : []), [state]);

  if (unreadable) {
    return <Recovery raw={unreadable.raw} reason={unreadable.reason} onStartFresh={onStartFreshOverUnreadable} />;
  }

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
  // Engine actions (src/engine/actions.ts) return { state, events }; commit
  // saves the new state if anything changed and hands back the events for
  // the handler's toast. An unchanged state (same object) is a no-op.
  const commit = (r: ActionResult): ActionEvent[] => {
    if (r.state !== state) setStateSafe(r.state);
    return r.events;
  };
  const streakToast = (events: ActionEvent[]) => {
    for (const e of events) {
      if (e.kind === "streakGrew" && e.count > 1) showToast(`🔥 ${e.count}-day logging streak — keep it growing!`);
    }
  };

  const addTransaction = (tx: Omit<Transaction, "id">) => {
    streakToast(commit(actions.logEntry(state, tx, new Date())));
  };

  // removeTransaction/updateTransaction also water/drain a linked goal when
  // the entry carries a goalId (see engine/state.ts).
  const deleteTransaction = (id: string) => {
    const existing = state.transactions.find((t) => t.id === id);
    if (!existing) return;
    // Backstop for the Log's own guard: a watering whose money was since
    // drawn can't be taken back without leaving a phantom balance.
    if (!canRemoveTransaction(state, existing)) {
      showToast("🪣 Part of that was already drawn — undo the draw first.");
      return;
    }
    const drainedGoal = existing.goalId ? state.goals.find((g) => g.id === existing.goalId) : undefined;
    setStateSafe(removeTransaction(state, id));
    showToast(drainedGoal ? `🍂 Entry deleted — "${drainedGoal.name}" adjusted too` : "🍂 Entry deleted");
  };

  const editTransaction = (id: string, patch: Partial<Omit<Transaction, "id">>) => {
    const existing = state.transactions.find((t) => t.id === id);
    if (!existing) return;
    if (patch.amount !== undefined && patch.amount !== existing.amount) {
      // Same backstop for edits: stay inside what the linked goal can give back.
      // Only when the amount actually changes — cent-rounded bounds can sit a
      // hair below a sub-cent amount, and that must not block a note/date edit.
      const { min, max } = linkedAmountBounds(state, existing);
      // !(x > 0) also catches NaN, which slips past both < and > comparisons.
      if (!(patch.amount > 0) || patch.amount < min || patch.amount > max) {
        showToast("🪣 That amount would break the link to its goal — see the note in the editor.");
        return;
      }
    }
    const adjustedGoal =
      existing.goalId && patch.amount !== undefined && patch.amount !== existing.amount
        ? state.goals.find((g) => g.id === existing.goalId)
        : undefined;
    setStateSafe(updateTransaction(state, id, patch));
    showToast(adjustedGoal ? `✏️ Entry updated — "${adjustedGoal.name}" adjusted too` : "✏️ Entry updated");
  };

  // Plantings are always regular goals (the barrel is permanent and minted
  // by the engine); a provided `saved` is an opening balance, no journal entry.
  const addGoal = (g: Omit<Goal, "id" | "isEmergency">) => {
    setStateSafe(insertGoal(state, { ...g, id: uid(), isEmergency: false }));
  };

  const editGoal = (id: string, patch: Partial<Omit<Goal, "id" | "saved" | "isEmergency">>) => {
    if (!state.goals.some((x) => x.id === id)) return;
    setStateSafe(updateGoal(state, id, patch));
    showToast("✏️ Goal updated");
  };

  // One-time barrel setup — target plus the money already set aside for it.
  // Deliberately no transaction: an opening balance is a starting fact, not
  // one of this month's flows (see setupEmergencyFund in the engine).
  const setupBarrel = (target: number, openingBalance: number) => {
    setStateSafe(setupEmergencyFund(state, target, openingBalance));
    showToast("🛟 Rain barrel set up — water it whenever you can");
  };

  // Spend from a goal (engine drawFromGoal): a linked expense that drains the
  // goal, budget-basis excluded — the 🌸 harvest story. The engine refuses
  // invalid draws (beyond the balance, non-positive/NaN, unknown goal) by
  // handing the same state back, so no toast then.
  const drawFromGoal = (id: string, amount: number, category: string, note: string) => {
    const r = actions.drawFromGoal(state, id, amount, category, note, new Date());
    if (r.state === state) return;
    commit(r);
    showToast(`🪣 ${fmt(amount)} drawn from "${state.goals.find((g) => g.id === id)?.name}"`);
  };

  // Water a goal (engine waterGoal): linked saving entry, no target cap.
  const waterGoal = (id: string, amount: number) => {
    for (const e of commit(actions.waterGoal(state, id, amount, new Date()))) {
      if (e.kind === "bloomed") showToast(`🌸 "${e.goalName}" is in full bloom — goal reached!`);
    }
  };

  // Engine-guarded: deleting the permanent barrel is a silent no-op there.
  const deleteGoal = (id: string) => setStateSafe(engineDeleteGoal(state, id));
  const setBudget = (catId: string, v: string) => setStateSafe({ ...state, budgets: { ...state.budgets, [catId]: Number(v) || 0 } });
  const setIncome = (v: string) => setStateSafe({ ...state, income: Number(v) || 0 });

  // The orchard (engine actions: updateInvest, addHolding, revalueHolding,
  // removeHolding, waterHolding).
  const setInvest = (patch: Partial<Invest>) => commit(actions.updateInvest(state, patch));
  const addHolding = (h: { name: string; value: number }) => {
    commit(actions.addHolding(state, h));
    showToast(`🌳 "${h.name}" planted in the orchard`);
  };
  // The value box hands us text; the engine takes a number (junk → 0 there).
  const updateHolding = (id: string, value: string) => commit(actions.revalueHolding(state, id, Number(value)));
  const deleteHolding = (id: string) => commit(actions.removeHolding(state, id));

  const waterOrchard = (id: string, amount: number) => {
    const target = (state.invest || DEFAULT_INVEST).holdings.find((h) => h.id === id);
    const r = actions.waterHolding(state, id, amount, new Date());
    if (!target || r.state === state) return; // unknown holding or a bad amount — nothing watered
    commit(r);
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
  // streak alive without inventing a journal entry (engine markNoSpendDay).
  const markNoSpendDay = () => {
    const r = actions.markNoSpendDay(state, new Date());
    if (r.state === state) {
      showToast("🌱 Today's already tended — see you tomorrow.");
      return;
    }
    commit(r);
    showToast("🌵 A no-spend day — the garden rests.");
  };

  /* ---------- backup: export & import ---------- */
  const saveBackup = () => {
    const { filename, json } = buildBackup(state);
    downloadText(filename, json);
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

  // "Fresh soil" = nothing entered at all — not just no entries and goals,
  // but no income, budgets, commitments, holdings, settings, or streak
  // either (engine isFreshGarden). It decides between the one-tap "Plant
  // sample data" card and the shed's two-step replant.
  const isEmpty = isFreshGarden(state);
  const note = storageNote(storageMode, persisted);
  // Passed by name, so it guards itself rather than trusting the card's
  // visibility: replace the garden ONLY if there's nothing to lose.
  const plantSampleData = () => {
    if (!isFreshGarden(state)) return;
    setStateSafe(sampleState());
    setViewYm(null);
  };
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
            <button key={t.id} onClick={() => switchTab(t.id)} className="mg-tab mg-btn"
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
        {/* Nothing is being saved: say so where it can't be missed, not
            only in the footer (CLAUDE.md: keep the disclosure visible). */}
        {note?.warn && (
          <div role="alert" className="mg-card" style={{ padding: "12px 16px", marginBottom: 18, border: `1.5px solid ${C.tomato}`, color: C.tomato, fontWeight: 600, fontSize: 13.5, lineHeight: 1.5 }}>
            {note.text}
          </div>
        )}
        {isEmpty && (
          <div className="mg-card" style={{ padding: 24, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20 }}>Fresh soil 🌱</div>
              <div style={{ color: C.inkSoft, fontSize: 14 }}>Log your first expense or plant a goal — or explore with sample data first.</div>
            </div>
            <button className="mg-btn" onClick={plantSampleData}
              style={{ background: C.leaf, color: C.inkContrast, border: "none", borderRadius: 12, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>
              Plant sample data
            </button>
          </div>
        )}

        {tab === "overview" && <Overview state={state} d={derived} view={monthView} setIncome={setIncome} goTo={(t) => switchTab(t as TabId)} goToDraws={goToDraws} />}
        {tab === "log" && <Log state={state} d={derived} view={monthView} addTransaction={addTransaction} deleteTransaction={deleteTransaction} updateTransaction={editTransaction} markNoSpend={markNoSpendDay} initialFilter={logPreset} />}
        {tab === "budgets" && <Budgets state={state} d={derived} view={monthView} setBudget={setBudget} addCommitment={addCommitment} deleteCommitment={deleteCommitment} logCommitmentPayment={logCommitmentPayment} updateCommitment={editCommitment} />}
        {tab === "garden" && <Garden state={state} monthlyExpenses={derived.monthlyExpenses} expensesBasis={derived.expensesBasis} addGoal={addGoal} waterGoal={waterGoal} deleteGoal={deleteGoal} updateGoal={editGoal} drawFromGoal={drawFromGoal} setupEmergencyFund={setupBarrel} />}
        {tab === "orchard" && <Orchard state={state} d={derived} setInvest={setInvest} addHolding={addHolding} updateHolding={updateHolding} deleteHolding={deleteHolding} waterOrchard={waterOrchard} />}
        {tab === "seasons" && <Seasons state={state} goToMonth={(ym) => { goToMonth(ym); setTab("overview"); }} />}
        {tab === "advice" && <Advice state={state} d={derived} showInstallTip={installPref !== "muted"} onMuteInstallTip={muteInstallTip} />}

        {/* ===== import confirm card ===== */}
        {pendingImport && (
          <section className="mg-card" style={{ marginTop: 24, padding: 20, border: `1.5px solid ${C.marigold}` }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Restore from backup? 🏦</div>
            <p style={{ margin: "0 0 6px", fontSize: 13.5, color: C.inkSoft }}>
              This backup contains <b className="mg-num" style={{ color: C.ink }}>{pendingImport.counts.transactions}</b> transactions · <b className="mg-num" style={{ color: C.ink }}>{pendingImport.counts.goals}</b> goals · <b className="mg-num" style={{ color: C.ink }}>{pendingImport.counts.commitments}</b> commitments · <b className="mg-num" style={{ color: C.ink }}>{pendingImport.counts.holdings}</b> holdings{pendingImport.exportedAt ? <> · exported {pendingImport.exportedAt}</> : null}.
            </p>
            <p style={{ margin: "0 0 12px", fontSize: 13.5, color: C.tomato, fontWeight: 600 }}>
              {/* An untouched built-in barrel isn't something you'd lose —
                  but a set-up or funded one is, so it counts. */}
              ⚠ Importing replaces your current garden ({state.transactions.length} transactions, {state.goals.filter((g) => !(g.isEmergency && g.target === 0 && g.saved === 0)).length} goals).
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
            🧰 The shed · {note && <span style={note.warn ? { color: C.tomato, fontWeight: 600 } : undefined}>{note.text} </span>}Edit a logged entry with its ✏️, delete with its ✕.
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
            {/* Replanting overwrites the whole garden, so it two-steps like
                Start fresh (arm → 4s window → tomato confirm). */}
            {!isEmpty && (confirmReplant ? (
              <button className="mg-btn" onClick={() => { setStateSafe(sampleState()); setConfirmReplant(false); setConfirmReset(false); setViewYm(null); showToast("🌼 Sample garden replanted"); }}
                style={{ background: C.tomato, border: `1.5px solid ${C.tomato}`, borderRadius: 10, padding: "7px 14px", fontWeight: 700, fontSize: 13, color: C.inkContrast, cursor: "pointer" }}>
                Really replace everything with sample data?
              </button>
            ) : (
              <button className="mg-btn" onClick={() => { setConfirmReplant(true); setConfirmReset(false); setTimeout(() => setConfirmReplant(false), 4000); }}
                style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
                Replant sample data…
              </button>
            ))}
            {confirmReset ? (
              <button className="mg-btn" onClick={() => { setStateSafe(emptyState()); setConfirmReset(false); setViewYm(null); setTab("overview"); showToast("🍂 Fresh soil — everything cleared"); }}
                style={{ background: C.tomato, border: `1.5px solid ${C.tomato}`, borderRadius: 10, padding: "7px 14px", fontWeight: 700, fontSize: 13, color: C.inkContrast, cursor: "pointer" }}>
                Really erase everything?
              </button>
            ) : (
              <button className="mg-btn" onClick={() => { setConfirmReset(true); setConfirmReplant(false); setTimeout(() => setConfirmReset(false), 4000); }}
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

      {/* ===== one-time install invitation (browser tabs only) =====
          Any dismissal — button, tapping outside, Escape — is permanent. */}
      {installPref === "show" && (
        <div role="dialog" aria-modal="true" aria-label="Add Money Garden to your home screen"
          onClick={dismissInstall}
          style={{ position: "fixed", inset: 0, background: C.shadow, zIndex: 60, display: "grid", placeItems: "center", padding: 20 }}>
          <div className="mg-card" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400, padding: "26px 24px", display: "grid", gap: 10, justifyItems: "center", textAlign: "center", boxShadow: `0 18px 50px ${C.shadow}`, animation: "mg-pop .3s ease" }}>
            <div style={{ fontSize: 38, lineHeight: 1 }}>{isIOS() || isTouchDevice() ? "📲" : "🖥️"}</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 21 }}>Take the garden with you</div>
            <p style={{ margin: 0, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
              {isIOS()
                ? <>Tap <b style={{ color: C.ink }}>Share</b> → <b style={{ color: C.ink }}>Add to Home Screen</b> for a full-screen app — it also keeps your garden safe from Safari's periodic storage cleanup.</>
                : isTouchDevice()
                  ? <>Install it from your browser menu — <b style={{ color: C.ink }}>Add to Home screen</b> or <b style={{ color: C.ink }}>Install app</b> — for a full-screen app that works offline.</>
                  : <>Look for the <b style={{ color: C.ink }}>install icon in the address bar</b> (Chrome/Edge) or <b style={{ color: C.ink }}>File → Add to Dock</b> (Safari) for a windowed app of its own.</>}
            </p>
            <button className="mg-btn" onClick={dismissInstall}
              style={{ marginTop: 6, background: C.leaf, color: C.inkContrast, border: "none", borderRadius: 12, padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
