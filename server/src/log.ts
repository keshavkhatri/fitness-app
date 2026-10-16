/**
 * The `severity` Cloud Run's logging reads from a JSON log line: failures (`auth.email-failed`,
 * `...-failed`, `...error`) show as ERROR so a log-based alert can watch them, `*.warn` as WARNING,
 * everything else as INFO.
 */
export const severityOf = (event: string): 'ERROR' | 'WARNING' | 'INFO' => (/(failed|error)$/.test(event) ? 'ERROR' : /(^|[.-])warn$/.test(event) ? 'WARNING' : 'INFO');
