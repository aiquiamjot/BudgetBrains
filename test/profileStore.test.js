'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('../test-helpers/loadScript');

// Sandbox objects have a different prototype from this realm's — compare as JSON.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/* The remote adapter: an in-memory row list standing in for Supabase. `rows` is
   what persists; `loadError` makes loadRows fail the way a Supabase outage does. */
function memoryRemote(rows = [], { loadError = null, upsertError = null } = {}) {
  const remote = {
    rows: plain(rows),
    async loadRows() {
      return loadError ? { rows: [], error: loadError } : { rows: plain(remote.rows), error: null };
    },
    async upsert(newRows) {
      if (upsertError) return { error: upsertError };
      for (const r of plain(newRows)) {
        const i = remote.rows.findIndex(x => x.profile_id === r.profile_id && x.key === r.key);
        if (i >= 0) remote.rows[i] = r; else remote.rows.push(r);
      }
      return { error: null };
    },
    async deleteScope(profileId) {
      remote.rows = remote.rows.filter(r => r.profile_id !== profileId);
      return { error: null };
    },
  };
  return remote;
}

// The local adapter: anything shaped like localStorage.
function memoryLocal(entries = {}) {
  const map = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    read: k => (map.has(k) ? JSON.parse(map.get(k)) : undefined),
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
  };
}

const row = (profile_id, key, value) => ({ profile_id, key, value });
const find = (remote, profile_id, key) =>
  remote.rows.find(r => r.profile_id === profile_id && r.key === key)?.value;

const overview = netPay => ({ netPay, splits: { needs: 50, wants: 30, savings: 20 }, subitems: [] });

