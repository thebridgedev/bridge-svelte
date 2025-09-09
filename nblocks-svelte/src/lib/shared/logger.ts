import { getConfig } from '../client/stores/config.store.js';

type LogMethod = (...args: unknown[]) => void;

function createPrefixed(method: LogMethod, prefix: string): LogMethod {
  return (...args: unknown[]) => method(prefix, ...args);
}

function isDebugEnabled(): boolean {
  try {
    const cfg = getConfig();    
    return !!cfg.debug;
  } catch {
    return false;
  }
}

export const logger = {
  debug: (...args: unknown[]) => {    
    if (isDebugEnabled()) console.log(...args);
  },
  log: (...args: unknown[]) => {
    if (isDebugEnabled()) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDebugEnabled()) console.info(...args);
  },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
  withPrefix(prefix: string) {
    return {
      debug: (...args: unknown[]) => logger.debug(prefix, ...args),
      log: (...args: unknown[]) => logger.log(prefix, ...args),
      info: (...args: unknown[]) => logger.info(prefix, ...args),
      warn: createPrefixed(console.warn, prefix),
      error: createPrefixed(console.error, prefix)
    } as const;
  }
} as const;

export type Logger = typeof logger;


