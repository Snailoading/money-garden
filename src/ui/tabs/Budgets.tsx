/*
 * BUDGETS — monthly plots with color-coded progress, plus Vines & Trellis
 * (recurring commitments) with a due-soon strip and one-tap payment logging.
 */
import { useState } from "react";
import type { Commitment, State } from "../../engine/types";
import { CATEGORIES } from "../../engine/types";
import type { Derived } from "../../engine/stats";
import { fmt, MONTH_NAMES, shortDate, todayISO } from "../../engine/format";
import { commitmentEnded, daysUntil, nextDueDate } from "../../engine/commitments";
import { C, inputStyle } from "../theme";
import { CardTitle, Field } from "../bits";

export function Budgets({ state, d, setBudget, addCommitment, deleteCommitment, logCommitmentPayment }: {
  state: State;
  d: Derived;
  setBudget: (catId: string, v: string) => void;
  addCommitment: (c: Omit<Commitment, "id">) => void;
  deleteCommitment: (id: string) => void;
  logCommitmentPayment: (id: string) => void;
}) {
  const cm = d.commit;
  const [cKind, setCKind] = useState<"sub" | "inst">("sub");
  const [cName, setCName] = useState("");
  const [cAmount, setCAmount] = useState("");
  const [cCadence, setCCadence] = useState<"monthly" | "annual">("monthly");
  const [cDay, setCDay] = useState<number | string>(1);
  const [cMonth, setCMonth] = useState<number | string>(1);
  const [cEnd, setCEnd] = useState("");
  const [cTotal, setCTotal] = useState("");
  const [cPaid, setCPaid] = useState("");
  const [cCategory, setCCategory] = useState("subs");

  const canAdd = Boolean(cName.trim() && parseFloat(cAmount) > 0 && (cKind === "sub" || parseInt(cTotal) > 0));
  const submitCommitment = () => {
    if (!canAdd) return;
    addCommitment({
      kind: cKind, name: cName.trim(), amount: parseFloat(cAmount),
      // Installments are always monthly — the cadence picker only shows for subs.
      cadence: cKind === "inst" ? "monthly" : cCadence,
      payDay: Math.min(31, Math.max(1, parseInt(String(cDay)) || 1)),
      payMonth: Math.min(12, Math.max(1, parseInt(String(cMonth)) || 1)),
      endDate: cKind === "sub" ? cEnd : "",
      totalPayments: cKind === "inst" ? Math.max(1, parseInt(cTotal) || 1) : undefined,
      paidCount: cKind === "inst" ? Math.max(0, parseInt(cPaid) || 0) : undefined,
      category: cCategory,
    });
    setCName(""); setCAmount(""); setCEnd(""); setCTotal(""); setCPaid("");
  };

  const subs = cm.all.filter((c) => c.kind === "sub");
  const insts = cm.all.filter((c) => c.kind === "inst");

  const CommitmentRow = ({ c }: { c: Commitment }) => {
    const ended = commitmentEnded(c);
    const due = nextDueDate(c);
    const days = daysUntil(due);
    const cat = CATEGORIES.find((x) => x.id === c.category);
    return (
      <div className="mg-row" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 12, border: `1.5px solid ${C.border}`, opacity: ended ? 0.6 : 1 }}>
        <span style={{ fontSize: 17 }}>{c.kind === "inst" ? "🪜" : "🌿"}</span>
        <div style={{ flex: "1 1 150px", minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {c.name} {cat && <span style={{ fontSize: 12 }}>{cat.emoji}</span>}
          </div>
          <div style={{ fontSize: 12, color: C.inkSoft }}>
            {c.kind === "inst" ? (
              ended ? "All payments made 🎉" : <>{c.paidCount || 0} of {c.totalPayments} paid · {fmt(((c.totalPayments ?? 0) - (c.paidCount || 0)) * c.amount)} to go</>
            ) : (
              <>{c.cadence === "annual" ? "yearly" : "monthly"}{c.endDate ? ` · ends ${c.endDate}` : ""}</>
            )}
            {!ended && <> · next {shortDate(due)}{days <= 7 ? ` (in ${days}d)` : ""}</>}
          </div>
          {c.kind === "inst" && !ended && (
            <div style={{ height: 6, background: C.mist, border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden", marginTop: 4, maxWidth: 220 }}>
              <div style={{ width: `${Math.min(100, ((c.paidCount || 0) / (c.totalPayments ?? 1)) * 100)}%`, height: "100%", background: C.leaf }} />
            </div>
          )}
        </div>
        <span className="mg-num" style={{ fontWeight: 700, fontSize: 14 }}>
          {fmt(c.amount)}<span style={{ fontWeight: 500, fontSize: 12, color: C.inkSoft }}>{c.kind === "inst" ? "/pmt" : c.cadence === "annual" ? "/yr" : "/mo"}</span>
        </span>
        {!ended && (
          <button className="mg-btn" onClick={() => logCommitmentPayment(c.id)}
            style={{ background: "transparent", border: `1.5px solid ${C.leafDark}`, color: C.leafDark, borderRadius: 10, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            💸 Log payment
          </button>
        )}
        <button className="mg-btn" onClick={() => deleteCommitment(c.id)} title="Remove" aria-label={`Remove ${c.name}`}
          style={{ border: "none", background: "transparent", color: C.inkSoft, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>Monthly plots</CardTitle>
        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: C.inkSoft }}>
          Each category is a plot of soil with a budget. Green means room to grow, amber means nearly full, red means it's overgrown. Total planned: <b className="mg-num">{fmt(d.totalBudget)}</b>.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {CATEGORIES.map((c) => {
            const spent = d.byCat[c.id] || 0;
            const budget = state.budgets[c.id] || 0;
            const pct = budget > 0 ? spent / budget : 0;
            const barColor = pct > 1 ? C.tomato : pct > 0.8 ? C.marigold : C.leaf;
            return (
              <div key={c.id} style={{ display: "grid", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {c.emoji} {c.label}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: c.kind === "need" ? C.leafDark : C.soil, background: c.kind === "need" ? "#E2F0E6" : "#F0E9DE", padding: "2px 8px", borderRadius: 999 }}>{c.kind}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span className="mg-num" style={{ color: pct > 1 ? C.tomato : C.inkSoft }}>{fmt(spent)} of</span>
                    <input className="mg-num" type="number" min="0" value={budget || ""} placeholder="0"
                      onChange={(e) => setBudget(c.id, e.target.value)}
                      style={{ ...inputStyle, width: 88, padding: "5px 8px" }} aria-label={`${c.label} budget`} />
                  </span>
                </div>
                <div style={{ height: 12, background: C.mist, border: `1.5px solid ${C.border}`, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, pct * 100)}%`, height: "100%", background: barColor, borderRadius: 999, transition: "width .4s ease" }} />
                </div>
                {pct > 1 && <div style={{ fontSize: 12, color: C.tomato, fontWeight: 600 }}>Overgrown by {fmt(spent - budget)} — worth pruning next month.</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== vines & trellis: recurring commitments ===== */}
      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>Vines &amp; trellis <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: 15 }}>· recurring commitments</span></CardTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13.5, color: C.inkSoft }}>
          🌿 <b>Vines</b> are subscriptions — they keep drinking until you cut them. 🪜 <b>The trellis</b> holds installment plans (tax bills, big purchases paid in steps) that end on their own.
          Together they draw <b className="mg-num">{fmt(cm.subsMonthly + cm.instMonthly)}</b>/month ({fmt(cm.subsMonthly)} vines ≈ <span className="mg-num">{fmt(cm.subsMonthly * 12)}</span>/yr, {fmt(cm.instMonthly)} trellis).
          "Log payment" adds the expense to your journal on the spot.
        </p>

        {cm.dueSoon.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {cm.dueSoon.map(({ c, due, days }) => (
              <span key={c.id} style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: `1.5px solid ${days <= 3 ? C.tomato : C.border}`, color: days <= 3 ? C.tomato : C.inkSoft, background: days <= 3 ? "#FBEAE5" : C.mist }}>
                {c.kind === "inst" ? "🪜" : "🌿"} {c.name} · {fmt(c.amount)} {days === 0 ? "today" : `in ${days}d`} ({shortDate(due)})
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gap: 8, marginBottom: 4 }}>
          {subs.length === 0 && insts.length === 0 && (
            <div style={{ fontSize: 13.5, color: C.inkSoft, padding: "4px 0 8px" }}>Nothing recurring tracked yet — add your first vine or installment below.</div>
          )}
          {subs.map((c) => <CommitmentRow key={c.id} c={c} />)}
          {insts.map((c) => <CommitmentRow key={c.id} c={c} />)}
        </div>

        {/* add form */}
        <div style={{ borderTop: `1.5px dashed ${C.border}`, paddingTop: 12, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {([{ id: "sub", label: "🌿 Subscription" }, { id: "inst", label: "🪜 Installment" }] as const).map((k) => (
              <button key={k.id} className="mg-btn" onClick={() => setCKind(k.id)}
                style={{ background: cKind === k.id ? C.leaf : "transparent", color: cKind === k.id ? "#fff" : C.inkSoft, border: `1.5px solid ${cKind === k.id ? C.leaf : C.border}`, borderRadius: 999, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {k.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 150px", minWidth: 0 }}>
              <Field label="Name">
                <input value={cName} placeholder={cKind === "inst" ? "Tax bill" : "Streaming"} maxLength={40} onChange={(e) => setCName(e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: "0 1 104px", minWidth: 84 }}>
              <Field label={cKind === "inst" ? "Per payment" : "Amount"}>
                <input className="mg-num" type="number" min="0.01" step="0.01" value={cAmount} placeholder="15.99" onChange={(e) => setCAmount(e.target.value)} style={inputStyle} />
              </Field>
            </div>
            {cKind === "sub" && (
              <div style={{ flex: "0 1 110px" }}>
                <Field label="Cadence">
                  <select value={cCadence} onChange={(e) => setCCadence(e.target.value as "monthly" | "annual")} style={inputStyle}>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Yearly</option>
                  </select>
                </Field>
              </div>
            )}
            {(cKind === "sub" && cCadence === "annual") && (
              <div style={{ flex: "0 1 100px" }}>
                <Field label="Month">
                  <select value={cMonth} onChange={(e) => setCMonth(e.target.value)} style={inputStyle}>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <div style={{ flex: "0 1 84px", minWidth: 70 }}>
              <Field label="Day">
                <input className="mg-num" type="number" min="1" max="31" value={cDay} onChange={(e) => setCDay(e.target.value)} style={inputStyle} />
              </Field>
            </div>
            {cKind === "inst" ? (
              <>
                <div style={{ flex: "0 1 100px", minWidth: 84 }}>
                  <Field label="# payments">
                    <input className="mg-num" type="number" min="1" value={cTotal} placeholder="6" onChange={(e) => setCTotal(e.target.value)} style={inputStyle} />
                  </Field>
                </div>
                <div style={{ flex: "0 1 100px", minWidth: 84 }}>
                  <Field label="Already paid">
                    <input className="mg-num" type="number" min="0" value={cPaid} placeholder="0" onChange={(e) => setCPaid(e.target.value)} style={inputStyle} />
                  </Field>
                </div>
              </>
            ) : (
              <div style={{ flex: "0 1 150px" }}>
                <Field label="End date (optional)">
                  <input type="date" value={cEnd} min={todayISO()} onChange={(e) => setCEnd(e.target.value)} style={inputStyle} />
                </Field>
              </div>
            )}
            <div style={{ flex: "0 1 140px" }}>
              <Field label="Category">
                <select value={cCategory} onChange={(e) => setCCategory(e.target.value)} style={inputStyle}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </Field>
            </div>
            <button className="mg-btn" onClick={submitCommitment} disabled={!canAdd}
              style={{ background: canAdd ? C.leaf : C.border, color: "#fff", border: "none", borderRadius: 12, padding: "10px 16px", fontWeight: 700, cursor: canAdd ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
              {cKind === "inst" ? "🪜 Stake it" : "🌿 Plant vine"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
