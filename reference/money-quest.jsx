import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, ReferenceLine, CartesianGrid } from "recharts";

/* ============================================================
   MONEY QUEST — a financial tracker that plays like a board game
   Theme: casino-felt table, chunky game chips, a coin mascot
   who reacts to your financial health, and a coach with
   data-driven advice. Data persists via window.storage.
   ============================================================ */

const FELT_DARK = "#0C4A33";
const FELT = "#116B49";
const INK = "#12332A";
const CARD = "#FFFDF4";
const GOLD = "#FFC93C";
const GOLD_DARK = "#E0A800";
const CORAL = "#FF6B6B";
const SKY = "#4CC9F0";
const GRAPE = "#9B5DE5";
const LIME = "#7BC950";

const CATEGORIES = [
  { id: "housing", label: "Housing", emoji: "🏠", color: "#9B5DE5" },
  { id: "food", label: "Food & Groceries", emoji: "🍜", color: "#FF6B6B" },
  { id: "transport", label: "Transport", emoji: "🚗", color: "#4CC9F0" },
  { id: "fun", label: "Fun & Leisure", emoji: "🎮", color: "#FFC93C" },
  { id: "shopping", label: "Shopping", emoji: "🛍️", color: "#F15BB5" },
  { id: "health", label: "Health", emoji: "💊", color: "#7BC950" },
  { id: "subs", label: "Subscriptions", emoji: "📺", color: "#FF9F1C" },
  { id: "other", label: "Other", emoji: "🎲", color: "#8D99AE" },
];
const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[7];

const STORAGE_KEY = "moneyquest:v1";

const DEFAULT_INVEST = { holdings: [], monthly: 0, ret: 7, age: 30, retireAge: 65, wr: 4 };

const fmtK = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k";
  return "$" + Math.round(n);
};

const fmt = (n) =>
  "$" +
  Math.abs(Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const monthKey = (dateStr) => (dateStr || "").slice(0, 7);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

/* ---------------- Mascot: Penny the Coin ---------------- */
function Mascot({ score, size = 120 }) {
  const mood =
    score >= 80 ? "ecstatic" : score >= 60 ? "happy" : score >= 40 ? "meh" : score >= 20 ? "worried" : "panic";
  const mouths = {
    ecstatic: <path d="M38 68 Q60 92 82 68 Q60 78 38 68Z" fill={INK} />,
    happy: <path d="M42 70 Q60 84 78 70" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />,
    meh: <path d="M44 74 L76 74" stroke={INK} strokeWidth="5" strokeLinecap="round" />,
    worried: <path d="M44 78 Q60 68 76 78" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />,
    panic: <ellipse cx="60" cy="78" rx="10" ry="13" fill={INK} />,
  };
  const brows = {
    ecstatic: null,
    happy: null,
    meh: (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d="M36 38 L52 40" />
        <path d="M84 38 L68 40" />
      </g>
    ),
    worried: (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d="M36 36 L52 42" />
        <path d="M84 36 L68 42" />
      </g>
    ),
    panic: (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d="M34 34 L52 42" />
        <path d="M86 34 L68 42" />
      </g>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: "block" }} aria-label={`Penny the coin looks ${mood}`}>
      <circle cx="60" cy="60" r="56" fill={GOLD_DARK} />
      <circle cx="58" cy="58" r="54" fill={GOLD} />
      <circle cx="58" cy="58" r="44" fill="none" stroke={GOLD_DARK} strokeWidth="3" strokeDasharray="6 6" />
      {/* shine */}
      <path d="M28 34 Q40 20 56 18" stroke="#FFF3C4" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* eyes */}
      {mood === "ecstatic" ? (
        <g stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round">
          <path d="M38 50 Q45 42 52 50" />
          <path d="M68 50 Q75 42 82 50" />
        </g>
      ) : (
        <g fill={INK}>
          <circle cx="45" cy="52" r={mood === "panic" ? 8 : 6} />
          <circle cx="75" cy="52" r={mood === "panic" ? 8 : 6} />
          <circle cx="47" cy="50" r="2" fill="#fff" />
          <circle cx="77" cy="50" r="2" fill="#fff" />
        </g>
      )}
      {brows[mood]}
      {mouths[mood]}
      {mood === "ecstatic" && (
        <g fill="#FF8FA3" opacity="0.9">
          <ellipse cx="34" cy="64" rx="7" ry="4" />
          <ellipse cx="86" cy="64" rx="7" ry="4" />
        </g>
      )}
      {mood === "panic" && (
        <g fill={SKY}>
          <path d="M92 40 q6 10 0 14 q-6 -4 0 -14Z" />
        </g>
      )}
    </svg>
  );
}

/* ---------------- Game-style HP bar ---------------- */
function HpBar({ used, max, label }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const left = Math.max(0, max - used);
  const color = pct < 70 ? LIME : pct < 100 ? GOLD : CORAL;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: INK, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          {pct >= 100 ? "💥 over by " + fmt(used - max) : fmt(left) + " HP left"}
        </span>
      </div>
      <div style={{ height: 18, borderRadius: 9, background: "#E7E2D2", border: `2.5px solid ${INK}`, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            width: pct + "%",
            height: "100%",
            background: `repeating-linear-gradient(45deg, ${color}, ${color} 10px, ${color}dd 10px, ${color}dd 20px)`,
            transition: "width 500ms cubic-bezier(.34,1.56,.64,1)",
          }}
        />
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: INK }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

/* ---------------- Shared chunky card ---------------- */
const cardStyle = {
  background: CARD,
  border: `3px solid ${INK}`,
  borderRadius: 18,
  boxShadow: `5px 5px 0 ${INK}`,
  padding: 18,
};
const btnStyle = (bg = GOLD) => ({
  background: bg,
  border: `3px solid ${INK}`,
  borderRadius: 12,
  boxShadow: `3px 3px 0 ${INK}`,
  padding: "8px 16px",
  fontWeight: 900,
  color: INK,
  cursor: "pointer",
  fontFamily: "'Nunito', sans-serif",
  fontSize: 14,
});
const inputStyle = {
  border: `2.5px solid ${INK}`,
  borderRadius: 10,
  padding: "8px 10px",
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700,
  fontSize: 14,
  background: "#fff",
  color: INK,
  width: "100%",
  boxSizing: "border-box",
};

