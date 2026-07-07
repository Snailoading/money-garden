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

export function Garden({ state, addGoal, waterGoal, deleteGoal, updateGoal, drawFromGoal }: {
  state: State;
  addGoal: (g: Omit<Goal, "id">) => void;
  waterGoal: (id: string, amount: number) => void;
  deleteGoal: (id: string) => void;
  updateGoal: (id: string, patch: Partial<Omit<Goal, "id" | "saved">>) => void;
  drawFromGoal: (id: string, amount: number, category: string, note: string) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [plant, setPlant] = useState("tulip");
  const [isEmergency, setIsEmergency] = useState(false);
  const [waterAmounts, setWaterAmounts] = useState<Record<string, string>>({});

  const currentLifebuoy = state.goals.find((g) => g.isEmergency);

  // Inline goal editing — one panel (edit or draw) open at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eTarget, setETarget] = useState("");
  const [ePlant, setEPlant] = useState("tulip");
  const [eEmergency, setEEmergency] = useState(false);

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
    setEEmergency(g.isEmergency);
  };
  const canSaveEdit = Boolean(eName.trim() && parseFloat(eTarget) > 0);
  const saveEdit = (g: Goal) => {
    if (!canSaveEdit) return;
    updateGoal(g.id, { name: eName.trim(), target: parseFloat(eTarget), plant: ePlant, isEmergency: eEmergency });
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
    addGoal({ name: name.trim(), target: t, saved: 0, plant, isEmergency });
    setName(""); setTarget(""); setIsEmergency(false);
  };

  // The lifebuoy notice: shown wherever ticking the box would move the flag.
  const lifebuoyNotice = (excludeId?: string) =>
    currentLifebuoy && currentLifebuoy.id !== excludeId ? (
      <div style={{ fontSize: 12.5, color: C.amber, fontWeight: 600 }}>
        🛟 This moves the lifebuoy — "{currentLifebuoy.name}" will no longer be your emergency fund.
      </div>
    ) : null;

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
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
        <input type="checkbox" checked={eEmergency} onChange={(e) => setEEmergency(e.target.checked)} />
        This is my emergency fund
      </label>
      {eEmergency && !g.isEmergency && lifebuoyNotice(g.id)}
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
          Logged as an expense (it counts in your budgets and monthly spend) and drained from the goal. The barrel holds <b className="mg-num" style={{ color: C.ink }}>{fmt(g.saved)}</b>.
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
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13.5, color: C.inkSoft, cursor: "pointer" }}>
          <input type="checkbox" checked={isEmergency} onChange={(e) => {
            const checked = e.target.checked;
            setIsEmergency(checked);
            // Prefill the name for an empty form; undo only our own prefill on
            // uncheck so a user-typed name is never touched.
            if (checked && !name.trim()) setName("Emergency fund");
            else if (!checked && name === "Emergency fund") setName("");
          }} />
          This is my emergency fund (the advisor tracks it against 3–6 months of expenses)
        </label>
        {isEmergency && <div style={{ marginTop: 6 }}>{lifebuoyNotice()}</div>}
        <button className="mg-btn" onClick={submit} disabled={!name.trim() || !target}
          style={{ marginTop: 12, background: name.trim() && target ? C.leaf : C.border, color: C.inkContrast, border: "none", borderRadius: 12, padding: "11px 22px", fontWeight: 700, cursor: name.trim() && target ? "pointer" : "not-allowed" }}>
          🌱 Plant it
        </button>
      </section>

      {state.goals.length === 0 ? (
        <section className="mg-card"><Empty text="The garden bed is empty. Plant your first goal above — an emergency fund is a great first seed." /></section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
          {state.goals.map((g) => {
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
                  {confirmDeleteId === g.id ? (
                    <button className="mg-btn" onClick={() => { deleteGoal(g.id); setConfirmDeleteId(null); }}
                      title="Really delete this goal" aria-label={`Really delete goal ${g.name}`}
                      style={{ background: C.tomato, border: "none", borderRadius: 999, padding: "3px 9px", fontWeight: 700, fontSize: 11, color: C.inkContrast, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Delete?
                    </button>
                  ) : (
                    <button className="mg-btn" onClick={() => armDelete(g.id)} title="Remove goal" aria-label={`Remove goal ${g.name}`}
                      style={{ border: "none", background: "transparent", color: C.inkSoft, cursor: "pointer", fontSize: 14, padding: 4 }}>✕</button>
                  )}
                </div>
                <Plant progress={progress} bloom={bloom} size={120} celebrate={progress >= 1} />
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18 }}>{g.name}{g.isEmergency ? " 🛟" : ""}</div>
                <div style={{ fontSize: 12.5, color: C.inkSoft }}>{stageWord}</div>
                <div className="mg-num" style={{ fontWeight: 700, fontSize: 15 }}>
                  {fmt(g.saved)} <span style={{ color: C.inkSoft, fontWeight: 400 }}>of {fmt(g.target)}</span>
                </div>
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
      )}
    </div>
  );
}
