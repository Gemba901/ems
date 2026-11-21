import { Injectable, Logger } from '@nestjs/common';
import { TaskSourceModule, TaskStatus } from 'db';

// A person changed the status of a source-linked task instance in DWMS (ticked it, marked it
// partly done, had it approved or sent back). The owning module listens and updates its own
// record: a 5S routine completion, a corrective step ticked off, ...
export interface DwmsTaskStatusChange {
  taskInstanceId: string;
  taskId: string;
  sourceModule: TaskSourceModule;
  sourceId: string;
  sourceParentId: string | null;
  ownerId: string;
  scheduledFor: Date;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  actorId: string | null;
  note: string | null;
}

type Handler = (change: DwmsTaskStatusChange) => Promise<unknown> | unknown;

// "Completion flows back" half of the module integration. Source modules import DwmsModule, so
// DWMS can't call them directly (that would be a circular import); they subscribe here instead.
// The bridge's own writes (close / reopen / deactivate from source) never publish, so a change
// that started in the source module doesn't loop back to it.
@Injectable()
export class DwmsTaskEvents {
  private readonly logger = new Logger(DwmsTaskEvents.name);
  private readonly handlers = new Map<TaskSourceModule, Handler[]>();

  onStatusChange(sourceModule: TaskSourceModule, handler: Handler) {
    this.handlers.set(sourceModule, [...(this.handlers.get(sourceModule) ?? []), handler]);
  }

  // Handlers run after the DWMS change is saved and never fail it; a handler that throws is logged.
  async publish(change: DwmsTaskStatusChange) {
    for (const handler of this.handlers.get(change.sourceModule) ?? []) {
      try {
        await handler(change);
      } catch (error) {
        this.logger.error(
          `${change.sourceModule} handler failed for task instance ${change.taskInstanceId}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }
}
