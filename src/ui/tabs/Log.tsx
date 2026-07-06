/*
 * LOG — the daily driver: add expenses/income, browse and delete this
 * month's ledger.
 */
import { useState } from "react";
import type { State, Transaction } from "../../engine/types";
import { CATEGORIES } from "../../engine/types";
import type { Derived, MonthView } from "../../engine/stats";
import { fmt, monthLabel, todayISO } from "../../engine/format";
import { C, inputStyle } from "../theme";
import { CardTitle, Empty, Field } from "../bits";

export function Log({ d, view, addTransaction, deleteTransaction }: {
  state: State;
  d: Derived;
  /** A browsed past month; null/undefined = today. */
  view?: MonthView | null;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  deleteTransaction: (id: string) => void;
}) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("groceries");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());

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
              style={{ padding: "8px 16px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 14, border: `1.5px solid ${type === v ? C.ink : C.border}`, background: type === v ? C.ink : "#fff", color: type === v ? "#fff" : C.ink }}>
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
          style={{ marginTop: 14, background: amount ? C.leaf : C.border, color: "#fff", border: "none", borderRadius: 12, padding: "11px 22px", fontWeight: 700, fontSize: 15, cursor: amount ? "pointer" : "not-allowed" }}>
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
                  <button className="mg-btn" onClick={() => deleteTransaction(t.id)} title="Delete entry" aria-label="Delete entry"
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: C.inkSoft, fontSize: 15, padding: 4 }}>✕</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
