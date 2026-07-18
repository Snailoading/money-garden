/*
 * The gardener's notes — the rules-based advice engine.
 * Ported verbatim from the reference Advice component's tips useMemo
 * (lines 1374–1530), copy included. Pure — no React, no DOM.
 *
 * Rules are evaluated in source order and then sorted by priority:
 * 1 = "Do first", 2 = "Worth doing", 3 = "Going well". Advice is computed
 * only from the user's real data and is general education, not personalized
 * financial advice — the UI must keep that disclaimer wherever tips render.
 */

import type { State } from "./types";
import type { Derived } from "./stats";
import { fmt, shortDate } from "./format";
import { daysUntil, nextDueWithPayments } from "./commitments";

export type Priority = 1 | 2 | 3;

export interface Tip {
  priority: Priority;
  icon: string;
  title: string;
  body: string;
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: "Do first",
  2: "Worth doing",
  3: "Going well",
};

export function buildAdvice(state: State, d: Derived, now: Date = new Date()): Tip[] {
  const out: Tip[] = [];
  const push = (priority: Priority, icon: string, title: string, body: string) =>
    out.push({ priority, icon, title, body });

  // 1. Emergency fund — sized from d.monthlyExpenses (trailing-average based,
  // see stats.ts), the same estimate behind the coverage figure in the title,
  // so the months shown and the dollar amounts always agree. The barrel
  // always exists since v0.12.0; the !d.emergency guard stays for TS
  // narrowing (and un-migrated states in tests), with target 0 meaning
  // "not set up yet".
  if (!d.emergency || d.emergency.target === 0) {
    push(1, "🛟", "Set up your rain barrel",
      `Before anything else, most advisors suggest a cushion of 3–6 months of essential expenses. Based on your pace, that's roughly ${fmt(d.monthlyExpenses * 3)}–${fmt(d.monthlyExpenses * 6)}. Your rain barrel is waiting in the Garden tab — give it a target.`);
  } else if (d.emergencyMonths < 3) {
    push(1, "🛟", `Emergency fund covers about ${d.emergencyMonths.toFixed(1)} months`,
      `The common target is 3–6 months of expenses. You're ${fmt(Math.max(0, d.monthlyExpenses * 3 - d.emergency.saved))} away from the 3-month mark — even ${fmt(50)} a paycheck steadily waters it.`);
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
    // An un-set-up barrel (target 0) lands in this `continue` too: 0 >= 0.
    if (g.saved >= g.target) continue;
    const remaining = g.target - g.saved;
    const sixMonthPace = remaining / 6;
    if (!g.isEmergency) {
      push(3, "🌷", `"${g.name}" needs ${fmt(remaining)} more`,
        `Watering it ${fmt(sixMonthPace)}/month gets it blooming in about six months. Tie the transfer to payday so the plant never goes thirsty.`);
    }
  }

  // 7. Pace warning — note this paceRatio has a 0.05 monthFrac floor, unlike
  // the health-score one in stats.ts (reference has both variants).
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
      // Payments-aware: once the renewal is logged as paid, stop warning.
      const due = nextDueWithPayments(c, state.transactions, now);
      const days = daysUntil(due, now);
      if (days <= 30) {
        push(1, "🌿", `"${c.name}" renews in ${days} day${days === 1 ? "" : "s"}`,
          `An annual charge of ${fmt(c.amount)} lands around ${shortDate(due)}. Annual renewals are where forgotten subscriptions bite hardest — decide now whether it earned its keep, while cancelling is still free.`);
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
    // ?? NaN mirrors the reference's bare `c.totalPayments`: an installment
    // with no totalPayments gives NaN <= 2 → false, so it never appears here.
    const nearDone = cm.active.filter((c) => c.kind === "inst" && ((c.totalPayments ?? NaN) - (c.paidCount || 0)) <= 2);
    nearDone.forEach((c) => {
      const left = (c.totalPayments ?? NaN) - (c.paidCount || 0);
      push(3, "🪜", `"${c.name}" is almost off the trellis`,
        `Only ${left} payment${left === 1 ? "" : "s"} of ${fmt(c.amount)} left. When it clears, that's ${fmt(c.amount)}/month freed up — a lovely moment to redirect it straight into the orchard before lifestyle absorbs it.`);
    });
  }

  // Stable sort keeps source order within the same priority (like Python's
  // sorted(), Array.prototype.sort is stable in modern JS).
  return out.sort((a, b) => a.priority - b.priority);
}
