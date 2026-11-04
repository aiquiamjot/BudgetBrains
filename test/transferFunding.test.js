'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('../test-helpers/loadScript');

function bank(id, opts = {}) {
  return { id, name: id, type: 'bank', freeLimit: 0, resetPeriod: 'monthly', ...opts };
}

function subitem(id, amount) {
  return { id, name: id, category: 'needs', amount };
}

// Results come back as vm-realm objects, whose prototype differs from this
// realm's Object.prototype — deepEqual's prototype check would fail on
// otherwise-identical plain data, so normalise through JSON first.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('transferFunding', async (t) => {
  // The real Cutoff Plan and Transfer planner, loaded beside the module — no stubs.
  const { TransferFunding } = loadScripts(
    ['js/cutoffPlan.js', 'js/transferPlanner.js', 'js/transferFunding.js'],
    ['TransferFunding'],
  );

  // Salary source 'src', one other Bank 'b' reachable directly for a Fee of 10.
  const banks = [bank('src'), bank('b')];
  const fees = { src_b: { fee: 10 } };
  const fund = (subitems, assignments, bankAssign, overrides = {}) => plain(TransferFunding.fund({
    banks, fees, sourceId: 'src', subitems,
    cutoffPlan: { assignments, forced: {} },
    bankAssign,
    ...overrides,
  }));
  const step = amount => ({ fromId: 'src', toId: 'b', amount, fee: 10 });
  // Each step with `carries` left out (that field is covered by its own tests).
  const withoutCarries = result => ({
    ...result,
    cutoff1: result.cutoff1.map(({ carries, ...rest }) => rest),
    cutoff2: result.cutoff2.map(({ carries, ...rest }) => rest),
  });

  await t.test('a Subitem in Cutoff 1 funds a Transfer only in Cutoff 1', () => {
    const result = withoutCarries(fund([subitem('x', 100)], { x: 'cutoff1' }, { x: 'b' }));
    assert.deepEqual(result, { cutoff1: [step(100)], cutoff2: [], unfunded: [] });
  });

  await t.test('a Subitem in Cutoff 2 funds a Transfer only in Cutoff 2', () => {
    const result = withoutCarries(fund([subitem('x', 100)], { x: 'cutoff2' }, { x: 'b' }));
    assert.deepEqual(result, { cutoff1: [], cutoff2: [step(100)], unfunded: [] });
  });

  await t.test('a Subitem in Both funds half its amount in each Cutoff', () => {
    const result = withoutCarries(fund([subitem('x', 100)], { x: 'both' }, { x: 'b' }));
    assert.deepEqual(result.cutoff1, [step(50)]);
    assert.deepEqual(result.cutoff2, [step(50)]);
  });

  await t.test('an unassigned Subitem funds nothing in either Cutoff', () => {
    const result = fund([subitem('x', 100)], {}, { x: 'b' });
    assert.deepEqual(result.cutoff1, []);
    assert.deepEqual(result.cutoff2, []);
  });

  await t.test('a Subitem assigned to Cash funds nothing', () => {
    const result = fund([subitem('x', 100)], { x: 'cutoff1' }, { x: 'cash' });
    assert.deepEqual(result, { cutoff1: [], cutoff2: [], unfunded: [] });
  });

  await t.test('a Subitem assigned to the Salary source produces no Transfer', () => {
    const result = fund([subitem('x', 100)], { x: 'both' }, { x: 'src' });
    assert.deepEqual(result, { cutoff1: [], cutoff2: [], unfunded: [] });
  });

  await t.test('a Subitem whose Bank was deleted funds nothing', () => {
    const result = fund([subitem('x', 100)], { x: 'cutoff1' }, { x: 'gone' });
    assert.deepEqual(result, { cutoff1: [], cutoff2: [], unfunded: [] });
  });

  await t.test('a Subitem with no Bank assignment funds nothing', () => {
    const result = fund([subitem('x', 100)], { x: 'cutoff1' }, {});
    assert.deepEqual(result, { cutoff1: [], cutoff2: [], unfunded: [] });
  });

  await t.test("several Subitems sum into one Bank's need", () => {
    const result = withoutCarries(fund(
      [subitem('x', 100), subitem('y', 40), subitem('z', 60)],
      { x: 'cutoff1', y: 'cutoff1', z: 'both' },
      { x: 'b', y: 'b', z: 'b' },
    ));
    assert.deepEqual(result.cutoff1, [step(170)]);
    assert.deepEqual(result.cutoff2, [step(30)]);
  });

  await t.test('a Bank with no Route from the Salary source comes through as fee: null', () => {
    const result = withoutCarries(fund([subitem('x', 100)], { x: 'cutoff1' }, { x: 'b' }, { fees: {} }));
    assert.deepEqual(result.cutoff1, [{ fromId: 'src', toId: 'b', amount: 100, fee: null }]);
  });

  await t.test('the Salary source is the one passed in', () => {
    const result = withoutCarries(fund([subitem('x', 100)], { x: 'cutoff1' }, { x: 'src' },
      { sourceId: 'b', fees: { b_src: { fee: 3 } } }));
    assert.deepEqual(result.cutoff1, [{ fromId: 'b', toId: 'src', amount: 100, fee: 3 }]);
  });

  await t.test('an unassigned Subitem in a non-source registered Bank is unfunded', () => {
    const x = subitem('x', 100);
    const result = fund([x], {}, { x: 'b' });
    assert.deepEqual(result.unfunded, [x]);
  });

  await t.test('an unassigned Subitem with Cash, the Salary source, a deleted Bank or no Bank assignment is not unfunded', () => {
    const result = fund(
      [subitem('c', 100), subitem('s', 100), subitem('g', 100), subitem('n', 100)],
      {},
      { c: 'cash', s: 'src', g: 'gone' },
    );
    assert.deepEqual(result.unfunded, []);
  });

  await t.test('an assigned Subitem is not unfunded', () => {
    const result = fund(
      [subitem('x', 100), subitem('y', 100), subitem('z', 100)],
      { x: 'cutoff1', y: 'cutoff2', z: 'both' },
      { x: 'b', y: 'b', z: 'b' },
    );
    assert.deepEqual(result.unfunded, []);
  });

  await t.test('a ₱0 unassigned Subitem is still unfunded', () => {
    const x = subitem('x', 0);
    const result = fund([x], {}, { x: 'b' });
    assert.deepEqual(result.unfunded, [x]);
  });

  await t.test('unfunded keeps Subitem order', () => {
    const z = subitem('z', 10), a = subitem('a', 20), m = subitem('m', 30);
    const result = fund([z, subitem('k', 5), a, m], { k: 'cutoff1' }, { z: 'b', k: 'b', a: 'b', m: 'b' });
    assert.deepEqual(result.unfunded, [z, a, m]);
  });

  await t.test("a step's Transfer breakdown lists each Subitem at its Bank separately, in Subitem order", () => {
    const x = subitem('x', 100), y = subitem('y', 40), z = subitem('z', 60);
    const result = fund([x, y, z], { x: 'cutoff1', y: 'cutoff1', z: 'cutoff1' }, { x: 'b', y: 'b', z: 'b' });
    assert.deepEqual(result.cutoff1[0].carries, [
      { bankId: 'b', amount: 200, subitems: [{ subitem: x, amount: 100 }, { subitem: y, amount: 40 }, { subitem: z, amount: 60 }] },
    ]);
  });

  await t.test('a Both Subitem appears at half its amount in each Cutoff', () => {
    const x = subitem('x', 100), y = subitem('y', 30);
    const result = fund([x, y], { x: 'both', y: 'cutoff2' }, { x: 'b', y: 'b' });
    assert.deepEqual(result.cutoff1[0].carries, [{ bankId: 'b', amount: 50, subitems: [{ subitem: x, amount: 50 }] }]);
    assert.deepEqual(result.cutoff2[0].carries, [
      { bankId: 'b', amount: 80, subitems: [{ subitem: x, amount: 50 }, { subitem: y, amount: 30 }] },
    ]);
  });

  await t.test('a ₱0 or blank-amount Subitem is left out of the Transfer breakdown', () => {
    const x = subitem('x', 100), zero = subitem('zero', 0), blank = subitem('blank', '');
    const result = fund([zero, x, blank], { x: 'cutoff1', zero: 'cutoff1', blank: 'both' }, { x: 'b', zero: 'b', blank: 'b' });
    assert.deepEqual(result.cutoff1[0].carries, [{ bankId: 'b', amount: 100, subitems: [{ subitem: x, amount: 100 }] }]);
  });

  // Salary source 'src'; 'hub' is cheaper to reach directly, and 'b' and 'c'
  // are cheaper through 'hub' than direct. Banks-tab order puts 'c' before
  // 'hub' and 'b' last, so the `to`-first rule and `banks` order both show.
  const hubBanks = [bank('src'), bank('c'), bank('hub'), bank('b')];
  const hubFees = {
    src_b: { fee: 20 }, src_c: { fee: 20 }, src_hub: { fee: 5 },
    hub_b: { fee: 5 }, hub_c: { fee: 5 },
  };
  const fundViaHub = (subitems, assignments, bankAssign) =>
    fund(subitems, assignments, bankAssign, { banks: hubBanks, fees: hubFees });
  const leg = (steps, fromId, toId) => steps.find(s => s.fromId === fromId && s.toId === toId);

  await t.test("the leg into a hub carries the hub's own Subitems first, then the onward Banks' in Banks-tab order", () => {
    const b1 = subitem('b1', 70), h1 = subitem('h1', 10), c1 = subitem('c1', 20), h2 = subitem('h2', 5);
    const result = fundViaHub(
      [b1, h1, c1, h2],
      { b1: 'cutoff1', h1: 'cutoff1', c1: 'cutoff1', h2: 'cutoff1' },
      { b1: 'b', h1: 'hub', c1: 'c', h2: 'hub' },
    );
    const hubLeg = leg(result.cutoff1, 'src', 'hub');
    assert.equal(hubLeg.amount, 105);
    assert.deepEqual(hubLeg.carries, [
      { bankId: 'hub', amount: 15, subitems: [{ subitem: h1, amount: 10 }, { subitem: h2, amount: 5 }] },
      { bankId: 'c', amount: 20, subitems: [{ subitem: c1, amount: 20 }] },
      { bankId: 'b', amount: 70, subitems: [{ subitem: b1, amount: 70 }] },
    ]);
  });

  await t.test("the onward leg out of a hub carries only the onward Bank's Subitems", () => {
    const b1 = subitem('b1', 70), h1 = subitem('h1', 10), c1 = subitem('c1', 20);
    const result = fundViaHub(
      [b1, h1, c1],
      { b1: 'cutoff1', h1: 'cutoff1', c1: 'cutoff1' },
      { b1: 'b', h1: 'hub', c1: 'c' },
    );
    assert.deepEqual(leg(result.cutoff1, 'hub', 'b').carries, [
      { bankId: 'b', amount: 70, subitems: [{ subitem: b1, amount: 70 }] },
    ]);
    assert.deepEqual(leg(result.cutoff1, 'hub', 'c').carries, [
      { bankId: 'c', amount: 20, subitems: [{ subitem: c1, amount: 20 }] },
    ]);
  });

  await t.test('steps sharing a Bank pair merge their carries', () => {
    const b1 = subitem('b1', 70), c1 = subitem('c1', 20), b2 = subitem('b2', 30);
    const result = fundViaHub(
      [b1, c1, b2],
      { b1: 'cutoff1', c1: 'cutoff1', b2: 'cutoff1' },
      { b1: 'b', c1: 'c', b2: 'b' },
    );
    assert.equal(result.cutoff1.filter(s => s.fromId === 'src' && s.toId === 'hub').length, 1);
    assert.deepEqual(leg(result.cutoff1, 'src', 'hub').carries, [
      { bankId: 'c', amount: 20, subitems: [{ subitem: c1, amount: 20 }] },
      { bankId: 'b', amount: 100, subitems: [{ subitem: b1, amount: 70 }, { subitem: b2, amount: 30 }] },
    ]);
  });

  await t.test("a hub's own need routed through a different hub is not on the leg into it", () => {
    // 'b' is cheapest through 'h1', but 'h1' itself is cheapest through 'h2'.
    const banks3 = [bank('src'), bank('h1'), bank('h2'), bank('b')];
    const fees3 = {
      src_b: { fee: 100 }, src_h1: { fee: 20 }, h1_b: { fee: 1 },
      src_h2: { fee: 1 }, h2_h1: { fee: 1 },
    };
    const b1 = subitem('b1', 70), own = subitem('own', 10);
    const result = fund([b1, own], { b1: 'cutoff1', own: 'cutoff1' }, { b1: 'b', own: 'h1' },
      { banks: banks3, fees: fees3 });
    assert.deepEqual(leg(result.cutoff1, 'src', 'h1').carries, [
      { bankId: 'b', amount: 70, subitems: [{ subitem: b1, amount: 70 }] },
    ]);
    assert.deepEqual(leg(result.cutoff1, 'src', 'h2').carries, [
      { bankId: 'h1', amount: 10, subitems: [{ subitem: own, amount: 10 }] },
    ]);
    assert.deepEqual(leg(result.cutoff1, 'h2', 'h1').carries, [
      { bankId: 'h1', amount: 10, subitems: [{ subitem: own, amount: 10 }] },
    ]);
  });

  await t.test('Cash, deleted-Bank, Salary-source and unassigned Subitems are never in any Transfer breakdown', () => {
    const result = fundViaHub(
      [subitem('cash', 10), subitem('gone', 10), subitem('src', 10), subitem('none', 10), subitem('unasg', 10), subitem('ok', 10)],
      { cash: 'both', gone: 'both', src: 'both', none: 'both', ok: 'both' },
      { cash: 'cash', gone: 'deleted', src: 'src', unasg: 'b', ok: 'b' },
    );
    const named = [...result.cutoff1, ...result.cutoff2]
      .flatMap(s => s.carries.flatMap(c => c.subitems.map(e => e.subitem.id)));
    assert.deepEqual([...new Set(named)], ['ok']);
  });

  await t.test("every step's carries add up to its amount, and every entry's Subitems to the entry's", () => {
    const result = fundViaHub(
      [subitem('b1', 33), subitem('h1', 15), subitem('c1', 47), subitem('b2', 21), subitem('h2', 9)],
      { b1: 'both', h1: 'cutoff1', c1: 'both', b2: 'cutoff2', h2: 'both' },
      { b1: 'b', h1: 'hub', c1: 'c', b2: 'b', h2: 'hub' },
    );
    // Known totals: Cutoff 1 moves 16.5 + 15 + 23.5 + 4.5 = 59.5 into the hub.
    assert.equal(leg(result.cutoff1, 'src', 'hub').amount, 59.5);
    const sum = xs => xs.reduce((s, x) => s + x.amount, 0);
    for (const s of [...result.cutoff1, ...result.cutoff2]) {
      assert.equal(sum(s.carries), s.amount, `${s.fromId}→${s.toId}`);
      for (const c of s.carries) assert.equal(sum(c.subitems), c.amount, `${s.fromId}→${s.toId} ${c.bankId}`);
    }
  });
});
