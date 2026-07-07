/*
 * LOG — the daily driver: add expenses/income, browse and delete this
 * month's ledger.
 */
import { useRef, useState } from "react";
import type { State, Transaction } from "../../engine/types";
import { CATEGORIES } from "../../engine/types";
import type { Derived, MonthView } from "../../engine/stats";
import { fmt, monthLabel, todayISO } from "../../engine/format";
import { C, inputStyle } from "../theme";
import { CardTitle, Empty, Field } from "../bits";

export function Log({ d, view, addTransaction, deleteTransaction, updateTransaction }: {
  state: State;
  d: Derived;
  /** A browsed past month; null/undefined = today. */
  view?: MonthView | null;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  deleteTransaction: (id: string) => void;
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
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
  const canSaveEdit = parseFloat(eAmount) > 0;
  const saveEdit = (t: Transaction) => {
    if (!canSaveEdit) return;
    const patch: Partial<Omit<Transaction, "id">> = { amount: parseFloat(eAmount), note: eNote.trim(), date: eDate };
    // Saving entries keep their type — they belong to the watering flows.
    if (t.type !== "saving") {
      patch.type = eType;
      patch.category = eType === "income" ? "other" : eCategory;
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
        <button className="mg-btn" onClick={submit} disabled={!amount}
          style={{ marginTop: 14, background: amount ? C.leaf : C.border, color: C.inkContrast, border: "none", borderRadius: 12, padding: "11px 22px", fontWeight: 700, fontSize: 15, cursor: amount ? "pointer" : "not-allowed" }}>
          {type === "expense" ? "Add expense" : "Add income"}
        </button>
      </section>

      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>{view ? `${monthLabel(view.ym)}'s ledger` : "This month's ledger"}</CardTitle>
        {(view ?? d).monthTx.length === 0 ? (
          <Empty text={view ? "Nothing was logged that month." : "Nothing logged yet this month."} />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {(view ?? d).monthTx.slice(0, 40).map((t) => {
              const cat = CATEGORIES.find((c) => c.id === t.category);
              const sign = t.type === "income" ? "+" : t.type === "saving" ? "→" : "−";
              const color = t.type === "income" ? C.leafDark : t.type === "saving" ? C.marigold : C.ink;
              if (t.id === editingId) {
                return (
                  <li key={t.id} style={{ margin: "4px 0", padding: "12px 10px", borderRadius: 12, background: C.mist, border: `1.5px solid ${C.border}`, display: "grid", gap: 10 }}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t); if (e.key === "Escape") setEditingId(null); }}>
                    {t.type !== "saving" && (
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
                      {t.type !== "saving" && eType === "expense" && (
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
                    {t.goalId && (
                      <div style={{ fontSize: 12, color: C.inkSoft }}>💧 Linked to a goal — changing the amount waters or drains it.</div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="mg-btn" onClick={() => saveEdit(t)} disabled={!canSaveEdit}
                        style={{ background: canSaveEdit ? C.leaf : C.border, color: C.inkContrast, border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: canSaveEdit ? "pointer" : "not-allowed" }}>
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
                      {t.note || (t.type === "saving" ? "Goal contribution" : cat?.label || "Other")}
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
      </section>
    </div>
  );
}
