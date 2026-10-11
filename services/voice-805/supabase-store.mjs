import { randomUUID } from 'node:crypto';
import { Engine } from './engine.mjs';

// Each short transaction is pure until PostgreSQL accepts its revision. Network
// effects are claimed and committed separately, before contacting the carrier.
export class SnapshotStore {
  constructor(state = {}) { this.state = structuredClone({ entities: {}, events: {}, inbound: {}, ...state }); }
  tx(fn) { const before = structuredClone(this.state); try { return fn(); } catch (e) { this.state = before; throw e; } }
  get(kind, id) { return structuredClone(this.state.entities[kind]?.[id] ?? null); }
  put(kind, value) { (this.state.entities[kind] ??= {})[value.id] = structuredClone(value); return value; }
  list(kind) { return Object.values(this.state.entities[kind] ?? {}).map(x => structuredClone(x)).reverse(); }
  once(id, callId) { if (this.state.events[id]) return false; this.state.events[id] = { callId, at: Date.now() }; return true; }
  inbound(sid, create) { return this.tx(() => { const id = this.state.inbound[sid]; if (id) return this.get('call', id); const call = create(); this.state.inbound[sid] = call.id; return this.put('call', call); }); }
  effect(call, type, data = {}) { return this.put('effect', { id: randomUUID(), callId: call.id, type, data, status: 'pending', attempts: 0, at: Date.now(), nextAt: Date.now() }); }
  claim(kind, now = Date.now()) { const item = this.list(kind).reverse().find(x => x.status === 'pending' && x.nextAt <= now); return item ? this.put(kind, { ...item, status: 'sending', attempts: item.attempts + 1, leaseUntil: now + 60000 }) : null; }
  recover(now = Date.now()) { for (const kind of ['effect','notification']) for (const item of this.list(kind)) if (item.status === 'sending' && item.leaseUntil < now) this.put(kind, { ...item, status: 'uncertain', error: 'Interrupted provider operation; reconcile before retry.' }); }
}
export class SupabaseState {
  constructor(client, config) { this.client = client; this.config = config; this.dataset = config.dataset || 'pilot'; }
  async read() { const { data, error } = await this.client.from('voice_805_state').select('revision,body').eq('id', this.dataset).single(); if (error) throw new Error('805 phone database unavailable'); return data; }
  async transact(fn) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await this.read(); const store = new SnapshotStore(row.body); const engine = new Engine(store, this.config);
      for (const [key, value] of Object.entries(store.state.events)) {
        if (key.startsWith('control:') && value.at < Date.now() - 120000) delete store.state.events[key];
      }
      const value = fn(engine, store);
      if (value && typeof value.then === 'function') throw new Error('Network IO cannot run inside a state transaction');
      if (JSON.stringify(row.body) === JSON.stringify(store.state)) return value;
      const { data, error } = await this.client.rpc('voice_805_commit', { p_id: this.dataset, p_revision: row.revision, p_body: store.state });
      if (error) throw new Error('805 phone state could not be saved');
      if (data === true) return value;
    }
    throw new Error('805 phone state busy; retry request');
  }
}
