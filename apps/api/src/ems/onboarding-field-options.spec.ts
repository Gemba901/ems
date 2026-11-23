import { onboardingNameIssue } from './onboarding-name-rule';
import { departmentIndex, departmentIssue, onboardingFieldOptions } from './onboarding-field-options';

describe('onboarding name letters', () => {
  it.each(['Jo', 'Li', "O’Neil", 'Anne-Marie', 'عبد', '李明', 'Éa', 'E\u0301a'])('accepts %s', value => {
    expect(onboardingNameIssue(value)).toBeNull();
  });
  it.each(['J', ' J. ', 'J -', 'E\u0301', '𐐀', '12', '😀', '王'])('does not count padding/marks as a second letter: %s', value => {
    expect(onboardingNameIssue(value)).toBe('Enter at least 2 letters.');
  });
  it.each([undefined, null, '', '   '])('keeps empty required: %s', value => expect(onboardingNameIssue(value)).toBe('Required'));
});

describe('organisation choices', () => {
  it('flags equivalent departments instead of silently picking an ID', () => {
    const departments = [{id:'one',name:'Quality'}, {id:'two',name:' QUALITY '}, {id:'three',name:'Production'}];
    const options = onboardingFieldOptions(departments, [], []);
    expect(options.departments.filter(d => d.usable)).toEqual([{name:'Production',usable:true}]);
    expect(departmentIssue('Quality', departmentIndex(departments))).toContain('uniquely');
  });
  it('requires an actual department but accepts its existing presentation aliases', () => {
    const index = departmentIndex([{id:'one',name:'Quality Assurance'}]);
    expect(departmentIssue(' quality-assurance ', index)).toBeNull();
    expect(departmentIssue('Unknown', index)).toContain('No department');
    expect(departmentIssue('Nil', index)).toBe('Required');
  });
  it('deduplicates titles, labels their sources, skips exclusions and retains new import titles', () => {
    const value = onboardingFieldOptions([], [{jobTitle:'Inspector',department:{name:'Quality'}}], [
      {jobDesignation:' inspector ', currentDepartment:'Production',status:'READY'},
      {jobDesignation:'New title',currentDepartment:'Quality',status:'DRAFT'},
      {jobDesignation:'Excluded title',status:'EXCLUDED'}, {jobDesignation:'N/A'}, {jobDesignation:'nil'},
    ]);
    expect(value.designations).toEqual([
      {value:'Inspector',departments:['Production','Quality'],existing:true,imported:true},
      {value:'New title',departments:['Quality'],existing:false,imported:true},
    ]);
  });
  it('does not erase punctuation/accents that distinguish titles', () => {
    const value = onboardingFieldOptions([], [{jobTitle:'C++ Lead'}, {jobTitle:'C Lead'}, {jobTitle:'Équipe'}], []);
    expect(value.designations).toHaveLength(3);
  });
  it('does not mutate input and gives stable choices across row/query order', () => {
    const departments = [{id:'b',name:'Quality'}, {id:'a',name:'Finance'}];
    const employees = [{jobTitle:'inspector'}, {jobTitle:'Inspector'}];
    const before = JSON.stringify({departments,employees});
    expect(onboardingFieldOptions(departments, employees, [])).toEqual(onboardingFieldOptions([...departments].reverse(), [...employees].reverse(), []));
    expect(JSON.stringify({departments,employees})).toBe(before);
  });
});
