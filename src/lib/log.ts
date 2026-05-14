type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
type LogPayload = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const REDACTED = '[redacted]';
const SENSITIVE_HEADER =
  /^(authorization|cookie|set-cookie|x-api-key|x-github-token)$/i;
const SENSITIVE_KEY =
  /(authorization|cookie|token|secret|password|api[-_]?key)/i;

type NoreaLogApi = Partial<Record<Exclude<LogLevel, 'silent'>, unknown>>;
type NoreaGlobal = typeof globalThis & {
  Norea?: {
    log?: NoreaLogApi;
    logLevel?: LogLevel;
  };
  __NOREA_LOG_LEVEL__?: LogLevel;
};

function configuredLevel(): LogLevel {
  const scope = globalThis as NoreaGlobal;
  return scope.Norea?.logLevel ?? scope.__NOREA_LOG_LEVEL__ ?? 'silent';
}

function shouldLog(level: Exclude<LogLevel, 'silent'>) {
  return LEVELS[level] >= LEVELS[configuredLevel()];
}

function hostLog(level: Exclude<LogLevel, 'silent'>) {
  const scope = globalThis as NoreaGlobal;
  const target = scope.Norea?.log?.[level];
  return typeof target === 'function' ? target : undefined;
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (value instanceof Headers) return redactHeaders(value);
  if (Array.isArray(value)) return value.map(item => redactUnknown(item));
  if (value && typeof value === 'object') return redactUnknown(value);
  return value;
}

function redactUnknown(value: unknown): unknown {
  if (value instanceof Headers) return redactHeaders(value);
  if (!value || typeof value !== 'object') return value;

  const redacted: LogPayload = {};
  for (const [key, child] of Object.entries(value as LogPayload)) {
    redacted[key] = redactValue(key, child);
  }
  return redacted;
}

export function redactHeaders(headers: Headers | Record<string, unknown>) {
  const redacted: Record<string, unknown> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      redacted[key] = SENSITIVE_HEADER.test(key) ? REDACTED : value;
    });
    return redacted;
  }

  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SENSITIVE_HEADER.test(key) ? REDACTED : value;
  }
  return redacted;
}

export function redactLogPayload(payload: LogPayload): LogPayload {
  return redactUnknown(payload) as LogPayload;
}

function writeLog(
  level: Exclude<LogLevel, 'silent'>,
  message: string,
  payload?: LogPayload,
) {
  if (!shouldLog(level)) return;
  const redacted = payload ? redactLogPayload(payload) : undefined;
  const target = hostLog(level);
  if (target) {
    target(message, redacted);
    return;
  }

  const consoleMethod = console[level] ?? console.log;
  consoleMethod(message, redacted);
}

export const log = {
  debug(message: string, payload?: LogPayload) {
    writeLog('debug', message, payload);
  },
  info(message: string, payload?: LogPayload) {
    writeLog('info', message, payload);
  },
  warn(message: string, payload?: LogPayload) {
    writeLog('warn', message, payload);
  },
  error(message: string, payload?: LogPayload) {
    writeLog('error', message, payload);
  },
};
