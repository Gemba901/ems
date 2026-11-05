import { recordedHodSuggestions } from './onboarding-hod-suggestions';
import { LinkPerson, scopeKey } from './onboarding-people-links';

const surya: LinkPerson = {target:'employee:surya', name:'Surya Pareek', designation:'Chief Executive Officer', department:'Executive Management', branch:'Head Office', employeeCode:'1000'};
const rodgers: LinkPerson = {...surya,target:'employee:rodgers', name:'Rodgers Munene', designation:'Chief Operating Officer', employeeCode:'1001'};
const profile = (extra = {}) => ({departmentId:'executive',plantBranch:'Head Office',hodName:'Surya Pareek',hodDesignation:'Chief Executive Officer',...extra});
const key = scopeKey('executive','headoffice');

test('existing recorded HOD text yields a candidate with source count, not an assignment',()=>{
 const source=[profile(),profile()], before=JSON.stringify(source);
 const suggestions=recordedHodSuggestions(source,[surya,rodgers]).get(key)!;
 expect(suggestions.map(p=>p.target)).toEqual(['employee:surya']);
 expect(suggestions[0].suggestionReasons[0]).toMatch(/2 existing employee profiles/);
 expect(JSON.stringify(source)).toBe(before);
});
test('same department in another branch and missing branch have separate evidence',()=>{
 const suggestions=recordedHodSuggestions([profile(),profile({plantBranch:'Pipes and Profiles',hodName:rodgers.name,hodDesignation:rodgers.designation}),profile({plantBranch:null,hodName:rodgers.name})],[surya,rodgers]);
 expect(suggestions.get(key)?.map(p=>p.target)).toEqual(['employee:surya']);
 expect(suggestions.get(scopeKey('executive','pipesandprofiles'))?.map(p=>p.target)).toEqual(['employee:rodgers']);
 expect(suggestions.get(scopeKey('executive',''))?.map(p=>p.target)).toEqual(['employee:rodgers']);
});
test('conflicting recorded heads stay separate suggestions; no majority is silently selected',()=>{
 const result=recordedHodSuggestions([profile(),profile(),profile({hodName:rodgers.name,hodDesignation:rodgers.designation})],[surya,rodgers]).get(key)!;
 expect(new Set(result.map(p=>p.target))).toEqual(new Set([surya.target,rodgers.target]));
});
test('missing or differing title produces review hints without losing the recorded person',()=>{
 for(const title of [null,'Director']){
  const result=recordedHodSuggestions([profile({hodDesignation:title})],[surya]).get(key)!;
  expect(result[0].target).toBe(surya.target);expect(result[0].suggestionReasons.join(' ')).toMatch(/job title is missing|Job title differs/);
 }
});
test('title alone, placeholders and missing department do not guess a head',()=>{
 for(const entry of [profile({hodName:null}),profile({hodName:'N/A'}),profile({departmentId:null})])
  expect(recordedHodSuggestions([entry],[surya,rodgers]).size).toBe(0);
});
test('same names remain multiple candidates and unavailable or pending records are omitted',()=>{
 const other={...surya,target:'employee:other',employeeCode:'2000'};
 const result=recordedHodSuggestions([profile()],[surya,other,{...surya,target:'record:pending'},{...surya,target:'employee:unavailable',unavailable:true}]).get(key)!;
 expect(result.map(p=>p.target).sort()).toEqual(['employee:other','employee:surya']);
});
test('spelling hints still require corroborating title and an unchanged name word',()=>{
 const grace={...surya,target:'employee:grace',name:'Grace Wanjiru',designation:'Director'};
 expect(recordedHodSuggestions([profile({hodName:'Grace Wanjiku',hodDesignation:'Director'})],[grace]).get(key)?.[0].suggestionReasons.join(' ')).toMatch(/Possible spelling match/);
 expect(recordedHodSuggestions([profile({hodName:'Grace Wanjiku',hodDesignation:'Inspector'})],[grace]).get(key)).toEqual([]);
});
