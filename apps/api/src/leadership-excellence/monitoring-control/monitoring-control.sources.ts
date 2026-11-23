// Area 05 reads 03 and 04 only through these tokens, never through their tables.
// Both are bound to MonitoringExecutionSource (monitoring-control.execution-source.ts).
export const MONITORING_PLANNING_SOURCE = Symbol('MONITORING_PLANNING_SOURCE');
export const MONITORING_EXECUTION_SOURCE = Symbol(
  'MONITORING_EXECUTION_SOURCE',
);
