'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('../test-helpers/loadScript');

function freshPlan() {
  return { assignments: {}, forced: {} };
}

test('cutoffPlan', async (t) => {
  const { CutoffPlan } = loadScripts(['js/cutoffPlan.js'], ['CutoffPlan']);

  await t.test('amountIn: full amount for the subitem\'s own cutoff', () => {
    const plan = freshPlan();
    plan.assignments.a = 'cutoff1';
    assert.equal(CutoffPlan.amountIn(plan, { id: 'a', amount: 100 }, 'cutoff1'), 100);
  });

  await t.test('amountIn: 0 for the other cutoff', () => {
    const plan = freshPlan();
    plan.assignments.a = 'cutoff1';
    assert.equal(CutoffPlan.amountIn(plan, { id: 'a', amount: 100 }, 'cutoff2'), 0);
  });

  await t.test('amountIn: half for Both, in each cutoff', () => {
    const plan = freshPlan();
    plan.assignments.a = 'both';
    assert.equal(CutoffPlan.amountIn(plan, { id: 'a', amount: 100 }, 'cutoff1'), 50);
    assert.equal(CutoffPlan.amountIn(plan, { id: 'a', amount: 100 }, 'cutoff2'), 50);
  });

  await t.test('amountIn: 0 when unassigned', () => {
    const plan = freshPlan();
    assert.equal(CutoffPlan.amountIn(plan, { id: 'a', amount: 100 }, 'cutoff1'), 0);
  });

  await t.test('amountIn: a missing amount counts as 0', () => {
    const plan = freshPlan();
    plan.assignments.a = 'cutoff1';
    assert.equal(CutoffPlan.amountIn(plan, { id: 'a' }, 'cutoff1'), 0);
  });

  await t.test('itemsIn: a cutoff\'s own subitems plus Both', () => {
    const plan = freshPlan();
    plan.assignments = { a: 'cutoff1', b: 'both', c: 'cutoff2' };
    const subitems = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(CutoffPlan.itemsIn(plan, subitems, 'cutoff1').map(i => i.id), ['a', 'b']);
  });

  await t.test('totals: cutoff1 and cutoff2 sums, Both counted as half in each', () => {
    const plan = freshPlan();
    plan.assignments = { a: 'cutoff1', b: 'both', c: 'cutoff2' };
    const subitems = [
      { id: 'a', amount: 100 },
      { id: 'b', amount: 40 },
      { id: 'c', amount: 30 },
    ];
    const totals = CutoffPlan.totals(plan, subitems);
    assert.equal(totals.cutoff1, 120);
    assert.equal(totals.cutoff2, 50);
  });

  await t.test('unassigned: subitems with no cutoff', () => {
    const plan = freshPlan();
    plan.assignments = { a: 'cutoff1' };
    const subitems = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(CutoffPlan.unassigned(plan, subitems).map(i => i.id), ['b']);
  });

  await t.test('assign: keeps an existing Force Assign', () => {
    const plan = freshPlan();
    plan.assignments.a = 'cutoff1';
    plan.forced.a = true;
    CutoffPlan.assign(plan, 'a', 'cutoff2');
    assert.equal(plan.assignments.a, 'cutoff2');
    assert.equal(plan.forced.a, true);
  });

  await t.test('unassign: releases the Force Assign', () => {
    const plan = freshPlan();
    plan.assignments.a = 'cutoff1';
    plan.forced.a = true;
    CutoffPlan.unassign(plan, 'a');
    assert.equal(plan.assignments.a, undefined);
    assert.equal(plan.forced.a, undefined);
  });

  await t.test('setForced: turning it on for an unassigned subitem does nothing and returns false', () => {
    const plan = freshPlan();
    const result = CutoffPlan.setForced(plan, 'a', true);
    assert.equal(result, false);
    assert.equal(plan.forced.a, undefined);
  });

  await t.test('setForced: turning it on for an assigned subitem sets it', () => {
    const plan = freshPlan();
    plan.assignments.a = 'cutoff1';
    const result = CutoffPlan.setForced(plan, 'a', true);
    assert.equal(result, true);
    assert.equal(plan.forced.a, true);
  });

  await t.test('setForced: unticking deletes the id rather than storing false', () => {
    const plan = freshPlan();
    plan.assignments.a = 'cutoff1';
    plan.forced.a = true;
    CutoffPlan.setForced(plan, 'a', false);
    assert.equal('a' in plan.forced, false);
  });

  await t.test('forget: removes the subitem from assignments and forced', () => {
    const plan = freshPlan();
    plan.assignments.a = 'cutoff1';
    plan.forced.a = true;
    CutoffPlan.forget(plan, 'a');
    assert.equal('a' in plan.assignments, false);
    assert.equal('a' in plan.forced, false);
  });

  await t.test('normalise: gives a plan without a forced map an empty one', () => {
    const plan = { assignments: {} };
    CutoffPlan.normalise(plan);
    assert.ok(plan.forced);
    assert.deepEqual(Object.keys(plan.forced), []);
  });

  await t.test('normalise: leaves an existing forced map untouched', () => {
    const forced = { a: true };
    const plan = { assignments: {}, forced };
    CutoffPlan.normalise(plan);
    assert.equal(plan.forced, forced);
  });

  await t.test('autoSuggest: keeps Force Assigned subitems verbatim, including Both and over Half Pay', () => {
    const plan = freshPlan();
    plan.assignments = { forced1: 'both' };
    plan.forced = { forced1: true };
    const subitems = [
      { id: 'forced1', amount: 1000 },
      { id: 'free1', amount: 10 },
    ];
    CutoffPlan.autoSuggest(plan, subitems);
    assert.equal(plan.assignments.forced1, 'both');
    assert.notEqual(plan.assignments.free1, 'both');
  });

  await t.test('autoSuggest: balances the free subitems largest-first', () => {
    const plan = freshPlan();
    const subitems = [
      { id: 'a', amount: 10 },
      { id: 'b', amount: 50 },
      { id: 'c', amount: 30 },
    ];
    CutoffPlan.autoSuggest(plan, subitems);
    // Largest first: b(50)->c1 (t1=50,t2=0), c(30)->c2 (t1=50,t2=30), a(10)->c2 (t1 still ahead).
    assert.equal(plan.assignments.b, 'cutoff1');
    assert.equal(plan.assignments.c, 'cutoff2');
    assert.equal(plan.assignments.a, 'cutoff2');
  });

  await t.test('autoSuggest: never places a free subitem in Both', () => {
    const plan = freshPlan();
    const subitems = [{ id: 'a', amount: 10 }, { id: 'b', amount: 20 }];
    CutoffPlan.autoSuggest(plan, subitems);
    for (const id of Object.keys(plan.assignments)) {
      assert.notEqual(plan.assignments[id], 'both');
    }
  });

  await t.test('autoSuggest: does not reorder the caller\'s subitems array', () => {
    const plan = freshPlan();
    const subitems = [
      { id: 'a', amount: 10 },
      { id: 'b', amount: 50 },
      { id: 'c', amount: 30 },
    ];
    const before = subitems.map(i => i.id);
    CutoffPlan.autoSuggest(plan, subitems);
    assert.deepEqual(subitems.map(i => i.id), before);
  });

  await t.test('autoSuggest: replaces the plan\'s assignments in place', () => {
    const plan = freshPlan();
    const originalAssignments = plan.assignments;
    originalAssignments.stale = 'cutoff1';
    const subitems = [{ id: 'a', amount: 10 }];
    CutoffPlan.autoSuggest(plan, subitems);
    assert.equal(plan.assignments.stale, undefined);
    assert.equal(plan.assignments.a, 'cutoff1');
  });
});
