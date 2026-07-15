/*
 * LOG — the daily driver: add expenses/income, browse and delete this
 * month's ledger.
 */
import { useRef, useState } from "react";
import type { State, Transaction, TransactionType } from "../../engine/types";
import { CATEGORIES } from "../../engine/types";
import type { Derived, MonthView } from "../../engine/stats";
import type { JournalFilter } from "../../engine/journal";
import { isFilterActive, matchesFilter, SAVING_LABEL } from "../../engine/journal";
import { fmt, monthLabel, todayISO } from "../../engine/format";
import { C, inputStyle } from "../theme";
import { CardTitle, Empty, Field } from "../bits";

/** Rows rendered per "page" of the ledger — more revealed via Show more. */
const PAGE = 40;

export function Log({ state, d, view, addTransaction, deleteTransaction, updateTransaction, markNoSpend }: {
  state: State;
  d: Derived;
  /** A browsed past month; null/undefined = today. */
  view?: MonthView | null;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  deleteTransaction: (id: string) => void;
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  /** Bumps the streak without a journal entry — no-spend days count as tending. */
  markNoSpend: () => void;
}) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("groceries");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());

  // Inline editing — one row at a time; opening another pencil swaps rows.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eType, setEType] = useState<"expense" | "income">("expense");
  const [eAmount, setEAmount] = useState("");
  const [eCategory, setECategory] = useState("groceries");
  const [eNote, setENote] = useState("");
  const [eDate, setEDate] = useState("");

  // Search & filters — the 🔍 morphs into a search pill; everything clears
  // when it collapses, so a narrowed list can never be an invisible mystery.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [fType, setFType] = useState<"all" | TransactionType>("all");
  const [fCategory, setFCategory] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const searchRef = useRef<HTMLInputElement>(null);

  const openSearch = () => {
    setSearchOpen(true);
    // autoFocus only fires on mount; the input is always mounted (it animates),
    // so focus on the next frame once it's visible.
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const clearFilters = () => {
    setQuery(""); setFType("all"); setFCategory("all"); setFFrom(""); setFTo("");
  };
  const closeSearch = () => {
    clearFilters();
    setShowFilters(false);
    setSearchOpen(false);
  };

  // Two-step delete, same idiom as the footer's reset: first tap arms the
  // row ("Delete?"), auto-reverting after 4s; second tap deletes.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armDelete = (id: string) => {
    setConfirmDeleteId(id);
    clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 4000);
  };

  const openEdit = (t: Transaction) => {
    setConfirmDeleteId(null);
    setEditingId(t.id);
    setEType(t.type === "income" ? "income" : "expense");
    setEAmount(String(t.amount));
    setECategory(t.category);
    setENote(t.note);
    setEDate(t.date);
  };
  // Linked entries keep their type: saving entries belong to watering flows,
  // goalId/commitmentId entries have side effects a type change would orphan.
  const typeLocked = (t: Transaction) => t.type === "saving" || Boolean(t.goalId || t.commitmentId);
  // A draw entry (expense + goalId) can only grow as far as the goal's
  // remaining balance — otherwise deletion couldn't reverse it exactly.
  const maxDrawFor = (t: Transaction): number | null => {
    if (t.type !== "expense" || !t.goalId) return null;
    const g = state.goals.find((x) => x.id === t.goalId);
    return g ? t.amount + g.saved : null;
  };
  const canSaveFor = (t: Transaction) => {
    const a = parseFloat(eAmount);
    if (!(a > 0)) return false;
    const max = maxDrawFor(t);
    return max === null || a <= max;
  };
  const saveEdit = (t: Transaction) => {
    if (!canSaveFor(t)) return;
    const patch: Partial<Omit<Transaction, "id">> = { amount: parseFloat(eAmount), note: eNote.trim(), date: eDate };
    if (!typeLocked(t)) {
      patch.type = eType;
      patch.category = eType === "income" ? "other" : eCategory;
    } else if (t.type === "expense") {
      patch.category = eCategory; // draws/payments keep their type, not their category
    }
    updateTransaction(t.id, patch);
    setEditingId(null);
  };

  const submit = () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) return;
    addTransaction({ type, amount: a, category: type === "income" ? "other" : category, note: note.trim(), date });
    setAmount(""); setNote("");
  };

  const jf: JournalFilter = {
    text: query,
    type: fType === "all" ? undefined : fType,
    category: fCategory === "all" ? undefined : fCategory,
    from: fFrom || undefined,
    to: fTo || undefined,
  };
  const monthTx = (view ?? d).monthTx;
  // The row being edited is pinned into the results even if the filter no
  // longer matches it — typing in search must never swallow an open editor.
  const filtered = monthTx.filter((t) => t.id === editingId || matchesFilter(t, jf));
  const shown = filtered.slice(0, visibleCount);
  const hidden = filtered.length - shown.length;
  const filterActive = isFilterActive(jf);

  // Rewind Show-more whenever the month or the filter changes — the
  // adjust-state-during-render pattern (no effect, no remount, focus kept).
  const listKey = `${view?.ym ?? "now"}|${query}|${fType}|${fCategory}|${fFrom}|${fTo}`;
  const [prevKey, setPrevKey] = useState(listKey);
  if (listKey !== prevKey) {
    setPrevKey(listKey);
    setVisibleCount(PAGE);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>Log something</CardTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {([["expense", "🧾 Expense"], ["income", "💵 Income"]] as const).map(([v, l]) => (
            <button key={v} className="mg-btn" onClick={() => setType(v)}
              style={{ padding: "8px 16px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 14, border: `1.5px solid ${type === v ? C.ink : C.border}`, background: type === v ? C.ink : C.card, color: type === v ? C.inkContrast : C.ink }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <Field label="Amount">
            <input className="mg-num" type="number" min="0" step="0.01" value={amount} placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={inputStyle} />
          </Field>
          {type === "expense" && (
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Note (optional)">
            <input value={note} placeholder={type === "expense" ? "Ramen with Sam" : "Paycheck"} maxLength={60}
              onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
          </Field>
          <Field label="Date">
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
          <button className="mg-btn" onClick={submit} disabled={!amount}
            style={{ background: amount ? C.leaf : C.border, color: C.inkContrast, border: "none", borderRadius: 12, padding: "11px 22px", fontWeight: 700, fontSize: 15, cursor: amount ? "pointer" : "not-allowed" }}>
            {type === "expense" ? "Add expense" : "Add income"}
          </button>
          <span style={{ fontSize: 13, color: C.inkSoft }}>
            Nothing to log?{" "}
            <button className="mg-btn" onClick={markNoSpend}
              style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 999, padding: "6px 12px", fontWeight: 700, fontSize: 12.5, color: C.inkSoft, cursor: "pointer" }}>
              🌵 Mark a no-spend day
            </button>
          </span>
        </div>
      </section>

      <section className="mg-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <CardTitle style={{ margin: 0, flex: "0 1 auto", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {view ? `${monthLabel(view.ym)}'s ledger` : "This month's ledger"}
          </CardTitle>
          {monthTx.length > 0 && (
            <div className={"mg-search" + (searchOpen ? " open" : "")}>
              <button className="mg-btn" onClick={searchOpen ? () => searchRef.current?.focus() : openSearch}
                aria-label="Search the journal" title="Search the journal" tabIndex={searchOpen ? -1 : 0}
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 15, width: 37, height: 37, flex: "0 0 auto", padding: 0, borderRadius: 999 }}>
                🔍
              </button>
              <input ref={searchRef} className="mg-search-extra" value={query} placeholder="Search the journal…" maxLength={60}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", font: "inherit", fontSize: 14, color: C.ink, padding: 0, height: "100%" }} />
              <button className="mg-btn mg-search-extra" onClick={() => setShowFilters((v) => !v)}
                style={{ padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 12, flex: "0 0 auto", border: `1.5px solid ${showFilters || filterActive ? C.ink : C.border}`, background: showFilters || filterActive ? C.ink : C.card, color: showFilters || filterActive ? C.inkContrast : C.ink }}>
                Filters
              </button>
              <button className="mg-btn mg-search-extra" onClick={closeSearch} aria-label="Close search" title="Close search"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: C.inkSoft, fontSize: 15, flex: "0 0 auto", padding: "0 12px 0 4px" }}>
                ✕
              </button>
            </div>
          )}
        </div>
        {monthTx.length === 0 ? (
          <Empty text={view ? "Nothing was logged that month." : "Nothing logged yet this month."} />
        ) : (
          <>
            <div className={"mg-collapse" + (searchOpen && showFilters ? " open" : "")}>
              {/* overflow:hidden clips at the padding edge — the 6px padding
                  (pulled back by the negative margin so nothing shifts) keeps
                  the edge inputs' focus outlines inside the clip box. */}
              <div style={{ padding: "0 6px", margin: "0 -6px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, padding: "4px 0 12px" }}>
                  <Field label="Type">
                    <select value={fType} style={inputStyle}
                      onChange={(e) => {
                        const v = e.target.value as "all" | TransactionType;
                        setFType(v);
                        // income/saving rows all store category "other" — a leftover
                        // category filter would invisibly empty the results.
                        if (v === "income" || v === "saving") setFCategory("all");
                      }}>
                      <option value="all">All</option>
                      <option value="expense">🧾 Expenses</option>
                      <option value="income">💵 Income</option>
                      <option value="saving">🪴 Savings</option>
                    </select>
                  </Field>
                  {(fType === "all" || fType === "expense") && (
                    <Field label="Category">
                      <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} style={inputStyle}>
                        <option value="all">All</option>
                        {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label="From">
                    <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="To">
                    <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} style={inputStyle} />
                  </Field>
                </div>
              </div>
            </div>
            {filterActive && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: C.inkSoft, marginBottom: 8 }}>
                <span>{filtered.length} of {monthTx.length} entries</span>
                <button className="mg-btn" onClick={clearFilters}
                  style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 999, padding: "3px 10px", fontWeight: 700, fontSize: 11.5, color: C.inkSoft, cursor: "pointer" }}>
                  Clear
                </button>
              </div>
            )}
            {filterActive && filtered.length === 0 ? (
              <Empty text="No entries match — the journal's quiet under these filters." cta="Clear filters" onClick={clearFilters} />
            ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {shown.map((t) => {
              const cat = CATEGORIES.find((c) => c.id === t.category);
              const sign = t.type === "income" ? "+" : t.type === "saving" ? "→" : "−";
              const color = t.type === "income" ? C.leafDark : t.type === "saving" ? C.marigold : C.ink;
              if (t.id === editingId) {
                return (
                  <li key={t.id} style={{ margin: "4px 0", padding: "12px 10px", borderRadius: 12, background: C.mist, border: `1.5px solid ${C.border}`, display: "grid", gap: 10 }}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t); if (e.key === "Escape") setEditingId(null); }}>
                    {!typeLocked(t) && (
                      <div style={{ display: "flex", gap: 8 }}>
                        {([["expense", "🧾 Expense"], ["income", "💵 Income"]] as const).map(([v, l]) => (
                          <button key={v} className="mg-btn" onClick={() => setEType(v)}
                            style={{ padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 12, border: `1.5px solid ${eType === v ? C.ink : C.border}`, background: eType === v ? C.ink : C.card, color: eType === v ? C.inkContrast : C.ink }}>
                            {l}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                      <Field label="Amount">
                        <input className="mg-num" type="number" min="0" step="0.01" value={eAmount} autoFocus
                          onChange={(e) => setEAmount(e.target.value)} style={inputStyle} />
                      </Field>
                      {(typeLocked(t) ? t.type === "expense" : eType === "expense") && (
                        <Field label="Category">
                          <select value={eCategory} onChange={(e) => setECategory(e.target.value)} style={inputStyle}>
                            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                          </select>
                        </Field>
                      )}
                      <Field label="Note">
                        <input value={eNote} maxLength={60} onChange={(e) => setENote(e.target.value)} style={inputStyle} />
                      </Field>
                      <Field label="Date">
                        <input type="date" value={eDate} max={todayISO()} onChange={(e) => setEDate(e.target.value)} style={inputStyle} />
                      </Field>
                    </div>
                    {t.goalId && !state.goals.some((g) => g.id === t.goalId) && (
                      <div style={{ fontSize: 12, color: C.inkSoft }}>🥀 The goal this fed has been deleted — editing changes only the journal.</div>
                    )}
                    {t.goalId && t.type === "saving" && state.goals.some((g) => g.id === t.goalId) && (
                      <div style={{ fontSize: 12, color: C.inkSoft }}>💧 Linked to a goal — changing the amount waters or drains it.</div>
                    )}
                    {t.goalId && t.type === "expense" && maxDrawFor(t) !== null && (
                      <div style={{ fontSize: 12, color: parseFloat(eAmount) > maxDrawFor(t)! ? C.tomato : C.inkSoft }}>
                        🪣 Drawn from a goal — changing the amount adjusts it (up to {fmt(maxDrawFor(t)!)}).
                      </div>
                    )}
                    {t.holdingId && state.invest?.holdings.some((h) => h.id === t.holdingId) && (
                      <div style={{ fontSize: 12, color: C.inkSoft }}>💧 Watered into the orchard — changing the amount adjusts the holding.</div>
                    )}
                    {t.holdingId && !state.invest?.holdings.some((h) => h.id === t.holdingId) && (
                      <div style={{ fontSize: 12, color: C.inkSoft }}>🥀 The tree this watered has been felled — editing changes only the journal.</div>
                    )}
                    {t.commitmentId && (
                      <div style={{ fontSize: 12, color: C.inkSoft }}>💸 A commitment payment — deleting it un-does the payment.</div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="mg-btn" onClick={() => saveEdit(t)} disabled={!canSaveFor(t)}
                        style={{ background: canSaveFor(t) ? C.leaf : C.border, color: C.inkContrast, border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: canSaveFor(t) ? "pointer" : "not-allowed" }}>
                        Save
                      </button>
                      <button className="mg-btn" onClick={() => setEditingId(null)}
                        style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </li>
                );
              }
              return (
                <li key={t.id} className="mg-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 8px", borderRadius: 10 }}>
                  <span style={{ fontSize: 20 }}>{t.type === "income" ? "💵" : t.type === "saving" ? "🪴" : cat?.emoji || "🌀"}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.note || (t.type === "saving" ? SAVING_LABEL : cat?.label || "Other")}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.inkSoft }}>
                      {new Date(t.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {t.type === "expense" && cat ? ` · ${cat.label}` : ""}
                    </div>
                  </span>
                  <b className="mg-num" style={{ color, fontSize: 15 }}>{sign}{fmt(t.amount)}</b>
                  <button className="mg-btn" onClick={() => openEdit(t)} title="Edit entry" aria-label="Edit entry"
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: C.inkSoft, fontSize: 14, padding: 4 }}>✏️</button>
                  {confirmDeleteId === t.id ? (
                    <button className="mg-btn" onClick={() => { deleteTransaction(t.id); setConfirmDeleteId(null); }}
                      title="Really delete this entry" aria-label="Really delete this entry"
                      style={{ background: C.tomato, border: "none", borderRadius: 999, padding: "4px 10px", fontWeight: 700, fontSize: 12, color: C.inkContrast, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Delete?
                    </button>
                  ) : (
                    <button className="mg-btn" onClick={() => armDelete(t.id)} title="Delete entry" aria-label="Delete entry"
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: C.inkSoft, fontSize: 15, padding: 4 }}>✕</button>
                  )}
                </li>
              );
            })}
          </ul>
            )}
            {hidden > 0 && (
              <button className="mg-btn" onClick={() => setVisibleCount((c) => c + PAGE)}
                style={{ width: "100%", marginTop: 8, background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "10px 0", fontWeight: 700, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
                Show {Math.min(PAGE, hidden)} more ({hidden} remaining)
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
