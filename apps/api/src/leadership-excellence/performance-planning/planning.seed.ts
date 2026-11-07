import type { PlanningState } from './planning.types';

// Reference examples, not company commitments or a second KRA/KPI master.
// Replace this catalogue adapter with Area 07's approved library when available.
export function emptyPlanningState(): PlanningState {
  return {
    schema: 1,
    sequence: 0,
    documents: [],
    kras: [
      { id: 'ref-kra-quality', code: 'REF-KRA-001', name: 'Product quality' },
      {
        id: 'ref-kra-efficiency',
        code: 'REF-KRA-002',
        name: 'Manufacturing efficiency',
      },
      { id: 'ref-kra-people', code: 'REF-KRA-003', name: 'Skills development' },
    ],
    definitions: [
      {
        id: 'ref-kpi-rejection',
        code: 'REF-KPI-001',
        kraId: 'ref-kra-quality',
        name: 'Rejection rate',
        meaning:
          'Rejected units divided by inspected units in the same period and scope.',
        unit: '%',
        direction: 'LOWER',
        formula: 'PERCENT',
        inputA: 'Rejected units',
        inputB: 'Inspected units',
        aggregation: 'RATIO',
        source: 'REFERENCE',
      },
      {
        id: 'ref-kpi-cost',
        code: 'REF-KPI-002',
        kraId: 'ref-kra-efficiency',
        name: 'Manufacturing cost per accepted unit',
        meaning:
          'Agreed manufacturing cost divided by accepted units. Define the included cost scope.',
        unit: 'KES/unit',
        direction: 'LOWER',
        formula: 'RATIO',
        inputA: 'Manufacturing cost',
        inputB: 'Accepted units',
        aggregation: 'RATIO',
        source: 'REFERENCE',
      },
      {
        id: 'ref-kpi-downtime',
        code: 'REF-KPI-003',
        kraId: 'ref-kra-efficiency',
        name: 'Unplanned downtime',
        meaning: 'Unplanned downtime for the agreed equipment and period.',
        unit: 'hours',
        direction: 'LOWER',
        formula: 'DIRECT',
        inputA: 'Downtime hours',
        inputB: '',
        aggregation: 'SUM',
        source: 'REFERENCE',
      },
      {
        id: 'ref-kpi-skills',
        code: 'REF-KPI-004',
        kraId: 'ref-kra-people',
        name: 'Employees meeting the skill standard',
        meaning:
          'Employees assessed as competent divided by employees requiring assessment.',
        unit: '%',
        direction: 'HIGHER',
        formula: 'PERCENT',
        inputA: 'Competent employees',
        inputB: 'Employees requiring assessment',
        aggregation: 'RATIO',
        source: 'REFERENCE',
      },
    ],
  };
}
