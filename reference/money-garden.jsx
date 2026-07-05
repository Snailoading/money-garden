import { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";

/* ============================================================
   MONEY GARDEN — a financial tracker where your goals grow
   ============================================================ */

const C = {
  bg: "#EEF4E9",
  ink: "#1C352A",
  inkSoft: "#4A6355",
  leaf: "#3E9B5F",
  leafDark: "#2C7546",
  marigold: "#F0B429",
  tomato: "#DE5D42",
  soil: "#8A6F52",
  card: "#FFFFFF",
  border: "#D8E5D0",
  mist: "#F7FAF4",
};

const CATEGORIES = [
  { id: "housing",   label: "Housing",       emoji: "🏠", kind: "need", budget: 1400 },
  { id: "groceries", label: "Groceries",     emoji: "🥕", kind: "need", budget: 450 },
  { id: "utilities", label: "Utilities",     emoji: "💡", kind: "need", budget: 180 },
  { id: "transport", label: "Transport",     emoji: "🚌", kind: "need", budget: 160 },
  { id: "health",    label: "Health",        emoji: "🩺", kind: "need", budget: 120 },
  { id: "dining",    label: "Dining out",    emoji: "🍜", kind: "want", budget: 220 },
  { id: "fun",       label: "Fun & hobbies", emoji: "🎨", kind: "want", budget: 150 },
  { id: "shopping",  label: "Shopping",      emoji: "🛍️", kind: "want", budget: 180 },
  { id: "subs",      label: "Subscriptions", emoji: "📺", kind: "want", budget: 60 },
  { id: "other",     label: "Other",         emoji: "🌀", kind: "want", budget: 100 },
];

const PLANT_KINDS = [
  { id: "sunflower", label: "Sunflower", bloom: "#F0B429" },
  { id: "tulip",     label: "Tulip",     bloom: "#E56A9A" },
  { id: "bluebell",  label: "Bluebell",  bloom: "#5B7FD4" },
  { id: "poppy",     label: "Poppy",     bloom: "#DE5D42" },
  { id: "lavender",  label: "Lavender",  bloom: "#9A7BD0" },
];

const STORAGE_KEY = "money-garden:state-v1";

const DEFAULT_INVEST = { holdings: [], monthly: 0, ret: 7, age: 30, retireAge: 65, wr: 4, retireSpend: 0 };

const fmtK = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k";
  return "$" + Math.round(n);
};

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ---- recurring commitments (subscriptions & installments) ---- */
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const clampDay = (y, mIdx, day) => {
  const dim = new Date(y, mIdx + 1, 0).getDate();
  return Math.min(Math.max(1, Number(day) || 1), dim);
};
function nextDueDate(c) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let dt;
  if (c.cadence === "annual") {
    const m = (Number(c.payMonth) || 1) - 1;
    dt = new Date(now.getFullYear(), m, clampDay(now.getFullYear(), m, c.payDay));
    if (dt < now) dt = new Date(now.getFullYear() + 1, m, clampDay(now.getFullYear() + 1, m, c.payDay));
  } else {
    dt = new Date(now.getFullYear(), now.getMonth(), clampDay(now.getFullYear(), now.getMonth(), c.payDay));
    if (dt < now) dt = new Date(now.getFullYear(), now.getMonth() + 1, clampDay(now.getFullYear(), now.getMonth() + 1, c.payDay));
  }
  return dt;
}
function commitmentEnded(c) {
  if (c.kind === "inst") return (c.paidCount || 0) >= (c.totalPayments || 1);
  if (!c.endDate) return false;
  return nextDueDate(c) > new Date(c.endDate + "T23:59:59");
}
const daysUntil = (dt) => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((dt - now) / 86400000);
};
const shortDate = (dt) => `${MONTH_NAMES[dt.getMonth()]} ${dt.getDate()}`;
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

const fmt = (n, opts = {}) =>
  new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
    ...opts,
  }).format(n);

/* ---------- sample data for first-time visitors ---------- */
function sampleState() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const d = (day) => new Date(y, m, Math.min(day, now.getDate())).toISOString().slice(0, 10);
  return {
    income: 4200,
    budgets: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.budget])),
    transactions: [
      { id: uid(), type: "income",  amount: 4200, category: "other",     note: "Paycheck",        date: d(1) },
      { id: uid(), type: "expense", amount: 1400, category: "housing",   note: "Rent",            date: d(1) },
      { id: uid(), type: "expense", amount: 96.4, category: "groceries", note: "Weekly shop",     date: d(3) },
      { id: uid(), type: "expense", amount: 42.0, category: "dining",    note: "Ramen with Sam",  date: d(5) },
      { id: uid(), type: "expense", amount: 58.9, category: "utilities", note: "Electric bill",   date: d(6) },
      { id: uid(), type: "expense", amount: 15.99, category: "subs",     note: "Streaming",       date: d(7) },
      { id: uid(), type: "expense", amount: 112.3, category: "groceries", note: "Groceries",      date: d(10) },
      { id: uid(), type: "expense", amount: 34.5, category: "fun",       note: "Climbing gym",    date: d(12) },
      { id: uid(), type: "expense", amount: 67.8, category: "shopping",  note: "Running shoes",   date: d(14) },
      { id: uid(), type: "expense", amount: 28.0, category: "transport", note: "Transit pass",    date: d(15) },
    ],
    goals: [
      { id: uid(), name: "Emergency fund", plant: "sunflower", target: 6000, saved: 2150, isEmergency: true },
      { id: uid(), name: "Japan trip",     plant: "tulip",     target: 2800, saved: 640,  isEmergency: false },
      { id: uid(), name: "New laptop",     plant: "bluebell",  target: 1500, saved: 1275, isEmergency: false },
    ],
    invest: {
      holdings: [
        { id: uid(), name: "Global index fund ETF", value: 14200 },
        { id: uid(), name: "Retirement account",    value: 9800 },
      ],
      monthly: 400, ret: 7, age: 29, retireAge: 65, wr: 4, retireSpend: 0,
    },
    commitments: [
      { id: uid(), kind: "sub",  name: "Streaming bundle", amount: 15.99, cadence: "monthly", payDay: 12, payMonth: 1, endDate: "", category: "subs" },
      { id: uid(), kind: "sub",  name: "Gym membership",   amount: 35,    cadence: "monthly", payDay: 1,  payMonth: 1, endDate: "", category: "subs" },
      { id: uid(), kind: "sub",  name: "Car insurance",    amount: 640,   cadence: "annual",  payDay: 15, payMonth: 9, endDate: "", category: "transport" },
      { id: uid(), kind: "inst", name: "Tax bill (plan)",  amount: 240,   cadence: "monthly", payDay: 20, payMonth: 1, totalPayments: 6, paidCount: 2, category: "other" },
    ],
    streak: { count: 3, lastDate: todayISO() },
  };
}

function emptyState() {
  return {
    income: 0,
    budgets: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.budget])),
    transactions: [],
    goals: [],
    invest: { ...DEFAULT_INVEST },
    commitments: [],
    streak: { count: 0, lastDate: null },
  };
}

/* ============================================================
   PLANT — five growth stages rendered in SVG
   ============================================================ */