test('profileStore', async (t) => {
  const logged = [];
  const { ProfileStore } = loadScripts(
    ['js/cutoffPlan.js', 'js/state.js'],
    ['ProfileStore'],
    { crypto, console: { error: (...args) => logged.push(args), log() {}, warn() {} } },
  );

  async function loaded(rows, { local = memoryLocal(), ...remoteOpts } = {}) {
    const state = {};
    const remote = memoryRemote(rows, remoteOpts);
    const store = ProfileStore.create({ state, remote, local });
    const result = await store.load();
    return { state, remote, local, store, result };
  }

  const twoProfiles = [
    row('account', 'bb_profiles', [{ id: 'p1', name: 'Main' }, { id: 'p2', name: 'Lean' }]),
    row('account', 'bb_banks', [{ id: 'b1', name: 'BPI' }]),
    row('account', 'bb_fees', { b1_b2: { fee: 15 } }),
    row('p1', 'bb_overview', overview(1000)),
    row('p1', 'bb_bankAssign', { s1: 'b1' }),
    row('p2', 'bb_overview', overview(2000)),
    row('p2', 'bb_manual', [{ from: 'b1', to: 'cash', amount: 5, note: '' }]),
  ];

  await t.test('load routes Account rows to Account keys and per-Profile rows to each Profile', async () => {
    const local = memoryLocal({ bb_activeProfile: 'p2', bb_theme: 'dark' });
    const { state, result } = await loaded(twoProfiles, { local });

    assert.equal(result.error, null);
    assert.deepEqual(plain(state.profiles), [{ id: 'p1', name: 'Main' }, { id: 'p2', name: 'Lean' }]);
    assert.deepEqual(plain(state.banks), [{ id: 'b1', name: 'BPI' }]);
    assert.deepEqual(plain(state.fees), { b1_b2: { fee: 15 } });
    assert.equal(state.theme, 'dark');
    assert.equal(state.activeProfile, 'p2');
    assert.equal(state.overview.netPay, 2000);
    assert.deepEqual(plain(state.manual), [{ from: 'b1', to: 'cash', amount: 5, note: '' }]);
    assert.deepEqual(plain(state.bankAssign), {});
    assert.deepEqual(plain(state.biweekly), { assignments: {}, forced: {} });
  });

  await t.test('activating another Profile shows that Profile\'s own data, with no refetch', async () => {
    const { state, store, remote } = await loaded(twoProfiles, { local: memoryLocal({ bb_activeProfile: 'p2' }) });
    remote.loadRows = async () => { throw new Error('activate must not fetch'); };

    store.activate('p1');
    assert.equal(state.activeProfile, 'p1');
    assert.equal(state.overview.netPay, 1000);
    assert.deepEqual(plain(state.bankAssign), { s1: 'b1' });
    assert.deepEqual(plain(state.manual), []);
  });

  await t.test('load with no Profile list bootstraps "Main" and adopts the sentinel rows, leaving them in place', async () => {
    const legacy = [
      row('account', 'bb_banks', [{ id: 'b1', name: 'BPI' }]),
      row('account', 'bb_overview', overview(500)),
      row('account', 'bb_biweekly', { assignments: { s1: 'cutoff1' } }),
    ];
    const { state, remote, local, result } = await loaded(legacy);
    await new Promise(r => setImmediate(r)); // bootstrap writes are fire-and-forget

    assert.equal(result.error, null);
    assert.equal(state.profiles.length, 1);
    const [{ id, name }] = state.profiles;
    assert.equal(name, 'Main');
    assert.equal(state.activeProfile, id);
    assert.equal(state.overview.netPay, 500);
    assert.deepEqual(plain(state.biweekly), { assignments: { s1: 'cutoff1' }, forced: {} });

    // Persisted: the Profile list, every per-Profile key on the new id, the Active Profile.
    assert.deepEqual(find(remote, 'account', 'bb_profiles'), [{ id, name: 'Main' }]);
    assert.equal(find(remote, id, 'bb_overview').netPay, 500);
    assert.deepEqual(find(remote, id, 'bb_biweekly'), { assignments: { s1: 'cutoff1' }, forced: {} });
    assert.deepEqual(find(remote, id, 'bb_bankAssign'), {});
    assert.deepEqual(find(remote, id, 'bb_manual'), []);
    assert.equal(local.read('bb_activeProfile'), id);

    // ADR-0002: the stranded sentinel rows stay.
    assert.equal(find(remote, 'account', 'bb_overview').netPay, 500);
    assert.deepEqual(find(remote, 'account', 'bb_biweekly'), { assignments: { s1: 'cutoff1' } });
  });

  await t.test('a failed load bootstraps in memory, writes nothing, and returns { error }', async () => {
    const loadError = { message: 'column profile_id does not exist' };
    const local = memoryLocal();
    const { state, remote, result } = await loaded(twoProfiles, { local, loadError });
    await new Promise(r => setImmediate(r));

    assert.deepEqual(plain(result.error), loadError);
    assert.equal(state.profiles.length, 1);
    assert.equal(state.profiles[0].name, 'Main');
    assert.equal(state.activeProfile, state.profiles[0].id);
    assert.equal(state.overview.netPay, 0);
    assert.deepEqual(plain(remote.rows), plain(twoProfiles));
    assert.equal(local.map.size, 0);
  });

  await t.test('a stale remembered Active Profile falls back to the first Profile, saved locally', async () => {
    const local = memoryLocal({ bb_activeProfile: 'deleted-elsewhere' });
    const { state } = await loaded(twoProfiles, { local });

    assert.equal(state.activeProfile, 'p1');
    assert.equal(state.overview.netPay, 1000);
    assert.equal(local.read('bb_activeProfile'), 'p1');
  });

  await t.test('activating a Profile reads its Spending Personality and normalises a pre-Force-Assign plan', async () => {
    const rows = [
      ...twoProfiles,
      row('p2', 'bb_biweekly', { assignments: { s9: 'both' } }),
    ];
    const local = memoryLocal({
      bb_activeProfile: 'p1',
      'bb_groq_profile:p1': { name: 'Saver' },
      'bb_groq_profile:p2': { name: 'Spender' },
    });
    const { state, store } = await loaded(rows, { local });
    assert.deepEqual(plain(state.groqProfile), { name: 'Saver' });

    store.activate('p2');
    assert.deepEqual(plain(state.biweekly), { assignments: { s9: 'both' }, forced: {} });
    assert.deepEqual(plain(state.groqProfile), { name: 'Spender' });
  });

  await t.test('save routes Account keys to the sentinel and Profile keys to the Active Profile, even mid-switch', async () => {
    const { state, store, remote } = await loaded(twoProfiles, { local: memoryLocal({ bb_activeProfile: 'p1' }) });

    // Hold every upsert until released, so the switch really happens mid-write
    let release;
    const gate = new Promise(r => { release = r; });
    const upsert = remote.upsert;
    remote.upsert = async rows => { await gate; return upsert(rows); };

    state.banks.push({ id: 'b2', name: 'GCash' });
    state.overview.netPay = 1111;
    const write = store.save('banks', 'overview');
    store.activate('p2'); // switch while the write is in flight
    state.overview.netPay = 2999; // and edit the newly Active Profile
    release();
    await write;

    assert.deepEqual(find(remote, 'account', 'bb_banks'), [{ id: 'b1', name: 'BPI' }, { id: 'b2', name: 'GCash' }]);
    assert.equal(find(remote, 'p1', 'bb_overview').netPay, 1111);
    assert.equal(find(remote, 'p2', 'bb_overview').netPay, 2000);
    assert.equal(find(remote, 'p2', 'bb_banks'), undefined);
  });

  await t.test('save writes device-local keys to the local adapter, the Spending Personality per Profile', async () => {
    const local = memoryLocal({ bb_activeProfile: 'p2' });
    const { state, store, remote } = await loaded(twoProfiles, { local });
    const before = plain(remote.rows);

    state.activeTab = 'banks';
    state.groqProfile = { name: 'Planner' };
    await store.save('activeTab', 'groqProfile');

    assert.equal(local.read('bb_activeTab'), 'banks');
    assert.deepEqual(local.read('bb_groq_profile:p2'), { name: 'Planner' });
    assert.deepEqual(plain(remote.rows), before);
  });

  await t.test('saveProfile writes a non-Active Profile from its own data', async () => {
    const { state, store, remote } = await loaded(twoProfiles, { local: memoryLocal({ bb_activeProfile: 'p1' }) });

    store.activate('p2');
    state.manual.push({ from: 'b1', to: 'cash', amount: 7, note: 'x' });
    store.activate('p1');
    await store.saveProfile('p2', 'manual');

    assert.deepEqual(find(remote, 'p2', 'bb_manual'), [
      { from: 'b1', to: 'cash', amount: 5, note: '' },
      { from: 'b1', to: 'cash', amount: 7, note: 'x' },
    ]);
    assert.equal(find(remote, 'p1', 'bb_manual'), undefined);
  });

  await t.test('a failed write resolves and logs instead of throwing', async () => {
    const { store, remote } = await loaded(twoProfiles, { local: memoryLocal({ bb_activeProfile: 'p1' }) });
    remote.upsert = async () => ({ error: { message: 'offline' } });
    logged.length = 0;
    await store.save('overview');
    await store.saveProfile('p2', 'overview');
    assert.equal(logged.length, 2);

    remote.upsert = async () => { throw new Error('network down'); };
    logged.length = 0;
    await store.save('banks');
    assert.equal(logged.length, 1);
  });
  const settle = () => new Promise(r => setImmediate(r));
  const active = { local: () => memoryLocal({ bb_activeProfile: 'p1' }) };

  await t.test('create with no source makes an empty default Profile, Active and persisted', async () => {
    const { state, store, remote } = await loaded(twoProfiles, { local: active.local() });
    const id = store.create('Fresh');
    await settle();

    assert.equal(state.activeProfile, id);
    assert.deepEqual(plain(state.overview), overview(0));
    assert.equal(state.profiles.at(-1).name, 'Fresh');
    assert.deepEqual(find(remote, 'account', 'bb_profiles').map(p => p.id), ['p1', 'p2', id]);
    assert.deepEqual(find(remote, id, 'bb_overview'), overview(0));
    assert.deepEqual(find(remote, id, 'bb_bankAssign'), {});
    assert.deepEqual(find(remote, id, 'bb_manual'), []);
  });

  await t.test('create from a source deep-copies every per-Profile key', async () => {
    const { state, store, remote } = await loaded(twoProfiles, { local: active.local() });
    state.overview.subitems.push({ id: 's1', name: 'Rent', category: 'needs', amount: 5 });
    state.biweekly.assignments.s1 = 'cutoff1';
    const id = store.create('Copy', 'p1');
    await settle();

    assert.equal(state.overview.subitems[0].id, 's1');
    assert.equal(state.biweekly.assignments.s1, 'cutoff1');
    assert.equal(state.bankAssign.s1, 'b1');
    assert.equal(find(remote, id, 'bb_bankAssign').s1, 'b1');

    state.overview.subitems[0].name = 'Changed';
    state.bankAssign.s1 = 'cash';
    store.activate('p1');
    assert.equal(state.overview.subitems[0].name, 'Rent');
    assert.equal(state.bankAssign.s1, 'b1');
  });

  await t.test('rename persists the new name on the Account Profile list', async () => {
    const { store, remote, state } = await loaded(twoProfiles, { local: active.local() });
    store.rename('p2', 'Leaner');
    await settle();
    assert.equal(state.profiles[1].name, 'Leaner');
    assert.equal(find(remote, 'account', 'bb_profiles')[1].name, 'Leaner');
  });

  await t.test('remove deletes remote rows and local personality, keeps Account rows', async () => {
    const local = memoryLocal({ bb_activeProfile: 'p1', 'bb_groq_profile:p2': 'x' });
    const { store, remote, state } = await loaded(twoProfiles, { local });
    await store.remove('p2');

    assert.deepEqual(state.profiles.map(p => p.id), ['p1']);
    assert.deepEqual(store.profileIds(), ['p1']);
    assert.equal(store.profileData('p2'), undefined);
    assert.equal(state._profileData, undefined);
    assert.equal(remote.rows.some(r => r.profile_id === 'p2'), false);
    assert.equal(local.getItem('bb_groq_profile:p2'), null);
    assert.deepEqual(find(remote, 'account', 'bb_profiles').map(p => p.id), ['p1']);
    assert.ok(find(remote, 'account', 'bb_banks'));
    assert.ok(find(remote, 'account', 'bb_fees'));
  });

  await t.test('removing the Active Profile activates the first remaining', async () => {
    const { store, state } = await loaded(twoProfiles, { local: memoryLocal({ bb_activeProfile: 'p2' }) });
    await store.remove('p2');
    assert.equal(state.activeProfile, 'p1');
    assert.equal(state.overview.netPay, 1000);
  });

  await t.test('removing the last Profile throws', async () => {
    const { store } = await loaded(twoProfiles, { local: active.local() });
    await store.remove('p2');
    assert.throws(() => store.remove('p1'));
  });

  await t.test('a wholesale reassignment of an Active Profile key is read back and persisted', async () => {
    const { store, state, remote } = await loaded(twoProfiles, { local: active.local() });
    state.overview = overview(5000);
    assert.equal(state.overview.netPay, 5000);
    await store.save('overview');
    assert.equal(find(remote, 'p1', 'bb_overview').netPay, 5000);
    assert.equal(find(remote, 'p2', 'bb_overview').netPay, 2000);
  });

  await t.test('a reassigned value survives switching Profiles and back; the other Profile is unchanged', async () => {
    const { store, state } = await loaded(twoProfiles, { local: active.local() });
    state.bankAssign = { s9: 'b1' };
    store.activate('p2');
    assert.equal(state.overview.netPay, 2000);
    store.activate('p1');
    assert.deepEqual(plain(state.bankAssign), { s9: 'b1' });
    assert.equal(store.profileData('p2').overview.netPay, 2000);
  });

  await t.test('profileIds lists every Profile and profileData returns its per-Profile data', async () => {
    const { store } = await loaded(twoProfiles, { local: active.local() });
    assert.deepEqual(store.profileIds(), ['p1', 'p2']);
    assert.equal(store.profileData('p2').overview.netPay, 2000);
    assert.deepEqual(plain(store.profileData('p1').bankAssign), { s1: 'b1' });
  });

  await t.test('the per-Profile cache is not reachable from the state object', async () => {
    const { state } = await loaded(twoProfiles, { local: active.local() });
    assert.equal(state._profileData, undefined);
  });
});
