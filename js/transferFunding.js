'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   TRANSFER FUNDING
   Loaded after cutoffPlan.js and transferPlanner.js, and calls both. Pure: no
   global state, no save, no DOM. Decides what each Cutoff's Transfers fund:
   a Subitem whose Bank assignment is a registered Bank adds the Cutoff Plan's
   amountIn for that Cutoff to that Bank's need, and the Transfer planner turns
   each Cutoff's needs into steps. Cash, a deleted Bank or no Bank assignment
   contribute nothing; a need on the Salary source is ignored by the planner.
   The Salary source is an input — this module never chooses it (see
   docs/adr/0004-*). An unassigned Subitem funds neither Cutoff (docs/adr/0006-*);
   when its Bank assignment is a registered Bank other than the Salary source it
   is an Unfunded Subitem and comes back in `unfunded`, whatever its amount.
   See CONTEXT.md (Transfer).
═══════════════════════════════════════════════════════════════════════════ */

const TransferFunding = {
  fund({ banks, fees, sourceId, subitems, cutoffPlan, bankAssign }) {
    const isBank = id => banks.some(b => b.id === id);
    const stepsFor = cutoff => {
      const needs = {};
      banks.forEach(b => { needs[b.id] = 0; });
      subitems.forEach(subitem => {
        const bankId = bankAssign[subitem.id];
        if (!isBank(bankId)) return;
        needs[bankId] += CutoffPlan.amountIn(cutoffPlan, subitem, cutoff);
      });
      return TransferPlanner.plan({ banks, fees, sourceId, needs });
    };

    return {
      cutoff1: stepsFor('cutoff1'),
      cutoff2: stepsFor('cutoff2'),
      unfunded: CutoffPlan.unassigned(cutoffPlan, subitems).filter(subitem => {
        const bankId = bankAssign[subitem.id];
        return bankId !== sourceId && isBank(bankId);
      }),
    };
  },
};
