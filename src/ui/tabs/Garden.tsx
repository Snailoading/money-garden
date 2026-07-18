/*
 * GARDEN — savings goals as growing plants, with inline watering, editing,
 * drawing (spending from a goal), and two-step deletion.
 */
import { useRef, useState } from "react";
import type { Goal, State } from "../../engine/types";
import { CATEGORIES, PLANT_KINDS } from "../../engine/types";
import { fmt } from "../../engine/format";
import { C, inputStyle } from "../theme";
import { CardTitle, Empty, Field } from "../bits";
import { Plant } from "../art/Plant";

export function Garden({ state, monthlyExpenses, expensesBasis, addGoal, waterGoal, deleteGoal, updateGoal, drawFromGoal, setupEmergencyFund }: {
  state: State;
  /** Typical monthly spending — the basis for emergency-fund coverage (from derive). */
  monthlyExpenses: number;
  /** Provenance of that estimate — "budget" means no real spending backs it yet. */
  expensesBasis: "history" | "projection" | "budget";
  addGoal: (g: Omit<Goal, "id" | "isEmergency">) => void;
  waterGoal: (id: string, amount: number) => void;
  deleteGoal: (id: string) => void;
  updateGoal: (id: string, patch: Partial<Omit<Goal, "id" | "saved" | "isEmergency">>) => void;
  drawFromGoal: (id: string, amount: number, category: string, note: string) => void;
  /** One-time barrel setup: target + money already set aside (no journal entry). */
  setupEmergencyFund: (target: number, openingBalance: number) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [plant, setPlant] = useState("tulip");
  // Opening balance for a new planting — money set aside before the goal
  // existed here. A starting fact, not a flow: no journal entry is created.
  const [alreadySaved, setAlreadySaved] = useState("");
  const [waterAmounts, setWaterAmounts] = useState<Record<string, string>>({});

  // Rain-barrel setup form. monthlyExpenses comes from derive()'s fallback
  // chain (trailing average → projection → total budget → bare 1), so > 1
  // means there's at least a budget-based estimate to suggest; the bare
  // sentinel 1 (every budget zeroed, nothing logged) means suggest nothing.
  const paceKnown = monthlyExpenses > 1;
  const [barrelTarget, setBarrelTarget] = useState(() => (paceKnown ? String(Math.round(monthlyExpenses * 3)) : ""));
  const [barrelOpening, setBarrelOpening] = useState("");

  // Inline goal editing — one panel (edit or draw) open at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eTarget, setETarget] = useState("");
  const [ePlant, setEPlant] = useState("tulip");

  // Draw-from-goal form.
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [dAmount, setDAmount] = useState("");
  const [dCategory, setDCategory] = useState("other");
  const [dNote, setDNote] = useState("");

  // Two-step delete, same idiom as the ledger.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armDelete = (id: string) => {
    setConfirmDeleteId(id);
    clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 4000);
  };

  const openEdit = (g: Goal) => {
    setDrawingId(null);
    setConfirmDeleteId(null);
    setEditingId(g.id);
    setEName(g.name);
    setETarget(String(g.target));
    setEPlant(g.plant);
  };
  // Requiring target > 0 also means an edit can never push the barrel back
  // into its target-0 setup state.
  const canSaveEdit = Boolean(eName.trim() && parseFloat(eTarget) > 0);
  const saveEdit = (g: Goal) => {
    if (!canSaveEdit) return;
    updateGoal(g.id, { name: eName.trim(), target: parseFloat(eTarget), plant: ePlant });
    setEditingId(null);
  };

  const openDraw = (g: Goal) => {
    setEditingId(null);
    setConfirmDeleteId(null);
    setDrawingId(g.id);
    setDAmount("");
    setDCategory("other");
    setDNote("");
  };
  const doDraw = (g: Goal) => {
    const a = parseFloat(dAmount);
    if (!(a > 0) || a > g.saved) return;
    drawFromGoal(g.id, a, dCategory, dNote);
    setDrawingId(null);
  };

  const submit = () => {
    const t = parseFloat(target);
    if (!name.trim() || !t || t <= 0) return;
    addGoal({ name: name.trim(), target: t, saved: Math.max(0, parseFloat(alreadySaved) || 0), plant });
    setName(""); setTarget(""); setAlreadySaved("");
  };

  const doSetupBarrel = () => {
    const t = parseFloat(barrelTarget);
    if (!(t > 0)) return;
    setupEmergencyFund(t, Math.max(0, parseFloat(barrelOpening) || 0));
  };

  // Render functions, not components: they close over the form state, and a
  // component identity would change per keystroke and drop input focus.
  const editPanel = (g: Goal) => (
    <section key={g.id} className="mg-card" style={{ padding: 18, display: "grid", gap: 10, background: C.mist }}
      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(g); if (e.key === "Escape") setEditingId(null); }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16 }}>Tend "{g.name}" ✏️</div>
      <Field label="Goal name">
        <input value={eName} maxLength={40} onChange={(e) => setEName(e.target.value)} style={inputStyle} autoFocus />
      </Field>
      <Field label="Target amount">
        <input className="mg-num" type="number" min="1" value={eTarget} onChange={(e) => setETarget(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Flower">
        <select value={ePlant} onChange={(e) => setEPlant(e.target.value)} style={inputStyle}>
          {PLANT_KINDS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>
      <div style={{ fontSize: 12, color: C.inkSoft }}>
        Balance ({fmt(g.saved)}) isn't edited here — water the goal or tend its journal entries, so every dollar stays traceable.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="mg-btn" onClick={() => saveEdit(g)} disabled={!canSaveEdit}
          style={{ background: canSaveEdit ? C.leaf : C.border, color: C.inkContrast, border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: canSaveEdit ? "pointer" : "not-allowed" }}>
          Save
        </button>
        <button className="mg-btn" onClick={() => setEditingId(null)}
          style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </section>
  );

  const drawPanel = (g: Goal) => {
    const a = parseFloat(dAmount);
    const canDraw = a > 0 && a <= g.saved;
    const over = a > g.saved;
    return (
      <section key={g.id} className="mg-card" style={{ padding: 18, display: "grid", gap: 10, background: C.mist }}
        onKeyDown={(e) => { if (e.key === "Enter") doDraw(g); if (e.key === "Escape") setDrawingId(null); }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16 }}>Draw from "{g.name}" 🪣</div>
        <div style={{ fontSize: 12.5, color: C.inkSoft }}>
          Logged in your journal and drained from the goal — draws spend the goal's pool, not this month's budget, so it shows up beside your spending as 🌸 rather than inside it. The barrel holds <b className="mg-num" style={{ color: C.ink }}>{fmt(g.saved)}</b>.
        </div>
        <Field label={`Amount (up to ${fmt(g.saved)})`}>
          <input className="mg-num" type="number" min="1" placeholder="500" value={dAmount}
            onChange={(e) => setDAmount(e.target.value)} style={inputStyle} autoFocus />
        </Field>
        {over && (
          <div style={{ fontSize: 12.5, color: C.tomato, fontWeight: 600 }}>
            The barrel holds only {fmt(g.saved)} — log the remainder as a regular expense.
          </div>
        )}
        <Field label="Category">
          <select value={dCategory} onChange={(e) => setDCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input value={dNote} placeholder={`From "${g.name}"`} maxLength={60} onChange={(e) => setDNote(e.target.value)} style={inputStyle} />
        </Field>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="mg-btn" onClick={() => doDraw(g)} disabled={!canDraw}
            style={{ background: canDraw ? C.leafDark : C.border, color: C.inkContrast, border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: canDraw ? "pointer" : "not-allowed" }}>
            🪣 Draw
          </button>
          <button className="mg-btn" onClick={() => setDrawingId(null)}
            style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </section>
    );
  };

  // The rain-barrel setup card — the barrel's permanent slot doubles as its
  // one-time setup form while target is 0 (the "not set up yet" sentinel).
  const setupCard = (g: Goal) => (
    <section key={g.id} className="mg-card" style={{ padding: 18, display: "grid", gap: 10, background: C.mist }}
      onKeyDown={(e) => { if (e.key === "Enter") doSetupBarrel(); }}>
      <div style={{ display: "grid", gap: 2 }}>
        {/* Plain-words heading first, so the metaphor never obscures what this is. */}
        <CardTitle style={{ margin: 0 }}>Emergency fund</CardTitle>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16 }}>Set up your rain barrel 🛟</div>
      </div>
      <div style={{ fontSize: 12.5, color: C.inkSoft }}>
        {paceKnown
          ? <>Many planners suggest keeping 3–6 months of expenses within easy reach — based on your {expensesBasis === "budget" ? "budgets" : "pace"}, that's roughly <b className="mg-num" style={{ color: C.ink }}>{fmt(monthlyExpenses * 3)}–{fmt(monthlyExpenses * 6)}</b>.</>
          : <>Many planners suggest keeping 3–6 months of what a typical month costs you within easy reach.</>}
        {" "}A rule of thumb, not personalized financial advice — set what feels safe.
      </div>
      <Field label="Target amount">
        <input className="mg-num" type="number" min="1" value={barrelTarget} placeholder="6000"
          onChange={(e) => setBarrelTarget(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Already set aside (optional)">
        <input className="mg-num" type="number" min="0" value={barrelOpening} placeholder="0"
          onChange={(e) => setBarrelOpening(e.target.value)} style={inputStyle} />
      </Field>
      <div style={{ fontSize: 12, color: C.inkSoft }}>
        Money already in your cushion goes straight into the barrel — it never touches this month's budget or journal.
      </div>
      <button className="mg-btn" onClick={doSetupBarrel} disabled={!(parseFloat(barrelTarget) > 0)}
        style={{ background: parseFloat(barrelTarget) > 0 ? C.leaf : C.border, color: C.inkContrast, border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: parseFloat(barrelTarget) > 0 ? "pointer" : "not-allowed", justifySelf: "start" }}>
        🛟 Set up the barrel
      </button>
    </section>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>Plant a goal</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <Field label="Goal name">
            <input value={name} placeholder="Japan trip" maxLength={40} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Target amount">
            <input className="mg-num" type="number" min="1" value={target} placeholder="2800" onChange={(e) => setTarget(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Flower">
            <select value={plant} onChange={(e) => setPlant(e.target.value)} style={inputStyle}>
              {PLANT_KINDS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Already saved (optional)">
            <input className="mg-num" type="number" min="0" value={alreadySaved} placeholder="0"
              onChange={(e) => setAlreadySaved(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: C.inkSoft }}>
          "Already saved" is money you set aside before planting — it fills the goal without touching this month's budget or journal.
        </div>
        <button className="mg-btn" onClick={submit} disabled={!name.trim() || !target}
          style={{ marginTop: 12, background: name.trim() && target ? C.leaf : C.border, color: C.inkContrast, border: "none", borderRadius: 12, padding: "11px 22px", fontWeight: 700, cursor: name.trim() && target ? "pointer" : "not-allowed" }}>
          🌱 Plant it
        </button>
      </section>

      {/* The barrel always exists (engine invariant), so the grid always renders. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
          {state.goals.map((g) => {
            // The un-set-up barrel shows its setup form instead of a plant —
            // it has no edit/draw buttons, so those panels can't open on it.
            if (g.isEmergency && g.target === 0) return setupCard(g);
            if (g.id === editingId) return editPanel(g);
            if (g.id === drawingId) return drawPanel(g);
            const progress = Math.min(1, g.saved / g.target);
            const bloom = PLANT_KINDS.find((p) => p.id === g.plant)?.bloom || C.marigold;
            const stageWord = g.saved > g.target ? "Overflowing 🌊" : progress >= 1 ? "In full bloom 🌸" : progress >= 0.7 ? "Budding" : progress >= 0.4 ? "Growing tall" : progress >= 0.12 ? "Sprouting" : "Just planted";
            const water = () => {
              const a = parseFloat(waterAmounts[g.id]);
              if (a > 0) {
                waterGoal(g.id, a);
                setWaterAmounts({ ...waterAmounts, [g.id]: "" });
              }
            };
            return (
              <section key={g.id} className="mg-card" style={{ padding: 18, display: "grid", justifyItems: "center", textAlign: "center", gap: 6, position: "relative" }}>
                <div style={{ position: "absolute", top: 10, right: 12, display: "flex", gap: 2, alignItems: "center" }}>
                  <button className="mg-btn" onClick={() => openEdit(g)} title="Edit goal" aria-label={`Edit goal ${g.name}`}
                    style={{ border: "none", background: "transparent", color: C.inkSoft, cursor: "pointer", fontSize: 13, padding: 4 }}>✏️</button>
                  {/* The barrel is permanent — no delete affordance at all. */}
                  {!g.isEmergency && (confirmDeleteId === g.id ? (
                    <button className="mg-btn" onClick={() => { deleteGoal(g.id); setConfirmDeleteId(null); }}
                      title="Really delete this goal" aria-label={`Really delete goal ${g.name}`}
                      style={{ background: C.tomato, border: "none", borderRadius: 999, padding: "3px 9px", fontWeight: 700, fontSize: 11, color: C.inkContrast, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Delete?
                    </button>
                  ) : (
                    <button className="mg-btn" onClick={() => armDelete(g.id)} title="Remove goal" aria-label={`Remove goal ${g.name}`}
                      style={{ border: "none", background: "transparent", color: C.inkSoft, cursor: "pointer", fontSize: 14, padding: 4 }}>✕</button>
                  ))}
                </div>
                <Plant progress={progress} bloom={bloom} size={120} celebrate={progress >= 1} />
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18 }}>{g.name}{g.isEmergency ? " 🛟" : ""}</div>
                <div style={{ fontSize: 12.5, color: C.inkSoft }}>{stageWord}</div>
                <div className="mg-num" style={{ fontWeight: 700, fontSize: 15 }}>
                  {fmt(g.saved)} <span style={{ color: C.inkSoft, fontWeight: 400 }}>of {fmt(g.target)}</span>
                </div>
                {g.isEmergency && (() => {
                  // Coverage in months of typical spending — the standard the
                  // 🛟 fund is actually measured against. Moves with your
                  // spending average, not only when you water (hence "≈").
                  const months = monthlyExpenses > 0 ? g.saved / monthlyExpenses : 0;
                  const zone = months < 3 ? C.tomato : months <= 6 ? C.leafDark : C.inkSoft;
                  return (
                    <div className="mg-num" style={{ fontSize: 12.5, color: zone, fontWeight: 600 }}>
                      ≈ {months.toFixed(1)} months of expenses <span style={{ color: C.inkSoft, fontWeight: 400 }}>· aim for 3–6</span>
                    </div>
                  );
                })()}
                <div style={{ width: "100%", height: 10, background: C.mist, border: `1.5px solid ${C.border}`, borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${progress * 100}%`, height: "100%", background: bloom, transition: "width .5s ease" }} />
                </div>
                {progress < 1 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6, width: "100%" }}>
                    <input className="mg-num" type="number" min="1" placeholder="50"
                      value={waterAmounts[g.id] || ""}
                      onChange={(e) => setWaterAmounts({ ...waterAmounts, [g.id]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") water(); }}
                      style={{ ...inputStyle, flex: 1, padding: "7px 9px" }} aria-label={`Amount to add to ${g.name}`} />
                    <button className="mg-btn" onClick={water}
                      style={{ background: C.leafDark, color: C.inkContrast, border: "none", borderRadius: 10, padding: "7px 14px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      💧 Water
                    </button>
                  </div>
                )}
                {g.saved > 0 && (
                  <button className="mg-btn" onClick={() => openDraw(g)}
                    style={{ marginTop: 2, background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 999, padding: "5px 12px", fontWeight: 700, fontSize: 12, color: C.inkSoft, cursor: "pointer" }}>
                    🪣 Draw from this goal
                  </button>
                )}
              </section>
            );
          })}
      </div>
      {state.goals.length === 1 && (
        <section className="mg-card"><Empty text="The rest of the bed is empty — plant your first goal above. A trip, a cushion, a someday-thing: every flower starts as a seed." /></section>
      )}
    </div>
  );
}