/* ---------------- Advice engine ---------------- */
function buildAdvice({ income, expenses, savingsRate, byCat, budgets, goals, txCount, avgMonthlySavings, fire }) {
  const tips = [];
  const push = (emoji, title, text) => tips.push({ emoji, title, text });

  if (txCount === 0) {
    push("🎬", "Roll the dice", "Log your first transaction (or load the demo data) and I'll start crunching real numbers for you. A tracker only gets smart when it's fed.");
    return tips;
  }
  if (income === 0) {
    push("💼", "Log your income", "I see spending but no income this month. Add your paycheck so I can compute your savings rate — the single most useful number in personal finance.");
  }
  if (income > 0) {
    if (savingsRate >= 0.2) {
      push("🏆", "Elite saver status", `You're saving ${Math.round(savingsRate * 100)}% of income this month — above the classic 20% target. Consider routing the surplus into investments or an emergency fund so it compounds instead of napping.`);
    } else if (savingsRate >= 0.1) {
      push("📈", "Solid, now push to 20%", `Savings rate: ${Math.round(savingsRate * 100)}%. The 50/30/20 rule suggests 20% to savings. Trimming ~${fmt(income * (0.2 - savingsRate))} of spending this month would get you there.`);
    } else if (savingsRate >= 0) {
      push("🪫", "Savings rate is low", `You're keeping only ${Math.round(savingsRate * 100)}% of income. Try the "pay yourself first" trick: move a fixed amount to savings the day you're paid, before spending starts.`);
    } else {
      push("🚨", "Spending exceeds income", `You spent ${fmt(expenses - income)} more than you earned this month. Freeze non-essential categories and audit subscriptions first — they're the easiest wins.`);
    }
  }
  // 50/30/20 needs vs wants
  if (income > 0) {
    const needs = (byCat.housing || 0) + (byCat.food || 0) + (byCat.transport || 0) + (byCat.health || 0);
    const wants = (byCat.fun || 0) + (byCat.shopping || 0) + (byCat.subs || 0) + (byCat.other || 0);
    if (needs / income > 0.55) push("🏠", "Needs are heavy", `Essentials eat ${Math.round((needs / income) * 100)}% of income (guideline: ~50%). Big levers here are rent negotiation, meal planning, and transport swaps — small % changes on big categories beat clipping coupons.`);
    if (wants / income > 0.35) push("🎢", "Wants are winning", `Fun, shopping & subscriptions take ${Math.round((wants / income) * 100)}% of income (guideline: ~30%). Try a 24-hour rule: anything non-essential over $50 waits a day in the cart.`);
  }
  // Budget blowouts
  Object.entries(budgets).forEach(([cid, limit]) => {
    if (limit > 0 && (byCat[cid] || 0) > limit) {
      const c = catById(cid);
      push("💥", `${c.emoji} ${c.label} took critical damage`, `You're ${fmt((byCat[cid] || 0) - limit)} over its ${fmt(limit)} budget. Next month, either raise the budget to match reality or set a mid-month checkpoint alert for yourself.`);
    }
  });
  // Biggest category insight
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 0 && expenses > 0) {
    const c = catById(top[0]);
    push("🔍", `${c.emoji} ${c.label} is your boss battle`, `${Math.round((top[1] / expenses) * 100)}% of this month's spending. Optimizing your #1 category is worth more than perfecting all the small ones combined.`);
  }
  // Subscriptions
  if ((byCat.subs || 0) > 0 && income > 0 && byCat.subs / income > 0.05) {
    push("✂️", "Subscription audit time", `Subscriptions are ${fmt(byCat.subs)} this month. Rule of thumb: if you didn't use it in the last 30 days, cancel it — you can always re-subscribe when you miss it (you usually won't).`);
  }
  // Emergency fund via goals
  const ef = goals.find((g) => /emergency|rainy|fund/i.test(g.name));
  const monthlyBurn = expenses || 1;
  if (!ef) {
    push("🛟", "No emergency fund quest yet", `Gold-standard target: 3–6 months of expenses (${fmt(monthlyBurn * 3)}–${fmt(monthlyBurn * 6)} for you). Create a goal for it — it turns "someday" into a progress bar.`);
  } else if (ef.saved < monthlyBurn * 3) {
    push("🛟", "Level up the emergency fund", `You've banked ${fmt(ef.saved)}; a 3-month cushion is ${fmt(monthlyBurn * 3)}. At your current pace (~${fmt(Math.max(avgMonthlySavings, 0))}/mo saved) you'd get there in ${avgMonthlySavings > 0 ? Math.ceil((monthlyBurn * 3 - ef.saved) / avgMonthlySavings) + " months" : "… well, never at $0/mo — start small"}.`);
  }
  // Goal projections
  goals.forEach((g) => {
    if (g.saved < g.target && avgMonthlySavings > 0) {
      const months = Math.ceil((g.target - g.saved) / avgMonthlySavings);
      if (months <= 24) push("🎯", `"${g.name}" ETA`, `At your average savings pace, you hit this goal in about ${months} month${months === 1 ? "" : "s"}. Automate a monthly transfer of ${fmt((g.target - g.saved) / months)} and it happens on autopilot.`);
    }
  });
  // ---- Investing & FIRE ----
  if (fire) {
    if (fire.portfolio === 0 && avgMonthlySavings > 100) {
      push("🌱", "Put your savings to work", `You're saving ~${fmt(avgMonthlySavings)}/mo but nothing is invested. Cash quietly loses to inflation; broad low-cost index funds have historically averaged ~7%/yr real returns over long periods. Just $200/mo at 7% compounds to roughly $240k in 30 years. Time in the market beats timing the market.`);
    }
    if (fire.portfolio > 0 && fire.monthly === 0) {
      push("🔁", "Automate the machine", `Your portfolio (${fmt(fire.portfolio)}) has no monthly contribution set. Consistent automatic investing (dollar-cost averaging) removes emotion and is the #1 habit separating people who reach FI from people who plan to.`);
    }
    if (fire.fireNumber > 0 && fire.portfolio > 0) {
      const pctFI = Math.round((fire.portfolio / fire.fireNumber) * 100);
      if (pctFI >= 100) {
        push("🏝️", "You've hit your FIRE number!", `Portfolio ≥ ${fmt(fire.fireNumber)}. By the 4% rule, work is now optional. Consider a bond tent or 3.5% withdrawal rate for extra safety before pulling the trigger.`);
      } else if (fire.yearsToFI !== null && fire.yearsToFI <= 60) {
        push("🔥", "Freedom countdown", `You're ${pctFI}% of the way to financial independence. At ${fmt(fire.monthly)}/mo and ${fire.ret}% returns, you reach your FIRE number around age ${fire.age + fire.yearsToFI} (~${fire.yearsToFI} years). Raising your savings rate shortens this more than chasing higher returns does.`);
      }
    }
    if (fire.coastReached && fire.fireNumber > 0 && fire.portfolio < fire.fireNumber) {
      push("⛵", "Coast FIRE unlocked", `Your ${fmt(fire.portfolio)} already compounds to your FIRE number by age ${fire.retireAge} with zero new contributions. Anything you invest from here buys earlier freedom, not just eventual freedom.`);
    }
    if (income > 0 && savingsRate > 0 && fire.fireNumber > 0) {
      const sr = Math.round(savingsRate * 100);
      if (sr >= 30 && sr < 50) push("🧮", "The shockingly simple math", `At a ${sr}% savings rate, standard FIRE math puts retirement roughly ${sr >= 40 ? "~20" : "~28"} years away from a $0 start — regardless of income level. Every 5% you add to the rate cuts years off the clock.`);
    }
  }
  if (tips.length === 0) push("😎", "All clear", "Your money is behaving. Keep logging — trends over 3+ months are where the real insights live.");
  return tips;
}

