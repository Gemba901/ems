import {createPersonSuggester} from './onboarding-person-suggestions';
const grace={target:'employee:g',name:'Grace Muthoni Wanjiru',designation:'Director',employeeCode:'G1'};
describe('scoped, cached people suggestions',()=>{
 it.each(['Grace Wanjiku','Grace WanjikuQ'])('suggests %s with matching title and unchanged name word',name=>{
  const result=createPersonSuggester([grace])(name,'Director');expect(result).toHaveLength(1);expect(result[0].suggestionReasons[0]).toMatch(/spelling/);
 });
 it('keeps all plausible candidates distinct',()=>expect(createPersonSuggester([grace,{...grace,target:'employee:other',employeeCode:'G2'}])('Grace Wanjiku','Director')).toHaveLength(2));
 it('offers an exact name despite different designation',()=>expect(createPersonSuggester([grace])(grace.name,'Manager')[0].suggestionReasons).toContain('Job title differs — check the imported and recorded values'));
 it('preserves Unicode names and does not erase accents',()=>{
  const p={...grace,name:'Élodie Kamau'};expect(createPersonSuggester([p])('Élodie Kamau','Manager')).toHaveLength(1);
  expect(createPersonSuggester([p])('Elodie Kamau','Manager')).toHaveLength(0);
 });
 it.each(['Grace','G Wanjiru','N/A','','Someone Completely Different'])('does not guess from %s',name=>expect(createPersonSuggester([grace])(name,'Director')).toEqual([]));
 it('does not suggest unavailable people or missing recorded designations',()=>expect(createPersonSuggester([{...grace,unavailable:true},{...grace,target:'record:x',designation:'N/A'}])('Grace Wanjiru','Director')).toEqual([]));
 it('does not mutate or select input and caches repeated imported names',()=>{const before=JSON.stringify(grace);const suggest=createPersonSuggester([grace]);expect(suggest('Grace Wanjiru','Director')).toBe(suggest('Grace Wanjiru','Director'));expect(JSON.stringify(grace)).toBe(before)});
 it('never uses matching title alone as identity evidence',()=>expect(createPersonSuggester([grace])('Mary Smith','Director')).toEqual([]));
 it('does not run unbounded edit-distance work on long names',()=>expect(createPersonSuggester([{...grace,name:'Grace '+ 'A'.repeat(1000)}])('Grace '+ 'A'.repeat(999)+'B','Director')).toEqual([]));
});
