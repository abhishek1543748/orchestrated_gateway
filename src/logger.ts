/**
 * Lightweight structured logger.
 *
 * - Development:  human-readable lines printed to stdout
 * - Production:   newline-delimited JSON (parseable by Railway / Datadog / etc.)
 *
 * No external dependencies — keeps the package lean for a portfolio project.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
type Meta = Record<string, unknown>;

const DEV_ICONS: Record<Level, string> = {
  debug: 'DEBUGGING',
  info:  'INFO',
  warn:  'WARNING ',
  error: 'ERROR',
};

const isProd = (process.env.NODE_ENV || 'development') === 'production';

function emit(level: Level, meta: Meta, msg: string): void {
  if (isProd) {
    // Structured JSON — pipe to log aggregators as-is
    process.stdout.write(
      JSON.stringify({ time: new Date().toISOString(), level, msg, ...meta }) + '\n',
    );
  } else {
    const icon = DEV_ICONS[level];
    const extras = Object.keys(meta).length
      ? '  ' + JSON.stringify(meta)
      : '';
    console.log(`${icon} [${level.toUpperCase().padEnd(5)}] ${msg}${extras}`);
  }
}

export const logger = {
  debug: (meta: Meta, msg: string) => emit('debug', meta, msg),
  info:  (meta: Meta, msg: string) => emit('info',  meta, msg),
  warn:  (meta: Meta, msg: string) => emit('warn',  meta, msg),
  error: (meta: Meta, msg: string) => emit('error', meta, msg),
};
