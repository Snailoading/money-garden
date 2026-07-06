/*
 * ORCHARD — investments & the long game: the freedom tree, the projection
 * chart, growing conditions, holdings, and one-off watering.
 */
import { useState } from "react";
import type { Holding, Invest, State } from "../../engine/types";
import { DEFAULT_INVEST } from "../../engine/types";
import type { Derived } from "../../engine/stats";
import { fmt } from "../../engine/format";
import { C, inputStyle } from "../theme";
import { CardTitle, Field } from "../bits";
import { OrchardTree } from "../art/OrchardTree";
import { SvgProjection } from "../charts/SvgProjection";

/*
 * The reference stores "" in invest fields while a number input is cleared
 * (the engine's Number(x) || default coercion absorbs it). The cast keeps
 * that exact behavior without loosening the Invest type everywhere.
 */
const numField = (v: string): number => (v === "" ? ("" as unknown as number) : Number(v));

export function Orchard({ state, d, setInvest, addHolding, updateHolding, deleteHolding, waterOrchard }: {
  state: State;
  d: Derived;
  setInvest: (patch: Partial<Invest>) => void;
  addHolding: (h: Omit<Holding, "id">) => void;
  updateHolding: (id: string, value: string) => void;
  deleteHolding: (id: string) => void;
  waterOrchard: (id: string, amount: number) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [waterAmt, setWaterAmt] = useState("");
  const [waterTarget, setWaterTarget] = useState("");
  const inv = state.invest || DEFAULT_INVEST;
  const f = d.fire;

  const targetId = waterTarget || (inv.holdings[0] && inv.holdings[0].id) || "";
  const doWater = () => {
    const a = parseFloat(waterAmt);
    if (!a || a <= 0 || !targetId) return;
    waterOrchard(targetId, a);
    setWaterAmt("");
  };

  const earlyAge = f.yearsToFI !== null ? f.age + (f.yearsToFIEarly ?? f.yearsToFI) : null;
  const lateAge = f.yearsToFILate !== null ? f.age + f.yearsToFILate : null;

  const submit = () => {
    const v = parseFloat(value);
    if (!name.trim() || !v || v <= 0) return;
    addHolding({ name: name.trim(), value: v });
    setName(""); setValue("");
  };

  const treeWord =
    f.progress >= 1 ? "In full fruit — work is optional 🍎" :
    f.coastReached ? "Self-sustaining — it ripens on its own 🍒" :
    f.progress >= 0.5 ? "Halfway grown and climbing" :
    f.progress >= 0.15 ? "Taking root nicely" :
    f.portfolio > 0 ? "A young sapling" : "Bare soil — nothing planted yet";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ---- the freedom tree ---- */}
      <section className="mg-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <OrchardTree progress={f.progress} coast={f.coastReached} fired={f.progress >= 1} size={140} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <CardTitle>The freedom tree</CardTitle>
            {f.fireNumber > 0 ? (
              <>
                <div className="mg-num" style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "clamp(28px, 4vw, 38px)", lineHeight: 1.1 }}>
                  {fmt(f.fireNumber)}
                </div>
                <p style={{ margin: "4px 0 10px", fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
                  Your financial-independence number: {f.spendBasis === "custom" ? "your planned retirement spending" : "your typical monthly spending"} of about <b className="mg-num" style={{ color: C.ink }}>{fmt(f.fiMonthlySpend)}</b>/month, annualized and multiplied by {Math.round(100 / f.wr)} (the {f.wr}% withdrawal rule of thumb). A portfolio this size could sustain that lifestyle indefinitely.
                  {f.spendBasis === "auto" && <> Retirement spending often differs from today's — you can set your own figure under Growing conditions.</>}
                </p>
                <div style={{ width: "100%", height: 10, background: C.mist, border: `1.5px solid ${C.border}`, borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${f.progress * 100}%`, height: "100%", background: f.progress >= 1 ? C.marigold : C.leaf, transition: "width .5s ease" }} />
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: C.inkSoft }}>
                  <span className="mg-num"><b style={{ color: C.ink }}>{fmt(f.portfolio)}</b> planted · {Math.round(f.progress * 100)}% grown</span>
                  {f.yearsToFI !== null && (
                    <span>
                      {f.yearsToFI === 0 ? "Ripe now" : (
                        <>Harvest ≈ age <b style={{ color: C.ink }}>{f.age + f.yearsToFI}</b>
                        {earlyAge !== null && (
                          // When slow markets never reach the number within the
                          // 60-year simulation, the window's upper end is open:
                          // "68+" — not the reference's nonsensical "68–68+".
                          <> · window <b style={{ color: C.ink }}>{lateAge !== null ? `${earlyAge}–${lateAge}` : `${earlyAge}+`}</b> in {f.retLo}–{f.retHi}% markets</>
                        )}</>
                      )}
                    </span>
                  )}
                  <span>{f.coastReached ? "🍒 Coast FIRE reached" : f.coastNumber > 0 ? <>Coast FIRE needs <b style={{ color: C.ink }} className="mg-num">{fmt(f.coastNumber)}</b> today</> : null}</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 6, fontStyle: "italic" }}>{treeWord}</div>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: C.inkSoft }}>
                Log some expenses (or plant sample data) so the orchard can size your freedom number — it's your yearly spending × {Math.round(100 / f.wr)}.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- the long view ---- */}
      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>The long view</CardTitle>
        <p style={{ margin: "0 0 8px", fontSize: 13.5, color: C.inkSoft }}>
          Your portfolio compounding at {f.ret}%/year with {fmt(f.monthly)}/month added (your regular DCA). The shaded band is the same plan in slower or kinder markets ({f.retLo}%–{f.retHi}%/year) — so the freedom date reads as a window, not a promise. The dotted line is the freedom number.
        </p>
        <div style={{ height: 230 }}>
          <SvgProjection curve={f.curve} fireNumber={f.fireNumber} retLo={f.retLo} retHi={f.retHi} />
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* ---- growing conditions ---- */}
        <section className="mg-card" style={{ padding: 20 }}>
          <CardTitle>Growing conditions</CardTitle>
          <div style={{ display: "grid", gap: 10 }}>
            <Field label="Your age">
              <input className="mg-num" type="number" min="14" max="100" value={inv.age} onChange={(e) => setInvest({ age: numField(e.target.value) })} style={inputStyle} />
            </Field>
            <Field label="Traditional retirement age (anchors Coast FIRE)">
              <input className="mg-num" type="number" min="40" max="100" value={inv.retireAge} onChange={(e) => setInvest({ retireAge: numField(e.target.value) })} style={inputStyle} />
            </Field>
            <Field label="Planned retirement spending per month (0 = use your current spending pace)">
              <input className="mg-num" type="number" min="0" step="50" value={inv.retireSpend ?? 0} onChange={(e) => setInvest({ retireSpend: numField(e.target.value) })} style={inputStyle} />
              <span style={{ fontSize: 11.5, fontWeight: 500, color: C.inkSoft, lineHeight: 1.45 }}>
                Use today's dollars — inflation is already handled if your expected return is a real (after-inflation) figure like 7%. Inflating this number yourself would double-count it.
              </span>
            </Field>
            <Field label="Monthly investing — the watering can">
              <input className="mg-num" type="number" min="0" value={inv.monthly} onChange={(e) => setInvest({ monthly: numField(e.target.value) })} style={inputStyle} />
            </Field>
            <Field label="Expected annual return % (7% ≈ long-run stock average after inflation)">
              <input className="mg-num" type="number" min="0" max="15" step="0.5" value={inv.ret} onChange={(e) => setInvest({ ret: numField(e.target.value) })} style={inputStyle} />
            </Field>
            <Field label="Withdrawal rate % (4% is the classic rule; 3–3.5% is more cautious)">
              <input className="mg-num" type="number" min="2" max="10" step="0.5" value={inv.wr} onChange={(e) => setInvest({ wr: numField(e.target.value) })} style={inputStyle} />
            </Field>
          </div>
        </section>

        {/* ---- trees in the orchard ---- */}
        <section className="mg-card" style={{ padding: 20 }}>
          <CardTitle>Trees in the orchard <span className="mg-num" style={{ fontWeight: 400, color: C.inkSoft, fontSize: 15 }}>· {fmt(f.portfolio)}</span></CardTitle>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {(inv.holdings || []).length === 0 && (
              <div style={{ fontSize: 13.5, color: C.inkSoft, padding: "6px 0" }}>
                Nothing planted yet. Anything that compounds counts — index funds, retirement accounts, high-yield savings.
              </div>
            )}
            {(inv.holdings || []).map((h) => (
              <div key={h.id} className="mg-row" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, border: `1.5px solid ${C.border}` }}>
                <span style={{ fontSize: 18 }}>🌳</span>
                <span style={{ flex: "1 1 120px", fontWeight: 600, fontSize: 14, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</span>
                <input className="mg-num" type="number" min="0" value={h.value} aria-label={`Value of ${h.name}`}
                  onChange={(e) => updateHolding(h.id, e.target.value)} style={{ ...inputStyle, flex: "0 1 110px", width: 110, minWidth: 84, padding: "6px 8px" }} />
                <button className="mg-btn" onClick={() => deleteHolding(h.id)} title="Remove holding" aria-label={`Remove ${h.name}`}
                  style={{ border: "none", background: "transparent", color: C.inkSoft, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
          {(inv.holdings || []).length > 0 && (
            <div style={{ borderTop: `1.5px dashed ${C.border}`, paddingTop: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, marginBottom: 6 }}>ONE-OFF WATERING · bonus, windfall, extra cash</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <select value={targetId} onChange={(e) => setWaterTarget(e.target.value)} style={{ ...inputStyle, flex: "1 1 150px", width: "auto", minWidth: 0 }} aria-label="Holding to add to">
                  {inv.holdings.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <input className="mg-num" type="number" min="1" placeholder="500" value={waterAmt}
                  onChange={(e) => setWaterAmt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doWater()}
                  style={{ ...inputStyle, flex: "0 1 110px", width: 110, minWidth: 84 }} aria-label="One-off amount to invest" />
                <button className="mg-btn" onClick={doWater} disabled={!waterAmt}
                  style={{ background: waterAmt ? C.leafDark : C.border, color: "#fff", border: "none", borderRadius: 12, padding: "10px 16px", fontWeight: 700, cursor: waterAmt ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                  💧 Water
                </button>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>
                Logged as a saving in your journal, so it counts toward this month's savings rate and your streak. Your regular monthly DCA lives under Growing conditions.
              </p>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 150px", minWidth: 0 }}>
              <Field label="Holding name">
                <input value={name} placeholder="Index fund" maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: "0 1 110px", minWidth: 84 }}>
              <Field label="Value">
                <input className="mg-num" type="number" min="1" value={value} placeholder="5000" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
              </Field>
            </div>
            <button className="mg-btn" onClick={submit} disabled={!name.trim() || !value}
              style={{ background: name.trim() && value ? C.leaf : C.border, color: "#fff", border: "none", borderRadius: 12, padding: "10px 16px", fontWeight: 700, cursor: name.trim() && value ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
              🌳 Plant
            </button>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>
            <b>Coast FIRE</b> is the point where today's portfolio alone would compound to your freedom number by age {f.retireAge}, with no further contributions. Past it, every extra dollar buys an <i>earlier</i> harvest rather than an eventual one.
          </p>
        </section>
      </div>
    </div>
  );
}
