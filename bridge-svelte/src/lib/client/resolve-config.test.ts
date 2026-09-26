// TBP-695 — Bridge starts from one line: the app id and addresses come from the
// standard VITE_BRIDGE_* variables, anything passed explicitly wins, and with
// no app id anywhere Bridge refuses to start instead of guessing production.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readBridgeEnv, resolveBridgeConfig, PRODUCTION_API_BASE_URL } from './resolve-config.js';

const STAGE_API = 'https://api-stage.thebridge.dev';
const STAGE_HOSTED = 'https://auth-stage.thebridge.dev';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('precedence: explicit option > environment > default', () => {
  it('reads every field from the environment when nothing is passed', () => {
    const config = resolveBridgeConfig(
      {},
      { appId: 'env-app', apiBaseUrl: STAGE_API, hostedUrl: STAGE_HOSTED, debug: 'true' },
      false
    );
    expect(config).toMatchObject({
      appId: 'env-app',
      apiBaseUrl: STAGE_API,
      hostedUrl: STAGE_HOSTED,
      debug: true,
    });
  });

  it('an explicit option wins over the environment, field by field', () => {
    const config = resolveBridgeConfig(
      { appId: 'explicit-app', debug: false },
      { appId: 'env-app', apiBaseUrl: STAGE_API, hostedUrl: STAGE_HOSTED, debug: 'true' },
      false
    );
    expect(config.appId).toBe('explicit-app');
    expect(config.debug).toBe(false);
    // Not passed explicitly → still the environment's.
    expect(config.apiBaseUrl).toBe(STAGE_API);
    expect(config.hostedUrl).toBe(STAGE_HOSTED);
  });

  it('an explicit address wins over an environment address', () => {
    const config = resolveBridgeConfig(
      { apiBaseUrl: 'http://localhost:3200' },
      { appId: 'env-app', apiBaseUrl: STAGE_API },
      false
    );
    expect(config.apiBaseUrl).toBe('http://localhost:3200');
  });

  it('leaves the address to the SDK default (production) when neither sets it', () => {
    const config = resolveBridgeConfig({ appId: 'explicit-app' }, {}, false);
    expect(config.appId).toBe('explicit-app');
    // Absent, so the config store's default applies downstream — not a stage value.
    expect('apiBaseUrl' in config).toBe(false);
  });

  it('carries non-environment options through untouched', () => {
    const config = resolveBridgeConfig(
      { loginRoute: '/auth/login', billing: { paywallRoute: '/welcome' } },
      { appId: 'env-app' },
      false
    );
    expect(config.loginRoute).toBe('/auth/login');
    expect(config.billing).toEqual({ paywallRoute: '/welcome' });
  });

  it('treats an empty variable as not set (the demo .env files rely on KEY=)', () => {
    const config = resolveBridgeConfig(
      { appId: 'explicit-app' },
      { appId: '', apiBaseUrl: '', hostedUrl: '  ', debug: '' },
      false
    );
    expect(config.appId).toBe('explicit-app');
    expect('apiBaseUrl' in config).toBe(false);
    expect('hostedUrl' in config).toBe(false);
    expect('debug' in config).toBe(false);
  });
});

describe('no guessing', () => {
  it('throws, naming VITE_BRIDGE_APP_ID, when no app id is resolved', () => {
    expect(() => resolveBridgeConfig({}, { apiBaseUrl: STAGE_API }, false)).toThrow(/VITE_BRIDGE_APP_ID/);
    expect(() => resolveBridgeConfig({ appId: '' }, { appId: '' }, false)).toThrow(/No Bridge app id/);
  });

  it('in a development build, says production is being used and names VITE_BRIDGE_API_BASE_URL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveBridgeConfig({}, { appId: 'env-app' }, true);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('VITE_BRIDGE_API_BASE_URL');
    expect(line).toContain(PRODUCTION_API_BASE_URL);
    expect(line).toContain('env-app');
  });

  it('stays silent when an address is set, and in a production build', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveBridgeConfig({}, { appId: 'env-app', apiBaseUrl: STAGE_API }, true);
    resolveBridgeConfig({}, { appId: 'env-app' }, false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('reads the real Vite variables', () => {
  it('a stage-shaped VITE_BRIDGE_API_BASE_URL reaches the config, not production', () => {
    vi.stubEnv('VITE_BRIDGE_APP_ID', 'stage-app');
    vi.stubEnv('VITE_BRIDGE_API_BASE_URL', STAGE_API);
    vi.stubEnv('VITE_BRIDGE_HOSTED_URL', STAGE_HOSTED);
    vi.stubEnv('VITE_BRIDGE_DEBUG', 'true');

    expect(readBridgeEnv()).toEqual({
      appId: 'stage-app',
      apiBaseUrl: STAGE_API,
      hostedUrl: STAGE_HOSTED,
      debug: 'true',
    });

    const config = resolveBridgeConfig();
    expect(config.appId).toBe('stage-app');
    expect(config.apiBaseUrl).toBe(STAGE_API);
    expect(config.apiBaseUrl).not.toBe(PRODUCTION_API_BASE_URL);
  });
});
