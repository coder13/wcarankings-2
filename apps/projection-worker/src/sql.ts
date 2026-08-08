export function setSessionMaxStatementTimeSql(seconds: number): string {
  return `SET SESSION max_statement_time = ${seconds}`;
}
