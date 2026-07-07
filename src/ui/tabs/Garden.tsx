/*
 * GARDEN — savings goals as growing plants, with inline watering.
 */
import { useState } from "react";
import type { Goal, State } from "../../engine/types";
import { PLANT_KINDS } from "../../engine/types";
import { fmt } from "../../engine/format";
import { C, inputStyle } from "../theme";
import { CardTitle, Empty, Field } from "../bits";
import { Plant } from "../art/Plant";

export function Garden({ state, addGoal, waterGoal, deleteGoal }: {
  state: State;
  addGoal: (g: Omit<Goal, "id">) => void;
  waterGoal: (id: string, amount: number) => void;
  deleteGoal: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [plant, setPlant] = useState("tulip");
  const [isEmergency, setIsEmergency] = useState(false);
  const [waterAmounts, setWaterAmounts] = useState<Record<string, string>>({});

  const submit = () => {
    const t = parseFloat(target);
    if (!name.trim() || !t || t <= 0) return;
    addGoal({ name: name.trim(), target: t, saved: 0, plant, isEmergency });
    setName(""); setTarget(""); setIsEmergency(false);
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
                <button className="mg-btn" onClick={() => deleteGoal(g.id)} title="Remove goal" aria-label={`Remove goal ${g.name}`}
                  style={{ position: "absolute", top: 10, right: 12, border: "none", background: "transparent", color: C.inkSoft, cursor: "pointer", fontSize: 14 }}>✕</button>
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
