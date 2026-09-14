'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   CUTOFF PLAN
   Loaded before state.js. Pure: no global state, no save, no DOM. Every
   function takes the Cutoff Plan (`{ assignments, forced }`, the stored
   bb_biweekly shape) first. Mutators edit that object in place and never
   reassign it wholesale, which keeps the Profile cache references in
   js/state.js intact. See CONTEXT.md (Cutoff Plan) and docs/adr/0005-*.
═══════════════════════════════════════════════════════════════════════════ */

/* The packing rules behind CutoffPlan.autoSuggest: Force Assigned Subitems keep
   their placement verbatim and seed their cutoff's running total, so free
   Subitems flow toward whichever side actually has room. They are honoured
   even when they overrun Half Pay — nothing is clamped or dropped. Free
   Subitems are never placed in Both; Both is a choice only a person makes, and
   Force Assign is what carries it through a press. See
   docs/specs/0001-force-assign.md and docs/adr/0005-*. */
function cutoffPlanBalance(subitems, assignments, forced) {
  const asgn = {};
  let t1 = 0, t2 = 0;
  const free = [];
  for (const it of subitems) {
    const a = assignments[it.id];
    if (forced[it.id] && a) {
      asgn[it.id] = a;
      if      (a === 'both')    { t1 += Number(it.amount) / 2; t2 += Number(it.amount) / 2; }
      else if (a === 'cutoff1')   t1 += Number(it.amount);
      else                        t2 += Number(it.amount);
    } else free.push(it);
  }
  // Copied before sorting — the caller's subitems array is not ours to reorder.
  for (const it of [...free].sort((a, b) => Number(b.amount) - Number(a.amount))) {
    if (t1 <= t2) { asgn[it.id] = 'cutoff1'; t1 += Number(it.amount); }
    else          { asgn[it.id] = 'cutoff2'; t2 += Number(it.amount); }
  }
  return asgn;
}

const CutoffPlan = {
  normalise(plan) {
    if (!plan.forced) plan.forced = {};
  },

  amountIn(plan, subitem, cutoff) {
    const a = plan.assignments[subitem.id];
    const amount = Number(subitem.amount) || 0;
    if (a === 'both') return amount / 2;
    if (a === cutoff) return amount;
    return 0;
  },

  itemsIn(plan, subitems, cutoff) {
    return subitems.filter(it => {
      const a = plan.assignments[it.id];
      return a === cutoff || a === 'both';
    });
  },

  totals(plan, subitems) {
    const sumFor = cutoff => CutoffPlan.itemsIn(plan, subitems, cutoff)
      .reduce((s, it) => s + CutoffPlan.amountIn(plan, it, cutoff), 0);
    return { cutoff1: sumFor('cutoff1'), cutoff2: sumFor('cutoff2') };
  },

  unassigned(plan, subitems) {
    return subitems.filter(it => !plan.assignments[it.id]);
  },

  assign(plan, subitemId, cutoff) {
    // Force Assign is keyed separately by id, so pointing an existing id at a
    // new cutoff leaves any Force Assign on it untouched.
    plan.assignments[subitemId] = cutoff;
  },

  unassign(plan, subitemId) {
    delete plan.assignments[subitemId];
    delete plan.forced[subitemId];
  },

  setForced(plan, subitemId, on) {
    if (on) {
      if (!plan.assignments[subitemId]) return false;
      plan.forced[subitemId] = true;
      return true;
    }
    // Only ids present in the map are Force Assigned — unticking deletes rather
    // than storing false, so the saved plan never accumulates dead entries.
    delete plan.forced[subitemId];
    return true;
  },

  forget(plan, subitemId) {
    delete plan.assignments[subitemId];
    delete plan.forced[subitemId];
  },

  autoSuggest(plan, subitems) {
    plan.assignments = cutoffPlanBalance(subitems, plan.assignments, plan.forced);
  },
};
