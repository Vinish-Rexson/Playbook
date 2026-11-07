// Social layer kept on this phone only (no server changes): up / down votes on playbooks and "following" creators.
// Vote counts start from a stable pseudo-random baseline per playbook (seeded by its id, so every phone and every
// render shows the same numbers); your own vote adds on top. Follows and votes persist in SecureStore.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

type State = { follows: string[]; votes: Record<string, 1 | -1> };

const KEY = 'pb.social.v1';
// SecureStore values are capped around 2 KB: keep the newest entries only.
const MAX_FOLLOWS = 30;
const MAX_VOTES = 40;

let state: State = { follows: [], votes: {} };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

SecureStore.getItemAsync(KEY)
  .then((raw) => {
    if (!raw) return;
    const s = JSON.parse(raw) as Partial<State>;
    state = { follows: Array.isArray(s.follows) ? s.follows : [], votes: s.votes && typeof s.votes === 'object' ? s.votes : {} };
    emit();
  })
  .catch(() => {});

function save(next: State) {
  state = next;
  emit();
  SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

/** Follows and votes; components re-render when either changes. */
export const useSocial = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export function toggleFollow(address: string) {
  const a = address.toLowerCase();
  const on = state.follows.includes(a);
  save({ ...state, follows: on ? state.follows.filter((x) => x !== a) : [a, ...state.follows].slice(0, MAX_FOLLOWS) });
}

/** Tap the same arrow again to take the vote back. */
export function vote(templateId: string, dir: 1 | -1) {
  const votes = { ...state.votes };
  if (votes[templateId] === dir) delete votes[templateId];
  else votes[templateId] = dir;
  const keys = Object.keys(votes);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_VOTES))) delete votes[k];
  save({ ...state, votes });
}

export const isFollowing = (s: State, address: string) => s.follows.includes(address.toLowerCase());

/** Deterministic 0..1 from a string (FNV-1a), so the baseline never jumps between renders or phones. */
function seeded(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Up / down counts: a baseline (random 0..1 share of upvotes over 4..80 votes) plus your own vote. */
export function votesFor(s: State, templateId: string) {
  const total = 4 + Math.round(seeded(templateId, 1) * 76);
  const share = seeded(templateId, 2);
  const mine = s.votes[templateId] ?? 0;
  const up = Math.round(total * share) + (mine === 1 ? 1 : 0);
  const down = total - Math.round(total * share) + (mine === -1 ? 1 : 0);
  return { up, down, mine };
}
