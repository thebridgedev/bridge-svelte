type LogMethod = (...args: unknown[]) => void;

let _debug = false;

export function setLoggerDebug(debug: boolean) {
  _debug = debug;
}

function createPrefixed(method: LogMethod, prefix: string): LogMethod {
  return (...args: unknown[]) => method(prefix, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (_debug) console.log(...args);
  },
  log: (...args: unknown[]) => {
    if (_debug) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (_debug) console.info(...args);
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