/* ---------------- Demo data ---------------- */
function demoData() {
  const m = thisMonth();
  const d = (day) => `${m}-${String(day).padStart(2, "0")}`;
  return {
    transactions: [
      { id: 1, type: "income", amount: 4200, cat: "other", note: "Salary", date: d(1) },
      { id: 2, type: "expense", amount: 1400, cat: "housing", note: "Rent", date: d(2) },
      { id: 3, type: "expense", amount: 96, cat: "subs", note: "Streaming + gym + cloud", date: d(3) },
      { id: 4, type: "expense", amount: 340, cat: "food", note: "Groceries haul", date: d(5) },
      { id: 5, type: "expense", amount: 62, cat: "fun", note: "Movie night", date: d(7) },
      { id: 6, type: "expense", amount: 180, cat: "transport", note: "Fuel + transit", date: d(9) },
      { id: 7, type: "expense", amount: 220, cat: "shopping", note: "New sneakers", date: d(12) },
      { id: 8, type: "expense", amount: 145, cat: "food", note: "Restaurants", date: d(14) },
      { id: 9, type: "expense", amount: 55, cat: "health", note: "Pharmacy", date: d(15) },
      { id: 10, type: "income", amount: 350, cat: "other", note: "Freelance gig", date: d(16) },
      { id: 11, type: "expense", amount: 210, cat: "food", note: "Groceries", date: d(18) },
      { id: 12, type: "expense", amount: 89, cat: "fun", note: "Board game café", date: d(20) },
    ],
    budgets: { housing: 1500, food: 600, transport: 250, fun: 200, shopping: 200, health: 100, subs: 90, other: 100 },
    goals: [
      { id: 1, name: "Emergency Fund", target: 9000, saved: 2600 },
      { id: 2, name: "Japan Trip", target: 3500, saved: 900 },
    ],
    invest: {
      holdings: [
        { id: 1, name: "Global index fund ETF", value: 14200 },
        { id: 2, name: "Retirement account (401k/pension)", value: 9800 },
        { id: 3, name: "High-yield savings", value: 3100 },
      ],
      monthly: 450,
      ret: 7,
      age: 29,
      retireAge: 65,
      wr: 4,
    },
  };
}

