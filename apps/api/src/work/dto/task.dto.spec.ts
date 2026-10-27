import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTaskDto, UpdateTaskDto } from './task.dto';

describe('task write validation', () => {
  it('requires a positive integer version for updates', async () => {
    for (const expectedVersion of [undefined, null, 0, 1.5, '1']) {
      const errors = await validate(plainToInstance(UpdateTaskDto, { expectedVersion, title: 'Task' }));
      expect(errors.some((e) => e.property === 'expectedVersion')).toBe(true);
    }
    expect(await validate(plainToInstance(UpdateTaskDto, { expectedVersion: 1, priority: 'HIGH' }))).toHaveLength(0);
  });
  it('allows the default priority but rejects invalid and null priorities', async () => {
    expect(await validate(plainToInstance(CreateTaskDto, { title: 'Task' }))).toHaveLength(0);
    for (const priority of [null, 'INVALID']) {
      expect((await validate(plainToInstance(CreateTaskDto, { title: 'Task', priority }))).some((e) => e.property === 'priority')).toBe(true);
      expect((await validate(plainToInstance(UpdateTaskDto, { expectedVersion: 1, priority }))).some((e) => e.property === 'priority')).toBe(true);
    }
  });
});
