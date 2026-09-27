// TBP-703 — one rule for who gets an Upgrade call to action (the quota banner
// and the upgrade dialog share it), and one source for what a member reads.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { holder } = vi.hoisted(() => ({ holder: { auth: null as null | { canManageBilling: () => boolean } } }));

vi.mock('../core/bridge-instance.js', () => ({
  getBridgeAuth: () => {
    if (!holder.auth) throw new Error('Bridge not initialised');
    return holder.auth;
  },
}));

import { isBillingAdmin, quotaMemberBody } from './billing-role.js';

beforeEach(() => {
  holder.auth = null;
});

describe('isBillingAdmin — the banner’s owner rule', () => {
  it('is true when BridgeAuth says the user may manage billing', () => {
    holder.auth = { canManageBilling: () => true };
    expect(isBillingAdmin()).toBe(true);
  });

  it('is false for a member', () => {
    holder.auth = { canManageBilling: () => false };
    expect(isBillingAdmin()).toBe(false);
  });

  it('fails closed to member when Bridge is not initialised', () => {
    expect(isBillingAdmin()).toBe(false);
  });
});

describe('quotaMemberBody — what a member reads', () => {
  it('points at the workspace owner at and near the cap', () => {
    expect(quotaMemberBody('tickets', 'over')).toBe('Your workspace is over its tickets cap. Contact your workspace owner.');
    expect(quotaMemberBody('tickets', 'critical')).toBe(
      'Your workspace is approaching its tickets cap. Contact your workspace owner.',
    );
    expect(quotaMemberBody('tickets', 'approaching')).toBe('Your workspace is approaching its tickets cap.');
  });
});
