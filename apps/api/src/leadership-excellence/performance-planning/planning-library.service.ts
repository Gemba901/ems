import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Pillar } from './planning.types';
import type { PlanningLibraryKind } from './dto/planning-library-query.dto';

export interface PlanningLibraryTemplate {
  id: string;
  kind: PlanningLibraryKind;
  title: string;
  pillar: Pillar;
  category?: 'S' | 'W' | 'O' | 'T';
  department?: string;
  sourceCode: string;
  sourceSheet: string;
  sourceRow: number;
  ownerRole?: string;
  parentObjectiveCode?: string;
  parentObjectiveTitle?: string;
  fields: Record<string, unknown>;
  notes: string[];
  version: number;
}

// Only reusable draft content may leave the shared catalogue. Real record IDs,
// organisation ownership, actual source/parent links and approval state belong
// to each organisation's planning workspace, never to a reusable example.
const editableFields: Record<PlanningLibraryKind, readonly string[]> = {
  finding: [
    'title',
    'pillar',
    'category',
    'explanation',
    'evidence',
    'impact',
    'alignments',
    'alignment',
    'otherBusinessFocus',
    'weightage',
    'priority',
    'response',
  ],
  objective: [
    'title',
    'result',
    'pillar',
    'alignments',
    'alignment',
    'otherBusinessFocus',
    'measure',
    'definition',
    'baseline',
    'target',
    'unit',
    'direction',
    'selectionReason',
    'sourceRationale',
  ],
  'department-goal': [
    'title',
    'measure',
    'definition',
    'baseline',
    'target',
    'unit',
    'direction',
    'approach',
    'relevance',
    'source',
  ],
};

@Injectable()
export class PlanningLibraryService {
  constructor(private readonly db: PrismaService) {}

  /** The controller checks tenant/module access; the catalogue itself is global.
   * Reading templates never creates a workspace, seeds records or saves a draft.
   */
  async list(kind: PlanningLibraryKind): Promise<PlanningLibraryTemplate[]> {
    const rows = await this.db.lexPlanningLibraryTemplate.findMany({
      where: { kind, active: true },
      orderBy: [{ sourceRow: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        pillar: true,
        category: true,
        department: true,
        sourceCode: true,
        sourceSheet: true,
        sourceRow: true,
        ownerRole: true,
        parentObjectiveCode: true,
        parentObjectiveTitle: true,
        fields: true,
        notes: true,
        version: true,
      },
    });
    return rows.map((row) => {
      const content =
        row.fields &&
        typeof row.fields === 'object' &&
        !Array.isArray(row.fields)
          ? row.fields
          : {};
      return {
        id: row.id,
        kind,
        title: row.title,
        pillar: row.pillar as Pillar,
        ...(row.category
          ? { category: row.category as PlanningLibraryTemplate['category'] }
          : {}),
        ...(row.department ? { department: row.department } : {}),
        sourceCode: row.sourceCode,
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        ...(row.ownerRole ? { ownerRole: row.ownerRole } : {}),
        ...(row.parentObjectiveCode
          ? { parentObjectiveCode: row.parentObjectiveCode }
          : {}),
        ...(row.parentObjectiveTitle
          ? { parentObjectiveTitle: row.parentObjectiveTitle }
          : {}),
        fields: structuredClone(
          Object.fromEntries(
            editableFields[kind]
              .filter((key) => Object.hasOwn(content, key))
              .map((key) => [key, content[key]]),
          ),
        ),
        notes: [...row.notes],
        version: row.version,
      };
    });
  }
}
