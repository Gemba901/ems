import { WorkTaskStatus } from 'db';

// Frozen at completion and stored in WorkSprint.completionSnapshot; never recalculated.
// Bump `version` if the shape ever changes so old snapshots stay readable.
export type SprintCompletionSnapshot = {
    version: 1;
    completedAt: string;
    totalCount: number;
    completedCount: number;
    tasks: {
        id: string;
        title: string;
        status: WorkTaskStatus;
        assigneeId: string | null;
        assigneeName: string | null;
    }[];
};

export function buildSprintSnapshot(
    completedAt: Date,
    tasks: { id: string; title: string; status: WorkTaskStatus; assignee: { id: string; name: string } | null }[],
): SprintCompletionSnapshot {
    return {
        version: 1,
        completedAt: completedAt.toISOString(),
        totalCount: tasks.length,
        completedCount: tasks.filter((t) => t.status === WorkTaskStatus.DONE).length,
        tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            assigneeId: t.assignee?.id ?? null,
            assigneeName: t.assignee?.name ?? null,
        })),
    };
}

// Percentage of tasks done; 0 for an empty sprint instead of dividing by zero.
export function completionPercent(snapshot: Pick<SprintCompletionSnapshot, 'totalCount' | 'completedCount'>): number {
    return snapshot.totalCount === 0 ? 0 : Math.round((snapshot.completedCount / snapshot.totalCount) * 100);
}