function Plant({ progress, bloom, size = 110, celebrate }) {
  const stage = progress >= 1 ? 4 : progress >= 0.7 ? 3 : progress >= 0.4 ? 2 : progress >= 0.12 ? 1 : 0;
  const stem = C.leafDark;
  const sway = celebrate ? "mg-sway 1.6s ease-in-out infinite" : "none";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
      {/* soil mound */}
      <ellipse cx="50" cy="92" rx="26" ry="7" fill={C.soil} opacity="0.85" />
      <ellipse cx="50" cy="90.5" rx="26" ry="6.5" fill="#A08560" opacity="0.5" />
      <g style={{ transformOrigin: "50px 90px", animation: sway }}>
        {stage === 0 && (
          <g>
            <ellipse cx="50" cy="88" rx="4.5" ry="6" fill="#C9A36B" transform="rotate(18 50 88)" />
            <path d="M48 84 q2 -3 4 0" stroke="#8A6F52" strokeWidth="1.4" fill="none" />
          </g>
        )}
        {stage >= 1 && (
          <path d={`M50 90 C 50 ${90 - 12 * stage} 50 ${90 - 14 * stage} 50 ${90 - 16 * stage}`}
            stroke={stem} strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        {stage >= 1 && (
          <path d="M50 80 q-10 -4 -13 -12 q11 1 13 8 z" fill={C.leaf} />
        )}
        {stage >= 2 && (
          <path d="M50 70 q10 -4 13 -12 q-11 1 -13 8 z" fill={C.leaf} />
        )}
        {stage >= 3 && (
          <path d="M50 58 q-9 -3 -11 -10 q9 1 11 6 z" fill={C.leaf} opacity="0.9" />
        )}
        {stage === 3 && (
          <circle cx="50" cy={90 - 16 * 3 - 4} r="6" fill={bloom} opacity="0.55" stroke={stem} strokeWidth="1.5" />
        )}
        {stage === 4 && (
          <g>
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <ellipse key={a} cx="50" cy="16" rx="6" ry="10"
                transform={`rotate(${a} 50 26)`} fill={bloom} opacity="0.95" />
            ))}
            <circle cx="50" cy="26" r="6.5" fill="#7A4E2A" />
            <circle cx="48.5" cy="24.5" r="2" fill="#9A6B3F" />
          </g>
        )}
      </g>
    </svg>
  );
}

/* ============================================================
   WEATHER — the month's health, drawn over the garden
   ============================================================ */
function weatherFor(score) {
  if (score >= 80) return { icon: "☀️", word: "Sunny", blurb: "Your money is thriving." };
  if (score >= 60) return { icon: "🌤️", word: "Fair", blurb: "Mostly healthy, a little drift." };
  if (score >= 40) return { icon: "☁️", word: "Overcast", blurb: "Spending is creeping up." };
  return { icon: "🌧️", word: "Stormy", blurb: "Budget needs shelter this month." };
}

/* ============================================================
   MAIN APP
   ============================================================ */