/* ============================================================ */
export default function MoneyQuest() {
  const [data, setData] = useState({ transactions: [], budgets: {}, goals: [], invest: DEFAULT_INVEST });
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [tipIndex, setTipIndex] = useState(0);
  const [toast, setToast] = useState(null);

  // form state
  const [form, setForm] = useState({ type: "expense", amount: "", cat: "food", note: "", date: today() });
  const [goalForm, setGoalForm] = useState({ name: "", target: "" });
  const [holdingForm, setHoldingForm] = useState({ name: "", value: "" });

  /* ---- persistence ---- */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r && r.value) {
          const parsed = JSON.parse(r.value);
          setData({ ...parsed, invest: { ...DEFAULT_INVEST, ...(parsed.invest || {}) } });
        }
      } catch (e) {
        /* first run — no data yet */
      }
      setLoaded(true);
    })();
  }, []);

  const save = useCallback(async (next) => {
    setData(next);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("save failed", e);
    }
  }, []);

  const ping = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  /* ---- derived stats (current month) ---- */
  const stats = useMemo(() => {
    const m = thisMonth();
    const tx = data.transactions.filter((t) => monthKey(t.date) === m);
    const income = tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const byCat = {};
    tx.filter((t) => t.type === "expense").forEach((t) => (byCat[t.cat] = (byCat[t.cat] || 0) + t.amount));
    const savingsRate = income > 0 ? (income - expenses) / income : 0;

    // avg monthly savings over all logged months
    const months = {};
    data.transactions.forEach((t) => {
      const k = monthKey(t.date);
      months[k] = months[k] || { i: 0, e: 0 };
      months[k][t.type === "income" ? "i" : "e"] += t.amount;
    });
    const vals = Object.values(months);
    const avgMonthlySavings = vals.length ? vals.reduce((s, v) => s + (v.i - v.e), 0) / vals.length : 0;
    const avgMonthlyExpenses = vals.length ? vals.reduce((s, v) => s + v.e, 0) / vals.length : 0;
    const portfolio = ((data.invest && data.invest.holdings) || []).reduce((s, h) => s + (Number(h.value) || 0), 0);

    // health score
    let score = 50;
    if (income > 0) {
      if (savingsRate >= 0.2) score += 25;
      else if (savingsRate >= 0.1) score += 15;
      else if (savingsRate >= 0) score += 5;
      else score -= 20;
    }
    const budgetEntries = Object.entries(data.budgets).filter(([, v]) => v > 0);
    if (budgetEntries.length) {
      const ok = budgetEntries.filter(([c, v]) => (byCat[c] || 0) <= v).length;
      score += Math.round((ok / budgetEntries.length) * 15) - (budgetEntries.length - ok) * 3;
    }
    if (data.goals.length) {
      const avg = data.goals.reduce((s, g) => s + Math.min(1, g.saved / (g.target || 1)), 0) / data.goals.length;
      score += Math.round(avg * 10);
    }
    if (tx.length >= 5) score += 5;
    if (portfolio > 0) score += 5;
    score = Math.max(0, Math.min(100, score));

    return { tx, income, expenses, byCat, savingsRate, score, avgMonthlySavings, avgMonthlyExpenses, portfolio };
  }, [data]);

  /* ---- FIRE math ---- */
  const fire = useMemo(() => {
    const inv = data.invest || DEFAULT_INVEST;
    const portfolio = stats.portfolio;
    const monthlyExpenses = stats.avgMonthlyExpenses || stats.expenses || 0;
    const annualExpenses = monthlyExpenses * 12;
    const wr = Math.min(10, Math.max(2, Number(inv.wr) || 4));
    const fireNumber = annualExpenses > 0 ? annualExpenses * (100 / wr) : 0;
    const ret = Math.min(15, Math.max(0, Number(inv.ret) || 0));
    const monthly = Math.max(0, Number(inv.monthly) || 0);
    const age = Math.min(100, Math.max(14, Number(inv.age) || 30));
    const retireAge = Math.min(100, Math.max(age, Number(inv.retireAge) || 65));
    const r = ret / 100 / 12;

    // simulate month by month
    let yearsToFI = null;
    if (fireNumber > 0) {
      let v = portfolio;
      if (v >= fireNumber) yearsToFI = 0;
      else {
        for (let m = 1; m <= 720; m++) {
          v = v * (1 + r) + monthly;
          if (v >= fireNumber) {
            yearsToFI = Math.ceil(m / 12);
            break;
          }
        }
      }
    }

    // projection curve (yearly points, up to 40y or FI+5)
    const horizon = Math.min(40, yearsToFI !== null ? Math.max(yearsToFI + 5, 10) : 40);
    const curve = [];
    let v = portfolio;
    curve.push({ age: age, value: Math.round(v) });
    for (let y = 1; y <= horizon; y++) {
      for (let m = 0; m < 12; m++) v = v * (1 + r) + monthly;
      curve.push({ age: age + y, value: Math.round(v) });
    }

    // Coast FIRE: today's portfolio compounding alone until retireAge
    const yearsToRetire = retireAge - age;
    const coastValue = portfolio * Math.pow(1 + ret / 100, yearsToRetire);
    const coastNumber = fireNumber > 0 ? fireNumber / Math.pow(1 + ret / 100, yearsToRetire) : 0;
    const coastReached = fireNumber > 0 && coastValue >= fireNumber;

    return { portfolio, annualExpenses, fireNumber, yearsToFI, curve, coastNumber, coastReached, monthly, ret, age, retireAge, wr };
  }, [data.invest, stats]);

  const advice = useMemo(
    () =>
      buildAdvice({
        income: stats.income,
        expenses: stats.expenses,
        savingsRate: stats.savingsRate,
        byCat: stats.byCat,
        budgets: data.budgets,
        goals: data.goals,
        txCount: data.transactions.length,
        avgMonthlySavings: stats.avgMonthlySavings,
        fire,
      }),
    [stats, data, fire]
  );
  const tip = advice[tipIndex % advice.length];

  const achievements = useMemo(() => {
    const a = [];
    const done = (t) => data.transactions.length >= t;
    a.push({ emoji: "🐣", name: "First Coin", desc: "Log 1 transaction", got: done(1) });
    a.push({ emoji: "📒", name: "Bookkeeper", desc: "Log 10 transactions", got: done(10) });
    a.push({ emoji: "💪", name: "20% Club", desc: "Savings rate ≥ 20%", got: stats.income > 0 && stats.savingsRate >= 0.2 });
    a.push({
      emoji: "🛡️",
      name: "Budget Defender",
      desc: "All budgets intact",
      got: Object.entries(data.budgets).filter(([, v]) => v > 0).length > 0 && Object.entries(data.budgets).every(([c, v]) => v <= 0 || (stats.byCat[c] || 0) <= v),
    });
    a.push({ emoji: "🏁", name: "Quest Complete", desc: "Finish a goal", got: data.goals.some((g) => g.saved >= g.target && g.target > 0) });
    a.push({ emoji: "🌱", name: "Seed Planted", desc: "First investment logged", got: stats.portfolio > 0 });
    a.push({ emoji: "⛵", name: "Coast Mode", desc: "Reach Coast FIRE", got: fire.coastReached });
    return a;
  }, [data, stats, fire]);

  /* ---- actions ---- */
  const addTx = () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return ping("⚠️ Enter an amount first");
    const t = { id: Date.now(), type: form.type, amount: amt, cat: form.type === "income" ? "other" : form.cat, note: form.note.trim(), date: form.date || today() };
    save({ ...data, transactions: [t, ...data.transactions] });
    setForm({ ...form, amount: "", note: "" });
    ping(form.type === "income" ? "💰 Cha-ching! Income logged" : "🧾 Logged — Penny is watching");
  };
  const delTx = (id) => save({ ...data, transactions: data.transactions.filter((t) => t.id !== id) });
  const setBudget = (cid, v) => save({ ...data, budgets: { ...data.budgets, [cid]: Math.max(0, parseFloat(v) || 0) } });
  const addGoal = () => {
    const target = parseFloat(goalForm.target);
    if (!goalForm.name.trim() || !target || target <= 0) return ping("⚠️ Name + target needed");
    save({ ...data, goals: [...data.goals, { id: Date.now(), name: goalForm.name.trim(), target, saved: 0 }] });
    setGoalForm({ name: "", target: "" });
    ping("🎯 New quest accepted!");
  };
  const fundGoal = (id, amt) => {
    save({ ...data, goals: data.goals.map((g) => (g.id === id ? { ...g, saved: Math.max(0, g.saved + amt) } : g)) });
  };
  const delGoal = (id) => save({ ...data, goals: data.goals.filter((g) => g.id !== id) });
  const loadDemo = () => {
    save(demoData());
    ping("🎲 Demo data loaded — explore!");
  };
  const resetAll = () => {
    save({ transactions: [], budgets: {}, goals: [], invest: DEFAULT_INVEST });
    ping("🧹 Fresh table. New game!");
  };
  const setInvest = (patch) => save({ ...data, invest: { ...(data.invest || DEFAULT_INVEST), ...patch } });
  const addHolding = () => {
    const val = parseFloat(holdingForm.value);
    if (!holdingForm.name.trim() || !val || val <= 0) return ping("⚠️ Name + value needed");
    const inv = data.invest || DEFAULT_INVEST;
    setInvest({ holdings: [...inv.holdings, { id: Date.now(), name: holdingForm.name.trim(), value: val }] });
    setHoldingForm({ name: "", value: "" });
    ping("🌱 Seed planted!");
  };
  const updateHolding = (id, value) => {
    const inv = data.invest || DEFAULT_INVEST;
    setInvest({ holdings: inv.holdings.map((h) => (h.id === id ? { ...h, value: Math.max(0, parseFloat(value) || 0) } : h)) });
  };
  const delHolding = (id) => {
    const inv = data.invest || DEFAULT_INVEST;
    setInvest({ holdings: inv.holdings.filter((h) => h.id !== id) });
  };

  /* ---- pie data ---- */
  const pieData = CATEGORIES.map((c) => ({ name: c.label, value: stats.byCat[c.id] || 0, color: c.color, emoji: c.emoji })).filter((d) => d.value > 0);

  const scoreColor = stats.score >= 70 ? LIME : stats.score >= 40 ? GOLD : CORAL;

  const TabBtn = ({ id, emoji, label }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        ...btnStyle(tab === id ? GOLD : CARD),
        transform: tab === id ? "translate(1px,1px)" : "none",
        boxShadow: tab === id ? `2px 2px 0 ${INK}` : `3px 3px 0 ${INK}`,
        flex: "1 1 auto",
        minWidth: 110,
      }}
    >
      {emoji} {label}
    </button>
  );

  if (!loaded)
    return (
      <div style={{ minHeight: "100vh", background: FELT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif", color: "#fff", fontWeight: 900, fontSize: 20 }}>
        🎲 Shuffling your ledger…
      </div>
    );

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 50% 0%, ${FELT} 0%, ${FELT_DARK} 85%)`, fontFamily: "'Nunito', sans-serif", padding: "24px 16px 60px", color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@400;700;800;900&family=IBM+Plex+Mono:wght@600&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        button:active { transform: translate(2px,2px) !important; box-shadow: 1px 1px 0 ${INK} !important; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
        @keyframes popIn { from { transform: translateY(10px) scale(.96); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>

      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* ---------- Header ---------- */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ position: "relative" }}>
            <Mascot score={stats.score} size={96} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontFamily: "'Lilita One', 'Nunito', sans-serif", fontSize: 40, margin: 0, color: GOLD, textShadow: `3px 3px 0 ${INK}`, letterSpacing: 1 }}>
              MONEY QUEST
            </h1>
            <p style={{ margin: "2px 0 0", color: "#D8F3E6", fontWeight: 800 }}>Track it. Budget it. Beat the boss battle that is rent.</p>
          </div>
          {/* Health score chip */}
          <div style={{ ...cardStyle, padding: "10px 18px", textAlign: "center", background: CARD }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>FINANCIAL HP</div>
            <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 34, color: scoreColor, textShadow: `2px 2px 0 ${INK}` }}>{stats.score}</div>
            <div style={{ height: 8, borderRadius: 4, background: "#E7E2D2", border: `2px solid ${INK}`, overflow: "hidden", width: 110 }}>
              <div style={{ width: stats.score + "%", height: "100%", background: scoreColor, transition: "width 600ms" }} />
            </div>
          </div>
        </div>

        {/* ---------- Coach bubble ---------- */}
        {tip && (
          <div style={{ ...cardStyle, marginBottom: 18, display: "flex", gap: 14, alignItems: "flex-start", animation: "popIn 300ms ease-out" }} key={tipIndex + tip.title}>
            <div style={{ fontSize: 34, lineHeight: 1 }}>{tip.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 4 }}>{tip.title}</div>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.5 }}>{tip.text}</div>
            </div>
            {advice.length > 1 && (
              <button style={btnStyle(SKY)} onClick={() => setTipIndex((i) => i + 1)}>
                Next tip ({(tipIndex % advice.length) + 1}/{advice.length})
              </button>
            )}
          </div>
        )}

        {/* ---------- Tabs ---------- */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <TabBtn id="dashboard" emoji="🎛️" label="Dashboard" />
          <TabBtn id="ledger" emoji="🧾" label="Ledger" />
          <TabBtn id="budgets" emoji="🛡️" label="Budgets" />
          <TabBtn id="goals" emoji="🎯" label="Quests" />
          <TabBtn id="fire" emoji="🔥" label="Freedom" />
        </div>

        {/* ============ DASHBOARD ============ */}
        {tab === "dashboard" && (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {/* Month stats */}
            <div style={cardStyle}>
              <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 12 }}>📅 This month's scoreboard</div>
              {[
                { label: "Income", val: stats.income, color: LIME, sign: "+" },
                { label: "Spending", val: stats.expenses, color: CORAL, sign: "−" },
                { label: "Net", val: stats.income - stats.expenses, color: stats.income - stats.expenses >= 0 ? LIME : CORAL, sign: stats.income - stats.expenses >= 0 ? "+" : "−" },
              ].map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `2px dashed #D8D2BE` }}>
                  <span style={{ fontWeight: 800 }}>{r.label}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: r.color, textShadow: `1px 1px 0 ${INK}22` }}>
                    {r.sign}{fmt(r.val)}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <HpBar used={stats.expenses} max={stats.income || 1} label="Income spent" />
              </div>
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, background: "#EFF8E9", border: `2px solid ${INK}`, borderRadius: 10, padding: "8px 10px" }}>
                💾 Savings rate: <span style={{ color: stats.savingsRate >= 0.2 ? "#2E7D32" : stats.savingsRate >= 0 ? "#B58500" : "#C62828" }}>{stats.income > 0 ? Math.round(stats.savingsRate * 100) + "%" : "—"}</span>{" "}
                <span style={{ opacity: 0.7 }}>(target: 20%)</span>
              </div>
            </div>

            {/* Pie */}
            <div style={cardStyle}>
              <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 4 }}>🍩 Where the coins went</div>
              {pieData.length === 0 ? (
                <div style={{ padding: "40px 10px", textAlign: "center", fontWeight: 800, opacity: 0.6 }}>
                  No spending logged this month.<br />Suspiciously frugal… or an empty ledger? 🤨
                </div>
              ) : (
                <>
                  <div style={{ height: 190 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={3} stroke={INK} strokeWidth={2}>
                          {pieData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [fmt(v), n]} contentStyle={{ border: `2px solid ${INK}`, borderRadius: 10, fontFamily: "'Nunito', sans-serif", fontWeight: 800 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {pieData.map((d) => (
                      <span key={d.name} style={{ fontSize: 11, fontWeight: 800, border: `2px solid ${INK}`, borderRadius: 999, padding: "2px 8px", background: d.color + "44" }}>
                        {d.emoji} {d.name} {Math.round((d.value / stats.expenses) * 100)}%
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Achievements */}
            <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 12 }}>🏅 Trophy shelf</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {achievements.map((a) => (
                  <div key={a.name} title={a.desc} style={{ border: `2.5px solid ${INK}`, borderRadius: 14, padding: "10px 14px", background: a.got ? GOLD : "#EDE9DB", opacity: a.got ? 1 : 0.55, boxShadow: a.got ? `3px 3px 0 ${INK}` : "none", textAlign: "center", minWidth: 120 }}>
                    <div style={{ fontSize: 26, filter: a.got ? "none" : "grayscale(1)" }}>{a.emoji}</div>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>{a.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>{a.desc}</div>
                  </div>
                ))}
              </div>
              {data.transactions.length === 0 && (
                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={btnStyle(SKY)} onClick={loadDemo}>🎲 Load demo data</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ LEDGER ============ */}
        {tab === "ledger" && (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <div style={cardStyle}>
              <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 12 }}>➕ Log a move</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {["expense", "income"].map((t) => (
                  <button key={t} style={{ ...btnStyle(form.type === t ? (t === "income" ? LIME : CORAL) : CARD), flex: 1 }} onClick={() => setForm({ ...form, type: t })}>
                    {t === "income" ? "💰 Income" : "🧾 Expense"}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <input style={inputStyle} type="number" min="0" step="0.01" placeholder="Amount ($)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                {form.type === "expense" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {CATEGORIES.map((c) => (
                      <button key={c.id} style={{ ...btnStyle(form.cat === c.id ? c.color : "#fff"), padding: "4px 10px", fontSize: 12, boxShadow: form.cat === c.id ? `2px 2px 0 ${INK}` : "none" }} onClick={() => setForm({ ...form, cat: c.id })}>
                        {c.emoji} {c.label}
                      </button>
                    ))}
                  </div>
                )}
                <input style={inputStyle} placeholder="Note (e.g. 'emotional support latte')" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                <input style={inputStyle} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <button style={{ ...btnStyle(GOLD), fontSize: 16 }} onClick={addTx}>⚡ Add it</button>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18 }}>📜 Recent moves</div>
                {data.transactions.length > 0 && (
                  <button style={{ ...btnStyle("#EDE9DB"), padding: "4px 10px", fontSize: 12 }} onClick={resetAll}>🧹 Reset all</button>
                )}
              </div>
              {data.transactions.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, fontWeight: 800, opacity: 0.6 }}>
                  The ledger is empty. Log a move on the left,<br />or <button style={{ ...btnStyle(SKY), padding: "2px 10px", fontSize: 12 }} onClick={loadDemo}>load demo data</button>
                </div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: "auto", display: "grid", gap: 8 }}>
                  {data.transactions.slice(0, 60).map((t) => {
                    const c = catById(t.cat);
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `2px solid ${INK}`, borderRadius: 12, padding: "8px 10px", background: t.type === "income" ? "#EFF8E9" : "#fff" }}>
                        <span style={{ fontSize: 20 }}>{t.type === "income" ? "💰" : c.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.note || (t.type === "income" ? "Income" : c.label)}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>{t.date}{t.type === "expense" ? " · " + c.label : ""}</div>
                        </div>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: t.type === "income" ? "#2E7D32" : "#C62828" }}>
                          {t.type === "income" ? "+" : "−"}{fmt(t.amount)}
                        </span>
                        <button onClick={() => delTx(t.id)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, opacity: 0.5 }} aria-label="Delete">✖️</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ BUDGETS ============ */}
        {tab === "budgets" && (
          <div style={cardStyle}>
            <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 4 }}>🛡️ Budget HP bars</div>
            <p style={{ marginTop: 0, fontWeight: 700, fontSize: 13, opacity: 0.75 }}>
              Set a monthly limit per category. Spending drains the bar — keep every bar out of the red to earn the Budget Defender trophy.
            </p>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {CATEGORIES.map((c) => {
                const limit = data.budgets[c.id] || 0;
                const spent = stats.byCat[c.id] || 0;
                return (
                  <div key={c.id} style={{ border: `2.5px solid ${INK}`, borderRadius: 14, padding: 12, background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>{c.emoji}</span>
                      <span style={{ fontWeight: 900, flex: 1 }}>{c.label}</span>
                      <input
                        style={{ ...inputStyle, width: 110, padding: "4px 8px" }}
                        type="number"
                        min="0"
                        placeholder="Limit $"
                        value={limit || ""}
                        onChange={(e) => setBudget(c.id, e.target.value)}
                      />
                    </div>
                    {limit > 0 ? (
                      <HpBar used={spent} max={limit} label={`${fmt(spent)} of ${fmt(limit)}`} />
                    ) : (
                      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5 }}>No budget set — spent {fmt(spent)} this month.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ GOALS ============ */}
        {tab === "goals" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={cardStyle}>
              <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 10 }}>🎯 Start a new quest</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...inputStyle, flex: 2, minWidth: 180 }} placeholder='Quest name (e.g. "Emergency Fund")' value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} />
                <input style={{ ...inputStyle, flex: 1, minWidth: 120 }} type="number" min="1" placeholder="Target $" value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} />
                <button style={btnStyle(GOLD)} onClick={addGoal}>⚔️ Accept quest</button>
              </div>
            </div>
            {data.goals.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: "center", fontWeight: 800, opacity: 0.7 }}>
                No quests yet. Pro move: start with an emergency fund of 3–6 months of expenses. Future-you sends their thanks. 🛟
              </div>
            ) : (
              data.goals.map((g) => {
                const pct = Math.min(100, Math.round((g.saved / (g.target || 1)) * 100));
                const done = g.saved >= g.target;
                const eta = stats.avgMonthlySavings > 0 && !done ? Math.ceil((g.target - g.saved) / stats.avgMonthlySavings) : null;
                return (
                  <div key={g.id} style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 24 }}>{done ? "🏁" : "🗺️"}</span>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 17 }}>{g.name} {done && "— COMPLETE!"}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
                          {fmt(g.saved)} / {fmt(g.target)}
                          {eta && eta <= 120 ? ` · ~${eta} mo at your pace` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[25, 100].map((amt) => (
                          <button key={amt} style={{ ...btnStyle(LIME), padding: "4px 10px", fontSize: 12 }} onClick={() => fundGoal(g.id, amt)}>+${amt}</button>
                        ))}
                        <button style={{ ...btnStyle("#EDE9DB"), padding: "4px 10px", fontSize: 12 }} onClick={() => fundGoal(g.id, -25)}>−$25</button>
                        <button style={{ ...btnStyle(CORAL), padding: "4px 10px", fontSize: 12 }} onClick={() => delGoal(g.id)}>🗑️</button>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, height: 20, borderRadius: 10, background: "#E7E2D2", border: `2.5px solid ${INK}`, overflow: "hidden", position: "relative" }}>
                      <div style={{ width: pct + "%", height: "100%", background: done ? `repeating-linear-gradient(45deg, ${GOLD}, ${GOLD} 10px, ${GOLD_DARK} 10px, ${GOLD_DARK} 20px)` : SKY, transition: "width 500ms cubic-bezier(.34,1.56,.64,1)" }} />
                      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>{pct}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ============ FREEDOM (INVEST + FIRE) ============ */}
        {tab === "fire" && (
          <div style={{ display: "grid", gap: 16 }}>
            {/* FIRE number hero */}
            <div style={{ ...cardStyle, background: `linear-gradient(135deg, ${CARD} 60%, #FFF3C4)` }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: 2, minWidth: 240 }}>
                  <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 20 }}>🔥 Your FIRE number</div>
                  {fire.fireNumber > 0 ? (
                    <>
                      <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 44, color: "#D97706", textShadow: `3px 3px 0 ${INK}` }}>{fmt(Math.round(fire.fireNumber))}</div>
                      <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.5 }}>
                        Your average spending is {fmt(Math.round(fire.annualExpenses / 12))}/mo → {fmt(Math.round(fire.annualExpenses))}/yr. With a {fire.wr}% withdrawal rate (the "{Math.round(100 / fire.wr)}× rule"), a portfolio of this size could fund your lifestyle indefinitely — that's financial freedom.
                      </div>
                    </>
                  ) : (
                    <div style={{ fontWeight: 700, fontSize: 14, padding: "10px 0" }}>
                      Log some expenses first (or load demo data) so I can size your freedom target — it's your annual spending × {Math.round(100 / fire.wr)}.
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, marginBottom: 4 }}>PROGRESS TO FREEDOM</div>
                  <div style={{ height: 24, borderRadius: 12, background: "#E7E2D2", border: `3px solid ${INK}`, overflow: "hidden", position: "relative" }}>
                    <div style={{ width: (fire.fireNumber > 0 ? Math.min(100, (fire.portfolio / fire.fireNumber) * 100) : 0) + "%", height: "100%", background: `repeating-linear-gradient(45deg, #FF9F1C, #FF9F1C 10px, ${GOLD} 10px, ${GOLD} 20px)`, transition: "width 600ms" }} />
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12 }}>
                      {fire.fireNumber > 0 ? Math.round((fire.portfolio / fire.fireNumber) * 100) + "%" : "—"}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
                    <span>💼 Portfolio: {fmt(fire.portfolio)}</span>
                    {fire.yearsToFI !== null && fire.fireNumber > 0 && (
                      <span>🗓️ ETA: {fire.yearsToFI === 0 ? "you're there!" : `~${fire.yearsToFI} yrs (age ${fire.age + fire.yearsToFI})`}</span>
                    )}
                    {fire.coastReached ? (
                      <span style={{ color: "#2E7D32" }}>⛵ Coast FIRE: reached!</span>
                    ) : fire.coastNumber > 0 ? (
                      <span>⛵ Coast FIRE needs {fmt(Math.round(fire.coastNumber))} today</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Projection chart */}
            <div style={cardStyle}>
              <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 4 }}>📈 The compounding montage</div>
              <p style={{ marginTop: 0, fontWeight: 700, fontSize: 13, opacity: 0.75 }}>
                Your portfolio growing at {fire.ret}%/yr with {fmt(fire.monthly)}/mo contributions. The dashed line is freedom.
              </p>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fire.curve} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D8D2BE" />
                    <XAxis dataKey="age" tick={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 11 }} label={{ value: "age", position: "insideBottomRight", offset: -2, fontSize: 11 }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 11 }} width={54} />
                    <Tooltip formatter={(v) => [fmt(v), "Portfolio"]} labelFormatter={(l) => "Age " + l} contentStyle={{ border: `2px solid ${INK}`, borderRadius: 10, fontFamily: "'Nunito', sans-serif", fontWeight: 800 }} />
                    {fire.fireNumber > 0 && <ReferenceLine y={fire.fireNumber} stroke={CORAL} strokeWidth={2.5} strokeDasharray="8 6" label={{ value: "🔥 FIRE " + fmtK(fire.fireNumber), position: "insideTopRight", fontWeight: 900, fontSize: 12, fill: "#C62828" }} />}
                    <Area type="monotone" dataKey="value" stroke={INK} strokeWidth={3} fill={GOLD} fillOpacity={0.7} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              {/* Assumptions */}
              <div style={cardStyle}>
                <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 10 }}>🎛️ Your dials</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    { key: "age", label: "Your age", min: 14, max: 100 },
                    { key: "retireAge", label: "Traditional retire age (for Coast FIRE)", min: 40, max: 100 },
                    { key: "monthly", label: "Monthly investing ($)", min: 0, max: 100000 },
                    { key: "ret", label: "Expected annual return % (7% ≈ historical stock avg after inflation)", min: 0, max: 15 },
                    { key: "wr", label: "Withdrawal rate % (4% is the classic rule; 3–3.5% is safer)", min: 2, max: 10 },
                  ].map((f) => (
                    <label key={f.key} style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{f.label}</span>
                      <input
                        style={inputStyle}
                        type="number"
                        min={f.min}
                        max={f.max}
                        value={(data.invest || DEFAULT_INVEST)[f.key]}
                        onChange={(e) => setInvest({ [f.key]: e.target.value === "" ? "" : Number(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Holdings */}
              <div style={cardStyle}>
                <div style={{ fontFamily: "'Lilita One', sans-serif", fontSize: 18, marginBottom: 10 }}>💼 Treasure chest ({fmt(fire.portfolio)})</div>
                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                  {((data.invest || DEFAULT_INVEST).holdings || []).length === 0 && (
                    <div style={{ fontWeight: 800, opacity: 0.6, fontSize: 13, padding: "8px 0" }}>
                      Nothing invested yet. Add anything that compounds: index funds, retirement accounts, high-yield savings…
                    </div>
                  )}
                  {(data.invest || DEFAULT_INVEST).holdings.map((h) => (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, border: `2px solid ${INK}`, borderRadius: 12, padding: "6px 10px", background: "#fff" }}>
                      <span style={{ fontSize: 18 }}>💎</span>
                      <span style={{ flex: 1, fontWeight: 900, fontSize: 13, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</span>
                      <input style={{ ...inputStyle, width: 110, padding: "4px 8px" }} type="number" min="0" value={h.value} onChange={(e) => updateHolding(h.id, e.target.value)} />
                      <button onClick={() => delHolding(h.id)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, opacity: 0.5 }} aria-label="Delete holding">✖️</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input style={{ ...inputStyle, flex: 2, minWidth: 150 }} placeholder="Holding name" value={holdingForm.name} onChange={(e) => setHoldingForm({ ...holdingForm, name: e.target.value })} />
                  <input style={{ ...inputStyle, flex: 1, minWidth: 100 }} type="number" min="0" placeholder="Value $" value={holdingForm.value} onChange={(e) => setHoldingForm({ ...holdingForm, value: e.target.value })} />
                  <button style={btnStyle(LIME)} onClick={addHolding}>🌱 Add</button>
                </div>
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, background: "#FFF7DB", border: `2px solid ${INK}`, borderRadius: 10, padding: "8px 10px", lineHeight: 1.5 }}>
                  💡 <b>Coast FIRE</b> = the point where your existing portfolio alone compounds to your FIRE number by age {fire.retireAge}, even if you never invest another cent. Hit it, and every future dollar buys <i>earlier</i> freedom.
                </div>
              </div>
            </div>
          </div>
        )}

        <p style={{ textAlign: "center", color: "#BFE8D4", fontWeight: 700, fontSize: 12, marginTop: 26 }}>
          Penny gives rules-of-thumb, not licensed financial advice — projections assume steady returns, and real markets are bumpier. Your data is saved automatically to this app's storage.
        </p>
      </div>

      {/* toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", ...cardStyle, padding: "10px 18px", fontWeight: 900, zIndex: 50, animation: "popIn 200ms ease-out" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
