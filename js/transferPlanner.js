'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   TRANSFER PLANNER
   Pure: no global state, no save, no DOM. Knows nothing about Subitems or
   Cutoffs — it is handed Banks, Fees, a Salary source id and the amount each
   Bank needs, and returns Transfer steps as Bank ids, amounts, Fees and
   `carries`: the Banks whose need the step's money is for, each with exactly
   the need routed through that step, the step's `to` Bank first and then
   `banks` order. See CONTEXT.md (Salary source, Transfer breakdown) and
   CLAUDE.md.
═══════════════════════════════════════════════════════════════════════════ */

function transferFeeKey(fromId, toId) {
  return `${fromId}_${toId}`;
}

const TransferPlanner = {
  plan({ banks, fees, sourceId, needs }) {
    const bankById = id => banks.find(b => b.id === id);

    // Infinity stands in for "no route" while comparing candidate paths, and
    // is converted to the public `fee: null` only once a step is finalised.
    const feeOrInfinity = (fromId, toId) => {
      const f = fees[transferFeeKey(fromId, toId)];
      if (!f) return Infinity;
      const fromBank = bankById(fromId);
      if (fromBank && Number(fromBank.freeLimit) > 0) return 0;
      return Number(f.fee) || 0;
    };

    const raw = [];
    banks.forEach(dest => {
      if (dest.id === sourceId) return;
      const amount = needs[dest.id];
      if (!amount) return;

      const direct = feeOrInfinity(sourceId, dest.id);
      let bestHub = null, bestHubFee = Infinity;
      banks.forEach(hub => {
        if (hub.id === sourceId || hub.id === dest.id) return;
        const hf = feeOrInfinity(sourceId, hub.id) + feeOrInfinity(hub.id, dest.id);
        if (hf < bestHubFee) { bestHubFee = hf; bestHub = hub; }
      });

      if (bestHub && bestHubFee < direct) {
        raw.push({ fromId: sourceId, toId: bestHub.id, amount, fee: feeOrInfinity(sourceId, bestHub.id), carries: [{ bankId: dest.id, amount }] });
        raw.push({ fromId: bestHub.id, toId: dest.id, amount, fee: feeOrInfinity(bestHub.id, dest.id), carries: [{ bankId: dest.id, amount }] });
      } else {
        raw.push({ fromId: sourceId, toId: dest.id, amount, fee: direct, carries: [{ bankId: dest.id, amount }] });
      }
    });

    // Consolidate steps that share the same fromId→toId into one transaction.
    // Each Bank's need takes exactly one path, so no Bank is carried twice by
    // the steps being merged — their carries simply concatenate.
    const mergeMap = new Map();
    raw.forEach(step => {
      const key = transferFeeKey(step.fromId, step.toId);
      if (!mergeMap.has(key)) {
        mergeMap.set(key, { ...step, carries: [...step.carries] });
        return;
      }
      const m = mergeMap.get(key);
      m.amount += step.amount;
      m.carries.push(...step.carries);
    });

    const bankOrder = id => banks.findIndex(b => b.id === id);
    const merged = Array.from(mergeMap.values());
    merged.forEach(st => {
      if (st.fee === Infinity) st.fee = null;
      // The step's own `to` Bank first, then Banks-tab order.
      st.carries.sort((a, b) =>
        (b.bankId === st.toId) - (a.bankId === st.toId) || bankOrder(a.bankId) - bankOrder(b.bankId));
      // Re-add in carries order so the step amount is exactly their sum, even
      // for fractional (halved) amounts where float addition is order-sensitive.
      st.amount = st.carries.reduce((s, c) => s + c.amount, 0);
    });
    merged.sort((a, b) => {
      if (a.fee === null && b.fee === null) return 0;
      if (a.fee === null) return 1;
      if (b.fee === null) return -1;
      return a.fee - b.fee;
    });
    return merged;
  },
};