export default function MoneyGarden() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const memoryFallback = useRef(false);
  const toastTimer = useRef(null);

  /* ---------- load & persist ---------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setState({ ...parsed, invest: { ...DEFAULT_INVEST, ...(parsed.invest || {}) }, commitments: parsed.commitments || [] });
          return;
        }
      } catch (e) { /* key missing or storage unavailable */ }
      setStateSafe(emptyState(), true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStateSafe = (next, skipToastOnFail = false) => {
    setState(next);
    (async () => {
      try {
        const r = await window.storage.set(STORAGE_KEY, JSON.stringify(next));
        if (!r) throw new Error("no result");
      } catch (e) {
        if (!memoryFallback.current && !skipToastOnFail) {
          memoryFallback.current = true;
          showToast("Saving is unavailable here — changes live in this session only.");
        }
      }
    })();
  };

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const bumpStreak = (s) => {
    const t = todayISO();
    if (s.streak.lastDate === t) return s.streak;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const count = s.streak.lastDate === yesterday ? s.streak.count + 1 : 1;
    return { count, lastDate: t };
  };

  /* ---------- derived numbers ---------- */
  const derived = useMemo(() => {
    if (!state) return null;
    const mk = monthKey();
    const monthTx = state.transactions.filter((t) => t.date.startsWith(mk));
    const spent = monthTx.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
    const earned = monthTx.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
    const income = earned || state.income || 0;
    const savedThisMonth = monthTx.filter((t) => t.type === "saving").reduce((a, t) => a + t.amount, 0);
    const left = income - spent - savedThisMonth;
    const savingsRate = income > 0 ? savedThisMonth / income : 0;

    const byCat = {};
    for (const c of CATEGORIES) byCat[c.id] = 0;
    for (const t of monthTx) if (t.type === "expense") byCat[t.category] = (byCat[t.category] || 0) + t.amount;

    const totalBudget = Object.values(state.budgets).reduce((a, b) => a + (Number(b) || 0), 0);
    const overruns = CATEGORIES.filter((c) => byCat[c.id] > (state.budgets[c.id] || 0) && (state.budgets[c.id] || 0) > 0);

    const needs = CATEGORIES.filter((c) => c.kind === "need").reduce((a, c) => a + byCat[c.id], 0);
    const wants = CATEGORIES.filter((c) => c.kind === "want").reduce((a, c) => a + byCat[c.id], 0);

    // health score: budget adherence (55) + savings behaviour (30) + logging streak (15)
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthFrac = Math.min(1, now.getDate() / daysInMonth);
    const paceRatio = totalBudget > 0 ? spent / (totalBudget * monthFrac || 1) : 1;
    const adherence = Math.max(0, Math.min(1, 2 - paceRatio)); // 1 when on/under pace
    const saveScore = Math.min(1, savingsRate / 0.2);
    const streakScore = Math.min(1, state.streak.count / 7);
    const health = Math.round(adherence * 55 + saveScore * 30 + streakScore * 15);

    // daily cumulative spend for chart
    const daily = [];
    let run = 0;
    for (let day = 1; day <= now.getDate(); day++) {
      const dstr = new Date(now.getFullYear(), now.getMonth(), day).toISOString().slice(0, 10);
      run += monthTx.filter((t) => t.type === "expense" && t.date === dstr).reduce((a, t) => a + t.amount, 0);
      daily.push({ day, spent: Math.round(run), pace: Math.round((totalBudget / daysInMonth) * day) });
    }

    const emergency = state.goals.find((g) => g.isEmergency);
    const monthlyExpenses = spent > 0 ? spent / monthFrac : totalBudget || 1;
    const emergencyMonths = emergency ? emergency.saved / (monthlyExpenses || 1) : 0;

    // ---- the orchard: investments & financial independence ----
    const inv = state.invest || DEFAULT_INVEST;
    const portfolio = (inv.holdings || []).reduce((a, h) => a + (Number(h.value) || 0), 0);
    const customSpend = Math.max(0, Number(inv.retireSpend) || 0);
    const fiMonthlySpend = customSpend > 0 ? customSpend : monthlyExpenses;
    const spendBasis = customSpend > 0 ? "custom" : "auto";
    const annualExpenses = fiMonthlySpend * 12;
    const wr = Math.min(10, Math.max(2, Number(inv.wr) || 4));
    const fireNumber = annualExpenses > 0 ? annualExpenses * (100 / wr) : 0;
    const ret = Math.min(15, Math.max(0, Number(inv.ret) || 0));
    const contrib = Math.max(0, Number(inv.monthly) || 0);
    const age = Math.min(100, Math.max(14, Number(inv.age) || 30));
    const retireAge = Math.min(100, Math.max(age, Number(inv.retireAge) || 65));
    const retLo = Math.max(0, ret - 2);
    const retHi = Math.min(15, ret + 2);

    const yearsFor = (annualRet) => {
      if (fireNumber <= 0) return null;
      const rr = annualRet / 100 / 12;
      let v = portfolio;
      if (v >= fireNumber) return 0;
      for (let mm = 1; mm <= 720; mm++) {
        v = v * (1 + rr) + contrib;
        if (v >= fireNumber) return Math.ceil(mm / 12);
      }
      return null;
    };
    const yearsToFI = yearsFor(ret);
    const yearsToFIEarly = yearsFor(retHi);  // kinder markets → earlier
    const yearsToFILate = yearsFor(retLo);   // slower markets → later

    const horizonBasis = yearsToFILate !== null ? yearsToFILate : yearsToFI !== null ? yearsToFI : 36;
    const horizon = Math.min(45, Math.max(horizonBasis + 4, 10));
    const seriesFor = (annualRet) => {
      const rr = annualRet / 100 / 12;
      const out = [Math.round(portfolio)];
      let v = portfolio;
      for (let yy = 1; yy <= horizon; yy++) {
        for (let mm = 0; mm < 12; mm++) v = v * (1 + rr) + contrib;
        out.push(Math.round(v));
      }
      return out;
    };
    const baseSeries = seriesFor(ret);
    const loSeries = seriesFor(retLo);
    const hiSeries = seriesFor(retHi);
    const curve = baseSeries.map((v, i) => ({ age: age + i, value: v, band: [loSeries[i], hiSeries[i]] }));
    const yearsToRetire = retireAge - age;
    const coastNumber = fireNumber > 0 ? fireNumber / Math.pow(1 + ret / 100, yearsToRetire) : 0;
    const coastReached = fireNumber > 0 && portfolio * Math.pow(1 + ret / 100, yearsToRetire) >= fireNumber;
    const fire = {
      portfolio, annualExpenses, fiMonthlySpend, spendBasis, fireNumber, yearsToFI, yearsToFIEarly, yearsToFILate, retLo, retHi,
      curve, coastNumber, coastReached,
      progress: fireNumber > 0 ? Math.min(1, portfolio / fireNumber) : 0,
      monthly: contrib, ret, age, retireAge, wr,
    };

    // ---- vines & trellis: recurring commitments ----
    const allCommitments = state.commitments || [];
    const active = allCommitments.filter((c) => !commitmentEnded(c));
    const subsMonthly = active.filter((c) => c.kind === "sub").reduce((a, c) => a + (c.cadence === "annual" ? (Number(c.amount) || 0) / 12 : Number(c.amount) || 0), 0);
    const instMonthly = active.filter((c) => c.kind === "inst").reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const dueSoon = active
      .map((c) => ({ c, due: nextDueDate(c), days: daysUntil(nextDueDate(c)) }))
      .filter((x) => x.days <= 14)
      .sort((a, b) => a.days - b.days);
    const commit = { all: allCommitments, active, subsMonthly, instMonthly, dueSoon };

    return { monthTx, spent, earned, income, savedThisMonth, left, savingsRate, byCat, totalBudget, overruns, needs, wants, health, daily, daysInMonth, monthFrac, emergency, emergencyMonths, monthlyExpenses, fire, commit };
  }, [state]);

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

  const isEmpty = state.transactions.length === 0 && state.goals.length === 0;
  const weather = weatherFor(derived.health);

  /* ---------- actions ---------- */
  const addTransaction = (tx) => {
    const next = { ...state, transactions: [{ ...tx, id: uid() }, ...state.transactions] };
    next.streak = bumpStreak(state);
    if (next.streak.count > state.streak.count && next.streak.count > 1) {
      showToast(`🔥 ${next.streak.count}-day logging streak — keep it growing!`);
    }
    setStateSafe(next);
  };

  const deleteTransaction = (id) =>
    setStateSafe({ ...state, transactions: state.transactions.filter((t) => t.id !== id) });

  const addGoal = (g) => setStateSafe({ ...state, goals: [...state.goals, { ...g, id: uid() }] });

  const waterGoal = (id, amount) => {
    const goals = state.goals.map((g) => {
      if (g.id !== id) return g;
      const saved = Math.min(g.target, g.saved + amount);
      if (saved >= g.target && g.saved < g.target) showToast(`🌸 "${g.name}" is in full bloom — goal reached!`);
      return { ...g, saved };
    });
    const tx = { id: uid(), type: "saving", amount, category: "other", note: `→ ${state.goals.find((g) => g.id === id)?.name}`, date: todayISO() };
    setStateSafe({ ...state, goals, transactions: [tx, ...state.transactions], streak: bumpStreak(state) });
  };

  const deleteGoal = (id) => setStateSafe({ ...state, goals: state.goals.filter((g) => g.id !== id) });
  const setBudget = (catId, v) => setStateSafe({ ...state, budgets: { ...state.budgets, [catId]: Number(v) || 0 } });
  const setIncome = (v) => setStateSafe({ ...state, income: Number(v) || 0 });

  const setInvest = (patch) => setStateSafe({ ...state, invest: { ...(state.invest || DEFAULT_INVEST), ...patch } });
  const addHolding = (h) => {
    setInvest({ holdings: [...((state.invest || DEFAULT_INVEST).holdings || []), { ...h, id: uid() }] });
    showToast(`🌳 "${h.name}" planted in the orchard`);
  };
  const updateHolding = (id, value) =>
    setInvest({ holdings: (state.invest || DEFAULT_INVEST).holdings.map((h) => (h.id === id ? { ...h, value: Math.max(0, Number(value) || 0) } : h)) });
  const deleteHolding = (id) =>
    setInvest({ holdings: (state.invest || DEFAULT_INVEST).holdings.filter((h) => h.id !== id) });

  const waterOrchard = (id, amount) => {
    const inv = state.invest || DEFAULT_INVEST;
    const target = inv.holdings.find((h) => h.id === id);
    if (!target || !(amount > 0)) return;
    const holdings = inv.holdings.map((h) => (h.id === id ? { ...h, value: (Number(h.value) || 0) + amount } : h));
    const tx = { id: uid(), type: "saving", amount, category: "other", note: `→ Orchard: ${target.name}`, date: todayISO() };
    setStateSafe({ ...state, invest: { ...inv, holdings }, transactions: [tx, ...state.transactions], streak: bumpStreak(state) });
    showToast(`💧 ${fmt(amount)} watered into "${target.name}"`);
  };

  const addCommitment = (c) => {
    setStateSafe({ ...state, commitments: [...(state.commitments || []), { ...c, id: uid() }] });
    showToast(c.kind === "inst" ? `🪜 "${c.name}" staked to the trellis` : `🌿 "${c.name}" vine planted`);
  };
  const deleteCommitment = (id) =>
    setStateSafe({ ...state, commitments: (state.commitments || []).filter((c) => c.id !== id) });
  const logCommitmentPayment = (id) => {
    const c = (state.commitments || []).find((x) => x.id === id);
    if (!c) return;
    const tx = { id: uid(), type: "expense", amount: Number(c.amount) || 0, category: c.category || "subs", note: `${c.kind === "inst" ? "Installment" : "Subscription"}: ${c.name}`, date: todayISO() };
    const commitments = (state.commitments || []).map((x) => (x.id === id && x.kind === "inst" ? { ...x, paidCount: (x.paidCount || 0) + 1 } : x));
    setStateSafe({ ...state, commitments, transactions: [tx, ...state.transactions], streak: bumpStreak(state) });
    showToast(`💸 ${fmt(c.amount)} logged for "${c.name}"`);
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: "🌤️" },
    { id: "log",      label: "Log",      icon: "✏️" },
    { id: "budgets",  label: "Budgets",  icon: "🧺" },
    { id: "garden",   label: "Garden",   icon: "🌷" },
    { id: "orchard",  label: "Orchard",  icon: "🌳" },
    { id: "advice",   label: "Advice",   icon: "🪴" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=DM+Sans:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        input, select, button { font-family: inherit; }
        input[type="date"] { -webkit-appearance: none; appearance: none; min-height: 40px; }
        input[type="date"]::-webkit-date-and-time-value { text-align: left; }
        input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid ${C.marigold}; outline-offset: 2px; border-radius: 8px; }
        @keyframes mg-sway { 0%,100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
        @keyframes mg-pop { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        .mg-card { background: ${C.card}; border: 1.5px solid ${C.border}; border-radius: 18px; }
        .mg-num { font-variant-numeric: tabular-nums; }
        .mg-tab { border: 1.5px solid transparent; }
        .mg-tab:hover { border-color: ${C.border}; }
        .mg-row:hover { background: ${C.mist}; }
        .mg-btn { transition: transform .08s ease; }
        .mg-btn:active { transform: scale(.96); }
      `}</style>

      {/* ===== header ===== */}
      <header style={{ maxWidth: 980, margin: "0 auto", padding: "26px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 700 }}>
              {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "clamp(30px, 5vw, 44px)", margin: "2px 0 0", lineHeight: 1.05 }}>
              Money Garden
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="mg-tab mg-btn"
              style={{
                padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 600, fontSize: 14,
                background: tab === t.id ? C.ink : "transparent",
                color: tab === t.id ? "#fff" : C.ink,
              }}>
              <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "16px 20px 60px" }}>
        {isEmpty && (
          <div className="mg-card" style={{ padding: 24, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20 }}>Fresh soil 🌱</div>
              <div style={{ color: C.inkSoft, fontSize: 14 }}>Log your first expense or plant a goal — or explore with sample data first.</div>
            </div>
            <button className="mg-btn" onClick={() => setStateSafe(sampleState())}
              style={{ background: C.leaf, color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>
              Plant sample data
            </button>
          </div>
        )}

        {tab === "overview" && <Overview state={state} d={derived} setIncome={setIncome} goTo={setTab} />}
        {tab === "log" && <Log state={state} d={derived} addTransaction={addTransaction} deleteTransaction={deleteTransaction} />}
        {tab === "budgets" && <Budgets state={state} d={derived} setBudget={setBudget} addCommitment={addCommitment} deleteCommitment={deleteCommitment} logCommitmentPayment={logCommitmentPayment} />}
        {tab === "garden" && <Garden state={state} addGoal={addGoal} waterGoal={waterGoal} deleteGoal={deleteGoal} />}
        {tab === "orchard" && <Orchard state={state} d={derived} setInvest={setInvest} addHolding={addHolding} updateHolding={updateHolding} deleteHolding={deleteHolding} waterOrchard={waterOrchard} />}
        {tab === "advice" && <Advice state={state} d={derived} />}

        {/* ===== the shed — housekeeping ===== */}
        <footer style={{ marginTop: 28, paddingTop: 16, borderTop: `1.5px dashed ${C.border}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft }}>
            🧰 The shed · your data saves automatically to this app's storage. Edit anything in place; delete a logged entry with its ✕.
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!isEmpty && (
              <button className="mg-btn" onClick={() => { setStateSafe(sampleState()); setConfirmReset(false); showToast("🌼 Sample garden replanted"); }}
                style={{ background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 14px", fontWeight: 600, fontSize: 13, color: C.inkSoft, cursor: "pointer" }}>
                Replant sample data
              </button>
            )}
            {confirmReset ? (
              <button className="mg-btn" onClick={() => { setStateSafe(emptyState()); setConfirmReset(false); setTab("overview"); showToast("🍂 Fresh soil — everything cleared"); }}
                style={{ background: C.tomato, border: `1.5px solid ${C.tomato}`, borderRadius: 10, padding: "7px 14px", fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }}>
                Really erase everything?
              </button>
            ) : (
              <button className="mg-btn" onClick={() => { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); }}
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
          background: C.ink, color: "#fff", padding: "12px 20px", borderRadius: 14,
          fontWeight: 600, boxShadow: "0 10px 30px rgba(28,53,42,.35)", animation: "mg-pop .25s ease", zIndex: 50, maxWidth: "90vw",
        }}>{toast}</div>
      )}
    </div>
  );
}

