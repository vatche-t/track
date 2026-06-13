// Deterministic plain-language copy + insight engine.
// Powers chart takeaway sentences AND the proactive alert cards with number-citing,
// non-judgmental coaching copy — no AI dependency, so it always works. AI is an
// optional enrichment layered on top elsewhere.

const amd = (n) => `${Math.round(+n || 0).toLocaleString()} AMD`;

// One plain-language sentence per chart. `kind` selects the template; `d` is a
// small data bag with already-computed numbers.
export function chartTakeaway(kind, d = {}) {
  switch (kind) {
    case "forecast": {
      const { projectedTotal = 0, spendingCap = 0, onTrack = true } = d;
      if (spendingCap <= 0) return "Set a spending cap to see whether you're on pace.";
      if (onTrack) {
        return `On track — you're projected to spend ${amd(projectedTotal)} of your ${amd(spendingCap)} cap.`;
      }
      const overPct = Math.round(((projectedTotal - spendingCap) / spendingCap) * 100);
      return `Heads up — at this pace you'd spend ${amd(projectedTotal)} vs your ${amd(spendingCap)} cap, about ${overPct}% over.`;
    }
    case "trend": {
      const { thisMonth = 0, lastMonth = 0, hasHistory = false } = d;
      if (!hasHistory || lastMonth <= 0) {
        return "Keep logging — next month this shows how your spending is trending.";
      }
      const diff = thisMonth - lastMonth;
      const pct = Math.round((Math.abs(diff) / lastMonth) * 100);
      if (pct < 5) return "Your spending is steady versus last month.";
      return diff > 0
        ? `You're spending about ${pct}% more than last month so far.`
        : `Nice — you're spending about ${pct}% less than last month.`;
    }
    case "category": {
      const { topName, topValue = 0, total = 0 } = d;
      if (!topName || total <= 0) return "No spending logged yet this month.";
      const share = Math.round((topValue / total) * 100);
      return `${topName} is your biggest category — ${share}% of spending (${amd(topValue)}).`;
    }
    case "variance": {
      const { overCount = 0, total = 0 } = d;
      if (total <= 0) return "Set plan amounts to compare against your actual spending.";
      if (overCount === 0) return "You're within plan on every category. 👍";
      return overCount === 1
        ? "You're within plan except for one category."
        : `You're over plan on ${overCount} categories.`;
    }
    default:
      return "";
  }
}

// Prioritized, severity-tiered insight cards. Each cites numbers + the driver and
// offers a supportive, non-judgmental read. Returns newest/most-urgent first.
export function buildInsights({ totals = {}, fc = {}, spendingCap = 0, categories = [], dayOfMonth } = {}) {
  const out = [];
  const dom = dayOfMonth || new Date().getDate();

  // HIGH — projected over the cap.
  if (spendingCap > 0 && !fc.onTrack) {
    const overPct = Math.round(((fc.projectedTotal - spendingCap) / spendingCap) * 100);
    out.push({
      id: "over-pace",
      severity: "high",
      title: "You're on pace to go over your cap",
      body: `At your current rate you'd spend ${amd(fc.projectedTotal)} this month — about ${overPct}% over your ${amd(spendingCap)} cap. Easing off about ${amd(fc.safeToday)}/day keeps you on track.`,
      action: "Open the split",
    });
  }

  // HIGH — net negative this month.
  if ((totals.net || 0) < 0) {
    out.push({
      id: "net-negative",
      severity: "high",
      title: "You've spent more than you received",
      body: `This month you received ${amd(totals.income)} and spent ${amd(totals.spent)} — that's ${amd(Math.abs(totals.net))} in the red. Worth a look at the biggest expenses.`,
    });
  }

  // MED — a single category dominates spend (concentration / likely anomaly).
  const total = categories.reduce((s, c) => s + (c.value || 0), 0);
  const top = categories[0];
  if (top && total > 0) {
    const share = Math.round((top.value / total) * 100);
    if (share >= 40) {
      out.push({
        id: `cat-${top.name}`,
        severity: "med",
        title: `${top.name} is eating most of your spending`,
        body: `${top.name} is ${share}% of everything you've spent this month (${amd(top.value)}). If that's a one-off, the rest looks normal.`,
      });
    }
  }

  // MED — approaching the cap while still technically on track.
  if (spendingCap > 0 && fc.onTrack && (totals.spent || 0) / spendingCap >= 0.9) {
    out.push({
      id: "near-cap",
      severity: "med",
      title: "You're close to your spending cap",
      body: `You've used ${amd(totals.spent)} of your ${amd(spendingCap)} cap. About ${amd(fc.safeToday)}/day keeps you under for the rest of the month.`,
    });
  }

  // LOW — new month greeting (first 3 days).
  if (dom <= 3) {
    out.push({
      id: "new-month",
      severity: "low",
      title: "Fresh month",
      body: `New month underway. You received ${amd(totals.income)} so far — open your split to put it to work.`,
      action: "Open the split",
    });
  }

  // LOW — everything looks good.
  if (!out.length && spendingCap > 0 && fc.onTrack && (totals.net || 0) >= 0) {
    out.push({
      id: "all-good",
      severity: "low",
      title: "You're in good shape",
      body: `On track against your ${amd(spendingCap)} cap and ${amd(totals.net)} ahead this month. Keep it up.`,
    });
  }

  const rank = { high: 0, med: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
