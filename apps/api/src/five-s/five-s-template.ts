import { FiveSAuditTemplate, FiveSPractice } from 'db';

// The production/shopfloor 5S checksheet: 20 checkpoints, four under each S.
// Wording is fixed by the 20 Keys workbook; do not edit it without adding a new template.
// The web app keeps a copy in apps/web/lib/five-s/template.ts — keep the two identical.

export type FiveSCheckpoint = { no: number; practice: FiveSPractice; text: string };

export const PRACTICE_ORDER: readonly FiveSPractice[] = [
    FiveSPractice.SORT,
    FiveSPractice.SET_IN_ORDER,
    FiveSPractice.SHINE,
    FiveSPractice.STANDARDIZE,
    FiveSPractice.SUSTAIN,
];

export const PRACTICE_LABELS: Record<FiveSPractice, string> = {
    SORT: 'Sort',
    SET_IN_ORDER: 'Set in Order',
    SHINE: 'Shine',
    STANDARDIZE: 'Standardize',
    SUSTAIN: 'Sustain',
};

export const TEMPLATE_LABELS: Record<FiveSAuditTemplate, string> = {
    PRODUCTION_SHOPFLOOR_V1: 'Production / shopfloor 5S checksheet (20 checkpoints, abnormality location count)',
};

export const CURRENT_TEMPLATE = FiveSAuditTemplate.PRODUCTION_SHOPFLOOR_V1;

export const PRODUCTION_SHOPFLOOR_CHECKPOINTS: readonly FiveSCheckpoint[] = [
    { no: 1, practice: 'SORT', text: 'Unwanted, unnecessary, obsolete, scrap, or rejected items are present or mixed with required items.' },
    { no: 2, practice: 'SORT', text: 'Broken, damaged, expired, or unused tools, equipment, fixtures, or materials are kept without a clear need or disposal action.' },
    { no: 3, practice: 'SORT', text: 'Old, unused, or unnecessary items are stored inside drawers, cupboards, shelves, bins, or racks instead of being removed.' },
    { no: 4, practice: 'SORT', text: 'Personal belongings, food items, or other unrelated and non-work items are kept in the work or production area.' },
    { no: 5, practice: 'SET_IN_ORDER', text: 'Tools, materials, documents, gauges, jigs, or fixtures are not kept or returned to their defined and easily accessible locations.' },
    { no: 6, practice: 'SET_IN_ORDER', text: 'Items, bins, racks, shelves, drawers, or storage locations have missing, unclear, damaged, or incorrect identification.' },
    { no: 7, practice: 'SET_IN_ORDER', text: 'PEEP is not fully implemented, and shadow boards or point-of-use storage are not provided or properly used where required.' },
    { no: 8, practice: 'SET_IN_ORDER', text: 'Walkways, access points, operating spaces, or material movement paths are blocked, unclear, or poorly arranged, causing difficulty or extra movement.' },
    { no: 9, practice: 'SHINE', text: 'Dust, dirt, oil, waste, spills, chips, or other contamination are visible on floors, walls, ceilings, corners, or surrounding areas.' },
    { no: 10, practice: 'SHINE', text: 'Areas on top of, behind, underneath, or inside machines, tables, racks, or equipment are unclean.' },
    { no: 11, practice: 'SHINE', text: 'Machines, panels, worktables, trolleys, racks, or fixtures have dents, scratches, tape marks, loose parts, damage, or poor paint condition.' },
    { no: 12, practice: 'SHINE', text: 'Leakage, seepage, stains, rust, build-up, dirty cleaning tools, or overflowing waste points are not attended to.' },
    { no: 13, practice: 'STANDARDIZE', text: 'Required 5S standards, standard photographs, safety signs, visual controls, instructions, or displays are missing, damaged, or outdated.' },
    { no: 14, practice: 'STANDARDIZE', text: 'Labels, colour codes, floor markings, borders, shadow boards, or identification methods do not follow the defined standard.' },
    { no: 15, practice: 'STANDARDIZE', text: 'Similar items, machines, workstations, or storage locations are arranged, identified, cleaned, or maintained differently rather than following a single standard.' },
    { no: 16, practice: 'STANDARDIZE', text: 'The method, frequency, or responsibility for cleaning, inspection, storage, replenishment, or checking is not clearly displayed.' },
    { no: 17, practice: 'SUSTAIN', text: 'Previous 5S problems are repeated or remain open beyond the target date without visible corrective action or proper closure.' },
    { no: 18, practice: 'SUSTAIN', text: 'Audit records, action follow-ups, review boards, training records, or status updates are missing, outdated, or not regularly reviewed.' },
    { no: 19, practice: 'SUSTAIN', text: '5S ownership, routine responsibilities, and checking frequency are unclear for the area, machine, rack, workstation, or activity.' },
    { no: 20, practice: 'SUSTAIN', text: 'The 5S discipline is not consistently followed; for example, items are not returned to designated places, markings are ignored, bins overflow, and standards are bypassed.' },
];

export function checkpointsFor(template: FiveSAuditTemplate): readonly FiveSCheckpoint[] {
    switch (template) {
        case FiveSAuditTemplate.PRODUCTION_SHOPFLOOR_V1:
            return PRODUCTION_SHOPFLOOR_CHECKPOINTS;
    }
}

export function checkpointOrThrow(template: FiveSAuditTemplate, no: number): FiveSCheckpoint {
    const checkpoint = checkpointsFor(template).find((c) => c.no === no);
    if (!checkpoint) throw new Error(`Unknown checkpoint ${no}`);
    return checkpoint;
}