/* ============================================================
   OVERVIEW
   ============================================================ */
function Overview({ state, d, setIncome, goTo }) {
  const donut = CATEGORIES.map((c) => ({ name: c.label, emoji: c.emoji, value: Math.round(d.byCat[c.id]) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const palette = ["#3E9B5F", "#F0B429", "#5B7FD4", "#DE5D42", "#9A7BD0", "#E56A9A", "#2C7546", "#8A6F52", "#6BB98A", "#C9A36B"];
  const leftPerDay = d.left / Math.max(1, d.daysInMonth - new Date().getDate() + 1);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* hero */}
      <section className="mg-card" style={{ padding: "26px 26px 0", overflow: "hidden", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 18 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: ".1em" }}>Left to spend this month</div>
            <div className="mg-num" style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "clamp(44px, 8vw, 72px)", lineHeight: 1, color: d.left >= 0 ? C.ink : C.tomato, margin: "6px 0 4px" }}>
              {fmt(d.left)}
            </div>
            <div style={{ color: C.inkSoft, fontSize: 14 }}>
              {d.left >= 0
                ? <>≈ <b className="mg-num">{fmt(Math.max(0, leftPerDay))}</b> a day through {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                : <>You're past this month's income — time to prune. 🌧️</>}
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, alignContent: "start", minWidth: 220 }}>
            <Stat label="Earned" value={fmt(d.income)} color={C.leafDark} />
            <Stat label="Spent" value={fmt(d.spent)} color={C.tomato} />
            <Stat label="Sent to goals" value={fmt(d.savedThisMonth)} color={C.marigold} sub={d.income > 0 ? `${Math.round(d.savingsRate * 100)}% savings rate` : null} />
            <label style={{ fontSize: 12, color: C.inkSoft, display: "flex", alignItems: "center", gap: 8 }}>
              Monthly income
              <input className="mg-num" type="number" min="0" value={state.income || ""} placeholder="4200"
                onChange={(e) => setIncome(e.target.value)}
                style={{ width: 100, padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.mist }} />
            </label>
          </div>
        </div>
        {/* horizon strip */}
        <svg viewBox="0 0 980 70" preserveAspectRatio="none" style={{ display: "block", width: "calc(100% + 52px)", margin: "14px -26px 0", height: 58 }}>
          <path d="M0 45 Q 160 20 320 40 T 640 38 T 980 42 L 980 70 L 0 70 Z" fill={C.leaf} opacity="0.22" />
          <path d="M0 55 Q 200 35 420 52 T 980 50 L 980 70 L 0 70 Z" fill={C.leafDark} opacity="0.3" />
          {state.goals.slice(0, 5).map((g, i) => (
            <g key={g.id} transform={`translate(${90 + i * 190}, 8) scale(0.55)`}>
              <PlantMini progress={g.saved / g.target} bloom={PLANT_KINDS.find((p) => p.id === g.plant)?.bloom || C.marigold} />
            </g>
          ))}
        </svg>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* spending pace */}
        <section className="mg-card" style={{ padding: 20 }}>
          <CardTitle>Spending pace</CardTitle>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: C.inkSoft }}>
            Your cumulative spend vs. an even-pace line for a <b className="mg-num">{fmt(d.totalBudget)}</b> monthly budget.
          </p>
          <div style={{ height: 190 }}>
            <ResponsiveContainer>
              <AreaChart data={d.daily} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: C.inkSoft }} tickLine={false} axisLine={{ stroke: C.border }} />
                <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000) + "k" : v}`} />
                <Tooltip formatter={(v, n) => [fmt(v), n === "spent" ? "Spent" : "Even pace"]} labelFormatter={(l) => `Day ${l}`} contentStyle={{ borderRadius: 12, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} />
                <Area type="monotone" dataKey="pace" stroke={C.border} strokeWidth={2} strokeDasharray="6 4" fill="none" />
                <Area type="monotone" dataKey="spent" stroke={C.leafDark} strokeWidth={2.5} fill={C.leaf} fillOpacity={0.18} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* category donut */}
        <section className="mg-card" style={{ padding: 20 }}>
          <CardTitle>Where it went</CardTitle>
          {donut.length === 0 ? (
            <Empty text="No expenses yet this month — the pie is unbaked. 🥧" cta="Log one" onClick={() => goTo("log")} />
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 170, height: 170 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donut} dataKey="value" innerRadius={48} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                      {donut.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13, display: "grid", gap: 5, flex: 1, minWidth: 150 }}>
                {donut.slice(0, 5).map((x, i) => (
                  <li key={x.name} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: palette[i % palette.length], marginRight: 7 }} />{x.emoji} {x.name}</span>
                    <b className="mg-num">{fmt(x.value)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PlantMini({ progress, bloom }) {
  return <Plant progress={progress} bloom={bloom} size={100} celebrate={progress >= 1} />;
}

function Stat({ label, value, color, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, borderBottom: `1px dashed ${C.border}`, paddingBottom: 6 }}>
      <span style={{ fontSize: 13, color: C.inkSoft }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <b className="mg-num" style={{ color, fontSize: 16 }}>{value}</b>
        {sub && <div style={{ fontSize: 11, color: C.inkSoft }}>{sub}</div>}
      </span>
    </div>
  );
}

function CardTitle({ children }) {
  return <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, margin: "0 0 10px" }}>{children}</h2>;
}

function Empty({ text, cta, onClick }) {
  return (
    <div style={{ padding: "26px 10px", textAlign: "center", color: C.inkSoft, fontSize: 14 }}>
      <div style={{ marginBottom: 10 }}>{text}</div>
      {cta && <button className="mg-btn" onClick={onClick} style={{ background: C.ink, color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>{cta}</button>}
    </div>
  );
}

/* ============================================================
   LOG — add & browse transactions
   ============================================================ */
function Log({ state, d, addTransaction, deleteTransaction }) {
  const [type, setType] = useState("expense");
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
          {[["expense", "🧾 Expense"], ["income", "💵 Income"]].map(([v, l]) => (
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
        <CardTitle>This month's ledger</CardTitle>
        {d.monthTx.length === 0 ? (
          <Empty text="Nothing logged yet this month." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {d.monthTx.slice(0, 40).map((t) => {
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

const inputStyle = { width: "100%", height: 40, boxSizing: "border-box", padding: "9px 10px", border: `1.5px solid ${C.border}`, borderRadius: 10, background: C.mist, fontSize: 14, color: C.ink, fontFamily: "inherit", lineHeight: "normal" };

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
      {label}
      {children}
    </label>
  );
}

/* ============================================================
   BUDGETS
   ============================================================ */
function Budgets({ state, d, setBudget, addCommitment, deleteCommitment, logCommitmentPayment }) {
  const cm = d.commit;
  const [cKind, setCKind] = useState("sub");
  const [cName, setCName] = useState("");
  const [cAmount, setCAmount] = useState("");
  const [cCadence, setCCadence] = useState("monthly");
  const [cDay, setCDay] = useState(1);
  const [cMonth, setCMonth] = useState(1);
  const [cEnd, setCEnd] = useState("");
  const [cTotal, setCTotal] = useState("");
  const [cPaid, setCPaid] = useState("");
  const [cCategory, setCCategory] = useState("subs");

  const canAdd = cName.trim() && parseFloat(cAmount) > 0 && (cKind === "sub" || parseInt(cTotal) > 0);
  const submitCommitment = () => {
    if (!canAdd) return;
    addCommitment({
      kind: cKind, name: cName.trim(), amount: parseFloat(cAmount),
      cadence: cKind === "inst" ? "monthly" : cCadence,
      payDay: Math.min(31, Math.max(1, parseInt(cDay) || 1)),
      payMonth: Math.min(12, Math.max(1, parseInt(cMonth) || 1)),
      endDate: cKind === "sub" ? cEnd : "",
      totalPayments: cKind === "inst" ? Math.max(1, parseInt(cTotal) || 1) : undefined,
      paidCount: cKind === "inst" ? Math.max(0, parseInt(cPaid) || 0) : undefined,
      category: cCategory,
    });
    setCName(""); setCAmount(""); setCEnd(""); setCTotal(""); setCPaid("");
  };

  const subs = cm.all.filter((c) => c.kind === "sub");
  const insts = cm.all.filter((c) => c.kind === "inst");

  const CommitmentRow = ({ c }) => {
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
              ended ? "All payments made 🎉" : <>{c.paidCount || 0} of {c.totalPayments} paid · {fmt((c.totalPayments - (c.paidCount || 0)) * c.amount)} to go</>
            ) : (
              <>{c.cadence === "annual" ? "yearly" : "monthly"}{c.endDate ? ` · ends ${c.endDate}` : ""}</>
            )}
            {!ended && <> · next {shortDate(due)}{days <= 7 ? ` (in ${days}d)` : ""}</>}
          </div>
          {c.kind === "inst" && !ended && (
            <div style={{ height: 6, background: C.mist, border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden", marginTop: 4, maxWidth: 220 }}>
              <div style={{ width: `${Math.min(100, ((c.paidCount || 0) / c.totalPayments) * 100)}%`, height: "100%", background: C.leaf }} />
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
            {[{ id: "sub", label: "🌿 Subscription" }, { id: "inst", label: "🪜 Installment" }].map((k) => (
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
                  <select value={cCadence} onChange={(e) => setCCadence(e.target.value)} style={inputStyle}>
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

/* ============================================================
   GARDEN — goals as growing plants
   ============================================================ */
function Garden({ state, addGoal, waterGoal, deleteGoal }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [plant, setPlant] = useState("tulip");
  const [isEmergency, setIsEmergency] = useState(false);
  const [waterAmounts, setWaterAmounts] = useState({});

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
          <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} />
          This is my emergency fund (the advisor tracks it against 3–6 months of expenses)
        </label>
        <button className="mg-btn" onClick={submit} disabled={!name.trim() || !target}
          style={{ marginTop: 12, background: name.trim() && target ? C.leaf : C.border, color: "#fff", border: "none", borderRadius: 12, padding: "11px 22px", fontWeight: 700, cursor: name.trim() && target ? "pointer" : "not-allowed" }}>
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
            const stageWord = progress >= 1 ? "In full bloom 🌸" : progress >= 0.7 ? "Budding" : progress >= 0.4 ? "Growing tall" : progress >= 0.12 ? "Sprouting" : "Just planted";
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
                      onKeyDown={(e) => { if (e.key === "Enter") { const a = parseFloat(waterAmounts[g.id]); if (a > 0) { waterGoal(g.id, a); setWaterAmounts({ ...waterAmounts, [g.id]: "" }); } } }}
                      style={{ ...inputStyle, flex: 1, padding: "7px 9px" }} aria-label={`Amount to add to ${g.name}`} />
                    <button className="mg-btn" onClick={() => { const a = parseFloat(waterAmounts[g.id]); if (a > 0) { waterGoal(g.id, a); setWaterAmounts({ ...waterAmounts, [g.id]: "" }); } }}
                      style={{ background: C.leafDark, color: "#fff", border: "none", borderRadius: 10, padding: "7px 14px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
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

/* ============================================================
   ORCHARD — investments & the long game (FIRE)
   ============================================================ */
function OrchardTree({ progress, coast, fired, size = 150 }) {
  const p = Math.max(0.08, Math.min(1, progress || 0));
  const trunkH = 18 + p * 34;
  const canopyR = 10 + p * 22;
  const topY = 88 - trunkH;
  const sway = fired ? "mg-sway 2.4s ease-in-out infinite" : "none";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
      <ellipse cx="50" cy="92" rx="30" ry="7" fill={C.soil} opacity="0.85" />
      <ellipse cx="50" cy="90.5" rx="30" ry="6.5" fill="#A08560" opacity="0.5" />
      <g style={{ transformOrigin: "50px 90px", animation: sway }}>
        <path d={`M50 90 C 49 ${90 - trunkH * 0.5} 51 ${90 - trunkH * 0.7} 50 ${topY}`}
          stroke="#7A5C3E" strokeWidth={2.5 + p * 2.5} fill="none" strokeLinecap="round" />
        {p > 0.35 && <path d={`M50 ${topY + canopyR * 0.9} q-8 -3 -12 -9`} stroke="#7A5C3E" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
        <circle cx={50 - canopyR * 0.55} cy={topY + canopyR * 0.25} r={canopyR * 0.75} fill={fired ? C.marigold : C.leaf} opacity="0.9" />
        <circle cx={50 + canopyR * 0.55} cy={topY + canopyR * 0.25} r={canopyR * 0.75} fill={fired ? "#E8A81C" : C.leafDark} opacity="0.85" />
        <circle cx="50" cy={topY - canopyR * 0.15} r={canopyR} fill={fired ? "#F6C64B" : "#57AB72"} />
        {(coast || fired) &&
          [...Array(fired ? 6 : 3)].map((_, i) => {
            const a = (i * 2 * Math.PI) / (fired ? 6 : 3) + 0.7;
            return <circle key={i} cx={50 + canopyR * 0.65 * Math.cos(a)} cy={topY - canopyR * 0.15 + canopyR * 0.55 * Math.sin(a)} r="2.8" fill={C.tomato} />;
          })}
      </g>
    </svg>
  );
}

function Orchard({ state, d, setInvest, addHolding, updateHolding, deleteHolding, waterOrchard }) {
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
                  Your financial-independence number: {f.spendBasis === "custom" ? "your planned retirement spending" : "your current spending pace"} of about <b className="mg-num" style={{ color: C.ink }}>{fmt(f.fiMonthlySpend)}</b>/month, annualized and multiplied by {Math.round(100 / f.wr)} (the {f.wr}% withdrawal rule of thumb). A portfolio this size could sustain that lifestyle indefinitely.
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
                          <> · window <b style={{ color: C.ink }}>{earlyAge}–{lateAge !== null ? lateAge : `${earlyAge}+`}</b> in {f.retLo}–{f.retHi}% markets</>
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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={f.curve} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: C.inkSoft }} tickLine={false} axisLine={{ stroke: C.border }} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: C.inkSoft }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                formatter={(v, nm) => (nm === "band" ? [`${fmt(v[0])} – ${fmt(v[1])}`, `Bumpier markets (${f.retLo}–${f.retHi}%)`] : [fmt(v), `Expected path (${f.ret}%)`])}
                labelFormatter={(l) => `Age ${l}`}
                contentStyle={{ borderRadius: 12, border: `1.5px solid ${C.border}`, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }} />
              {f.fireNumber > 0 && (
                <ReferenceLine y={f.fireNumber} stroke={C.tomato} strokeDasharray="6 5" strokeWidth={2}
                  label={{ value: `Freedom ${fmtK(f.fireNumber)}`, position: "insideTopRight", fontSize: 12, fill: C.tomato, fontWeight: 700 }} />
              )}
              <Area type="monotone" dataKey="band" stroke="none" fill={C.leaf} fillOpacity={0.14} dot={false} activeDot={false} />
              <Area type="monotone" dataKey="value" stroke={C.leafDark} strokeWidth={2.5} fill={C.leaf} fillOpacity={0.22} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* ---- growing conditions ---- */}
        <section className="mg-card" style={{ padding: 20 }}>
          <CardTitle>Growing conditions</CardTitle>
          <div style={{ display: "grid", gap: 10 }}>
            <Field label="Your age">
              <input className="mg-num" type="number" min="14" max="100" value={inv.age} onChange={(e) => setInvest({ age: e.target.value === "" ? "" : Number(e.target.value) })} style={inputStyle} />
            </Field>
            <Field label="Traditional retirement age (anchors Coast FIRE)">
              <input className="mg-num" type="number" min="40" max="100" value={inv.retireAge} onChange={(e) => setInvest({ retireAge: e.target.value === "" ? "" : Number(e.target.value) })} style={inputStyle} />
            </Field>
            <Field label="Planned retirement spending per month (0 = use your current spending pace)">
              <input className="mg-num" type="number" min="0" step="50" value={inv.retireSpend ?? 0} onChange={(e) => setInvest({ retireSpend: e.target.value === "" ? "" : Number(e.target.value) })} style={inputStyle} />
              <span style={{ fontSize: 11.5, fontWeight: 500, color: C.inkSoft, lineHeight: 1.45 }}>
                Use today's dollars — inflation is already handled if your expected return is a real (after-inflation) figure like 7%. Inflating this number yourself would double-count it.
              </span>
            </Field>
            <Field label="Monthly investing — the watering can">
              <input className="mg-num" type="number" min="0" value={inv.monthly} onChange={(e) => setInvest({ monthly: e.target.value === "" ? "" : Number(e.target.value) })} style={inputStyle} />
            </Field>
            <Field label="Expected annual return % (7% ≈ long-run stock average after inflation)">
              <input className="mg-num" type="number" min="0" max="15" step="0.5" value={inv.ret} onChange={(e) => setInvest({ ret: e.target.value === "" ? "" : Number(e.target.value) })} style={inputStyle} />
            </Field>
            <Field label="Withdrawal rate % (4% is the classic rule; 3–3.5% is more cautious)">
              <input className="mg-num" type="number" min="2" max="10" step="0.5" value={inv.wr} onChange={(e) => setInvest({ wr: e.target.value === "" ? "" : Number(e.target.value) })} style={inputStyle} />
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

/* ============================================================
   ADVICE — a rule-based gardener with real financial sense
   ============================================================ */
function Advice({ state, d }) {
  const tips = useMemo(() => {
    const out = [];
    const push = (priority, icon, title, body) => out.push({ priority, icon, title, body });

    // 1. Emergency fund
    if (!d.emergency) {
      push(1, "🛟", "Plant an emergency fund first",
        `Before anything else, most advisors suggest building a cushion of 3–6 months of essential expenses. Based on your pace, that's roughly ${fmt(d.spent > 0 ? (d.spent / d.monthFrac) * 3 : d.totalBudget * 3)}–${fmt(d.spent > 0 ? (d.spent / d.monthFrac) * 6 : d.totalBudget * 6)}. Plant a goal in the Garden tab and tick the emergency-fund box.`);
    } else if (d.emergencyMonths < 3) {
      push(1, "🛟", `Emergency fund covers about ${d.emergencyMonths.toFixed(1)} months`,
        `The common target is 3–6 months of expenses. You're ${fmt(Math.max(0, (d.spent / Math.max(d.monthFrac, 0.05)) * 3 - d.emergency.saved))} away from the 3-month mark — even ${fmt(50)} a paycheck steadily waters it.`);
    } else {
      push(3, "🛟", "Your emergency fund is healthy",
        `It covers roughly ${d.emergencyMonths.toFixed(1)} months of expenses — inside the 3–6 month range many planners recommend. Extra cash beyond 6 months could work harder toward other goals.`);
    }

    // 2. Savings rate
    if (d.income > 0) {
      const rate = Math.round(d.savingsRate * 100);
      if (rate < 10) {
        push(1, "💧", `Savings rate is ${rate}% so far this month`,
          `A common rule of thumb is to send 20% of income to savings — about ${fmt(d.income * 0.2)} on your income. Automating a transfer on payday ("pay yourself first") makes it happen before spending can crowd it out.`);
      } else if (rate < 20) {
        push(2, "💧", `Saving ${rate}% — solid, with room to grow`,
          `You're on your way to the 20% benchmark (${fmt(d.income * 0.2)}/month for you). Nudging it up 1–2% each month is painless and compounds nicely.`);
      } else {
        push(3, "🌟", `Saving ${rate}% of income — excellent`,
          `You're at or above the classic 20% mark. If your emergency fund is full, consider whether long-term buckets like retirement accounts are getting their share.`);
      }
    } else {
      push(2, "💵", "Set your monthly income",
        "Add your income on the Overview tab (or log a paycheck) so the advisor can judge savings rate and spending pace properly.");
    }

    // 3. Budget overruns
    for (const c of d.overruns) {
      const over = d.byCat[c.id] - (state.budgets[c.id] || 0);
      push(1, "✂️", `${c.emoji} ${c.label} is over budget by ${fmt(over)}`,
        c.kind === "want"
          ? `This is a "want" plot, so it's the easiest place to prune. A soft cap trick: move next month's ${c.label.toLowerCase()} money to a separate pot and spend only from there.`
          : `This is a "need," so instead of cutting cold, look for structural savings — renegotiating, switching providers, or adjusting the budget to reality if it was set too low.`);
    }

    // 4. 50/30/20 shape
    if (d.income > 0 && d.spent > 0) {
      const needsPct = Math.round((d.needs / d.income) * 100);
      const wantsPct = Math.round((d.wants / d.income) * 100);
      if (needsPct > 50) {
        push(2, "⚖️", `Needs are eating ${needsPct}% of income`,
          `The 50/30/20 guideline suggests keeping essentials near 50%. When needs run high, the biggest levers are usually housing and transport — small percentage wins there beat clipping coupons.`);
      } else if (wantsPct > 30) {
        push(2, "⚖️", `Wants are at ${wantsPct}% of income`,
          `The 50/30/20 guideline pegs fun money around 30%. No need to go joyless — pick the one or two wants that genuinely delight you and trim the ones you barely notice (subscriptions are the classic weed).`);
      } else {
        push(3, "⚖️", "Your 50/30/20 shape looks balanced",
          `Needs ~${needsPct}%, wants ~${wantsPct}% of income. That's a healthy shape — keep the ratio steady as income grows and the surplus becomes wealth.`);
      }
    }

    // 5. Subscriptions check
    const subsSpent = d.byCat["subs"] || 0;
    if (subsSpent > 0 && d.income > 0 && subsSpent / d.income > 0.03) {
      push(2, "📺", "Subscription audit time",
        `Subscriptions are ${fmt(subsSpent)} this month. A twice-a-year audit — cancel anything you haven't opened in 30 days — is one of the highest-return chores in personal finance.`);
    }

    // 6. Goal pacing
    for (const g of state.goals) {
      if (g.saved >= g.target) continue;
      const remaining = g.target - g.saved;
      const sixMonthPace = remaining / 6;
      if (!g.isEmergency) {
        push(3, "🌷", `"${g.name}" needs ${fmt(remaining)} more`,
          `Watering it ${fmt(sixMonthPace)}/month gets it blooming in about six months. Tie the transfer to payday so the plant never goes thirsty.`);
      }
    }

    // 7. Pace warning
    const paceRatio = d.totalBudget > 0 ? d.spent / (d.totalBudget * Math.max(d.monthFrac, 0.05)) : 0;
    if (paceRatio > 1.15 && d.monthFrac > 0.2) {
      push(1, "🌧️", "Spending is running ahead of the calendar",
        `You've used about ${Math.round((d.spent / d.totalBudget) * 100)}% of the month's budget with ${Math.round((1 - d.monthFrac) * 100)}% of the month left. A useful reset: a 48-hour pause on non-essential purchases usually lets the urge pass.`);
    } else if (paceRatio > 0 && paceRatio < 0.85 && d.monthFrac > 0.4) {
      push(3, "☀️", "You're under pace — nicely done",
        `Spending is tracking below the even-pace line. If the surplus survives to month-end, sweep it into a goal instead of letting it evaporate — surpluses that aren't assigned tend to wander off.`);
    }

    // 8. Streak habit
    if (state.streak.count >= 3) {
      push(3, "🔥", `${state.streak.count}-day logging streak`,
        "Awareness is half the battle in budgeting — people who track spending consistently tend to spend more intentionally. Keep the streak alive.");
    }

    // 9. The orchard — investing & the long game
    const f = d.fire;
    if (f) {
      if (f.portfolio === 0 && (d.savingsRate >= 0.1 || d.left > 200)) {
        push(2, "🌰", "Nothing is planted in the orchard yet",
          `Money that sits as cash slowly loses ground to inflation. Broad, low-cost index funds have historically averaged around 7% a year after inflation over long stretches — even ${fmt(200)}/month at that rate compounds to roughly ${fmt(240000)} in 30 years. Once the emergency fund is healthy, the orchard is where surplus grows best.`);
      }
      if (f.portfolio > 0 && f.monthly === 0) {
        push(2, "💧", "The orchard has no irrigation",
          `You've planted ${fmt(f.portfolio)}, but no monthly contribution is set (Orchard tab → watering can). An automatic monthly investment — dollar-cost averaging — removes emotion and timing guesswork, and is the single most reliable habit in long-term investing.`);
      }
      if (f.fireNumber > 0 && f.portfolio > 0) {
        const pct = Math.round(f.progress * 100);
        if (f.progress >= 1) {
          push(3, "🍎", "The tree can feed you now",
            `Your portfolio has reached your freedom number (${fmt(f.fireNumber)}). By the 4% rule of thumb, work is now optional. Many planners suggest a more cautious 3–3.5% withdrawal rate before actually leaning on it — a little frost protection.`);
        } else if (f.yearsToFI !== null && f.yearsToFI <= 50) {
          const winEarly = f.age + (f.yearsToFIEarly ?? f.yearsToFI);
          const winLate = f.yearsToFILate !== null ? f.age + f.yearsToFILate : null;
          push(3, "🌳", `The freedom tree is ${pct}% grown`,
            `At ${fmt(f.monthly)}/month and ${f.ret}% growth, financial independence lands around age ${f.age + f.yearsToFI}${winLate !== null ? ` — call it a window of age ${winEarly}–${winLate} once bumpier markets (${f.retLo}–${f.retHi}%) are allowed for` : ""}. Worth knowing: raising your savings rate narrows and advances that window more reliably than chasing higher returns.`);
        }
      }
      if (f.coastReached && f.progress < 1) {
        push(3, "🍒", "Coast FIRE reached — the tree fruits on its own",
          `Today's ${fmt(f.portfolio)} would compound to your freedom number by age ${f.retireAge} even with no further contributions. Everything you add from here buys an earlier harvest, not just an eventual one.`);
      }
      if (d.income > 0 && d.savingsRate >= 0.3 && f.fireNumber > 0) {
        const sr = Math.round(d.savingsRate * 100);
        push(3, "🧮", "The shockingly simple math of early retirement",
          `At a ${sr}% savings rate, the classic FIRE arithmetic puts financial independence roughly ${sr >= 40 ? "20" : "28"} years from a standing start — regardless of income level. Each 5% added to the rate prunes years off the wait.`);
      }
    }

    // 10. Vines & trellis — recurring commitments
    const cm = d.commit;
    if (cm && cm.active.length > 0) {
      cm.active.filter((c) => c.kind === "sub" && c.cadence === "annual").forEach((c) => {
        const days = daysUntil(nextDueDate(c));
        if (days <= 30) {
          push(1, "🌿", `"${c.name}" renews in ${days} day${days === 1 ? "" : "s"}`,
            `An annual charge of ${fmt(c.amount)} lands around ${shortDate(nextDueDate(c))}. Annual renewals are where forgotten subscriptions bite hardest — decide now whether it earned its keep, while cancelling is still free.`);
        }
      });
      const subsBudget = state.budgets.subs || 0;
      if (subsBudget > 0 && cm.subsMonthly > subsBudget) {
        push(2, "🌿", "Your vines outgrow their plot",
          `Tracked subscriptions total ${fmt(cm.subsMonthly)}/month, but the Subscriptions budget is ${fmt(subsBudget)}. Either prune a vine or widen the plot — a budget that's set below known commitments will read as "overgrown" every single month.`);
      }
      if (d.income > 0 && cm.subsMonthly / d.income > 0.06) {
        const biggest = cm.active.filter((c) => c.kind === "sub").sort((a, b) => (b.cadence === "annual" ? b.amount / 12 : b.amount) - (a.cadence === "annual" ? a.amount / 12 : a.amount))[0];
        push(2, "✂️", "The vines are drinking deeply",
          `Subscriptions draw ${fmt(cm.subsMonthly)}/month — about ${Math.round((cm.subsMonthly / d.income) * 100)}% of income (${fmt(cm.subsMonthly * 12)}/year). The classic test: if you haven't used one in 30 days, cut it${biggest ? ` — "${biggest.name}" is the thickest vine` : ""}. You can always resubscribe; most people don't miss them.`);
      }
      const nearDone = cm.active.filter((c) => c.kind === "inst" && (c.totalPayments - (c.paidCount || 0)) <= 2);
      nearDone.forEach((c) => {
        const left = c.totalPayments - (c.paidCount || 0);
        push(3, "🪜", `"${c.name}" is almost off the trellis`,
          `Only ${left} payment${left === 1 ? "" : "s"} of ${fmt(c.amount)} left. When it clears, that's ${fmt(c.amount)}/month freed up — a lovely moment to redirect it straight into the orchard before lifestyle absorbs it.`);
      });
    }

    return out.sort((a, b) => a.priority - b.priority);
  }, [state, d]);

  const prioStyle = { 1: { bg: "#FBEAE5", label: "Do first", color: C.tomato }, 2: { bg: "#FBF3DC", label: "Worth doing", color: "#9A7418" }, 3: { bg: "#E9F4EC", label: "Going well", color: C.leafDark } };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>The gardener's notes 🪴</CardTitle>
        <p style={{ margin: 0, fontSize: 13.5, color: C.inkSoft }}>
          Plain-spoken guidance generated from your actual numbers — classic rules of thumb (emergency fund, 20% savings, 50/30/20, the 4% rule) applied to this month and the long game. General education, not personalized financial advice.
        </p>
      </section>
      {tips.map((t, i) => {
        const p = prioStyle[t.priority];
        return (
          <section key={i} className="mg-card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "flex-start", animation: `mg-pop .3s ease ${i * 0.05}s both` }}>
            <div style={{ fontSize: 26, lineHeight: 1 }}>{t.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, margin: 0 }}>{t.title}</h3>
                <span style={{ fontSize: 11, fontWeight: 700, background: p.bg, color: p.color, padding: "3px 10px", borderRadius: 999 }}>{p.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}>{t.body}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
