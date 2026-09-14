'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('../test-helpers/loadScript');

function bank(id, opts = {}) {
  return { id, name: id, type: 'bank', freeLimit: 0, resetPeriod: 'monthly', ...opts };
}

// Steps come back as vm-realm objects, whose prototype differs from this
// realm's Object.prototype — deepEqual's prototype check would fail on
// otherwise-identical plain data, so normalise through JSON first.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('transferPlanner', async (t) => {
  const { TransferPlanner } = loadScripts(['js/transferPlanner.js'], ['TransferPlanner']);

  await t.test('a direct Route', () => {
    const banks = [bank('a'), bank('b')];
    const fees = { a_b: { fee: 10 } };
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { b: 100 } });
    assert.deepEqual(plain(steps), [{ fromId: 'a', toId: 'b', amount: 100, fee: 10, routingFor: [] }]);
  });

  await t.test('a strictly cheaper intermediary Bank is used instead of direct', () => {
    const banks = [bank('a'), bank('b'), bank('hub')];
    const fees = { a_b: { fee: 20 }, a_hub: { fee: 5 }, hub_b: { fee: 5 } };
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { b: 100 } });
    assert.deepEqual(plain(steps), [
      { fromId: 'a', toId: 'hub', amount: 100, fee: 5, routingFor: ['b'] },
      { fromId: 'hub', toId: 'b', amount: 100, fee: 5, routingFor: [] },
    ]);
  });

  await t.test('a tie between direct and intermediary stays direct', () => {
    const banks = [bank('a'), bank('b'), bank('hub')];
    const fees = { a_b: { fee: 10 }, a_hub: { fee: 5 }, hub_b: { fee: 5 } };
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { b: 100 } });
    assert.deepEqual(plain(steps), [{ fromId: 'a', toId: 'b', amount: 100, fee: 10, routingFor: [] }]);
  });

  await t.test('two destinations through the same intermediary merge into one step with both in routingFor', () => {
    const banks = [bank('a'), bank('b'), bank('c'), bank('hub')];
    const fees = {
      a_b: { fee: 20 }, a_c: { fee: 20 },
      a_hub: { fee: 5 }, hub_b: { fee: 5 }, hub_c: { fee: 5 },
    };
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { b: 100, c: 50 } });
    const hubLeg = steps.find(s => s.fromId === 'a' && s.toId === 'hub');
    assert.deepEqual(plain(hubLeg), { fromId: 'a', toId: 'hub', amount: 150, fee: 5, routingFor: ['b', 'c'] });
    assert.ok(steps.some(s => s.fromId === 'hub' && s.toId === 'b' && s.amount === 100));
    assert.ok(steps.some(s => s.fromId === 'hub' && s.toId === 'c' && s.amount === 50));
  });

  await t.test('ordering by Fee ascending, with no-Route steps last', () => {
    const banks = [bank('a'), bank('b'), bank('c'), bank('d')];
    const fees = { a_b: { fee: 20 }, a_c: { fee: 5 } };
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { b: 100, c: 100, d: 100 } });
    assert.deepEqual(plain(steps.map(s => s.toId)), ['c', 'b', 'd']);
    assert.equal(steps[2].fee, null);
  });

  await t.test('a free-transfer quota above 0 gives Fee 0', () => {
    const banks = [bank('a', { freeLimit: 5 }), bank('b')];
    const fees = { a_b: { fee: 20 } };
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { b: 100 } });
    assert.equal(steps[0].fee, 0);
  });

  await t.test('no Route gives fee: null', () => {
    const banks = [bank('a'), bank('b')];
    const fees = {};
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { b: 100 } });
    assert.deepEqual(plain(steps), [{ fromId: 'a', toId: 'b', amount: 100, fee: null, routingFor: [] }]);
  });

  await t.test('zero-need Banks are skipped', () => {
    const banks = [bank('a'), bank('b'), bank('c')];
    const fees = { a_b: { fee: 10 }, a_c: { fee: 10 } };
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { b: 100, c: 0 } });
    assert.equal(steps.length, 1);
    assert.equal(steps[0].toId, 'b');
  });

  await t.test('the Salary source is never a destination', () => {
    const banks = [bank('a'), bank('b')];
    const fees = { a_b: { fee: 10 }, b_a: { fee: 10 } };
    const steps = TransferPlanner.plan({ banks, fees, sourceId: 'a', needs: { a: 100, b: 100 } });
    assert.equal(steps.length, 1);
    assert.equal(steps[0].toId, 'b');
  });
});
