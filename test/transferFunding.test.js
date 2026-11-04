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
  const step = amount => ({ fromId: 'src', toId: 'b', amount, fee: 10, routingFor: [] });

  await t.test('a Subitem in Cutoff 1 funds a Transfer only in Cutoff 1', () => {
    const result = fund([subitem('x', 100)], { x: 'cutoff1' }, { x: 'b' });
    assert.deepEqual(result, { cutoff1: [step(100)], cutoff2: [], unfunded: [] });
  });

  await t.test('a Subitem in Cutoff 2 funds a Transfer only in Cutoff 2', () => {
    const result = fund([subitem('x', 100)], { x: 'cutoff2' }, { x: 'b' });
    assert.deepEqual(result, { cutoff1: [], cutoff2: [step(100)], unfunded: [] });
  });

  await t.test('a Subitem in Both funds half its amount in each Cutoff', () => {
    const result = fund([subitem('x', 100)], { x: 'both' }, { x: 'b' });
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
    const result = fund(
      [subitem('x', 100), subitem('y', 40), subitem('z', 60)],
      { x: 'cutoff1', y: 'cutoff1', z: 'both' },
      { x: 'b', y: 'b', z: 'b' },
    );
    assert.deepEqual(result.cutoff1, [step(170)]);
    assert.deepEqual(result.cutoff2, [step(30)]);
  });

  await t.test('a Bank with no Route from the Salary source comes through as fee: null', () => {
    const result = fund([subitem('x', 100)], { x: 'cutoff1' }, { x: 'b' }, { fees: {} });
    assert.deepEqual(result.cutoff1, [{ fromId: 'src', toId: 'b', amount: 100, fee: null, routingFor: [] }]);
  });

  await t.test('the Salary source is the one passed in', () => {
    const result = fund([subitem('x', 100)], { x: 'cutoff1' }, { x: 'src' },
      { sourceId: 'b', fees: { b_src: { fee: 3 } } });
    assert.deepEqual(result.cutoff1, [{ fromId: 'b', toId: 'src', amount: 100, fee: 3, routingFor: [] }]);
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
});
