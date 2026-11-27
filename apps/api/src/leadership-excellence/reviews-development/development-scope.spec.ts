import { Role } from 'src/common/enum/role.enum';
import {
  canAssessAction,
  canReadReview,
  canSeeAction,
  canSeeMetadata,
  validDate,
} from './development-scope';
import { PEOPLE, action, actor } from './development.fixtures.spec-helper';

const personal = {
  type: 'PERSONAL' as const,
  subjectId: 'emp-1',
  reviewerId: 'mgr-1',
  departmentId: 'dept-1',
};
const department = {
  ...personal,
  type: 'DEPARTMENT' as const,
  reviewerId: 'emp-1',
};

describe('Area 06 visibility', () => {
  it('keeps personal review content to its two participants', () => {
    expect(canReadReview(actor('emp-1'), personal)).toBe(true);
    expect(canReadReview(actor('mgr-1'), personal)).toBe(true);
    // Manager of the subject, HOD and admins see that it exists, not what it says.
    const hod = actor('hod-1', { role: Role.HOD });
    const admin = actor(null, { role: Role.SUPER_ADMIN });
    const boss = actor('x', { reportIds: new Set(['emp-1']) });
    for (const a of [hod, admin, boss]) {
      expect(canSeeMetadata(a, personal)).toBe(true);
      expect(canReadReview(a, personal)).toBe(false);
    }
    expect(canSeeMetadata(actor('other'), personal)).toBe(false);
  });

  it('lets managers, the HOD and org-wide roles read department reviews', () => {
    expect(
      canReadReview(actor('x', { reportIds: new Set(['emp-1']) }), department),
    ).toBe(true);
    expect(canReadReview(actor('h', { role: Role.HOD }), department)).toBe(
      true,
    );
    expect(
      canReadReview(
        actor('h', { role: Role.HOD, departmentId: 'dept-2' }),
        department,
      ),
    ).toBe(false);
    expect(canReadReview(actor('other'), department)).toBe(false);
  });

  it('only lets an independent checker assess effectiveness', () => {
    const a = action({
      ownerId: 'emp-1',
      checkedById: 'chk',
      goalOwnerId: 'gown',
    });
    expect(canAssessAction(actor('emp-1'), a, PEOPLE)).toBe(false); // owner
    expect(canAssessAction(actor('chk'), a, PEOPLE)).toBe(true); // completion checker
    expect(canAssessAction(actor('mgr-1'), a, PEOPLE)).toBe(true); // owner's manager
    expect(canAssessAction(actor('gown'), a, PEOPLE)).toBe(true); // goal owner
    expect(canAssessAction(actor('h', { role: Role.HOD }), a, PEOPLE)).toBe(
      true,
    );
    expect(canAssessAction(actor('other'), a, PEOPLE)).toBe(false);
    expect(canAssessAction(actor('chk', { active: false }), a, PEOPLE)).toBe(
      false,
    );
    // Org-wide roles may read but are not checkers by role alone.
    expect(
      canAssessAction(actor(null, { role: Role.SUPER_ADMIN }), a, PEOPLE),
    ).toBe(false);
    expect(canSeeAction(actor(null, { role: Role.MANAGEMENT }), a)).toBe(true);
  });

  it('validates dates strictly', () => {
    expect(validDate('2026-02-28')).toBe(true);
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('26-1-1')).toBe(false);
  });
});
