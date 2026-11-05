import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchPeople, personSearchKey, personBranchKey, orderPeopleChoices} from '../components/ems/onboarding-person-search';
const rows = [
 {target:'a',name:'Ann Smith',department:'Blomore'},
 {target:'b',name:'Abel Stone',department:'Quality'},
 {target:'c',name:'Brad Pitt',department:'Production'},
 {target:'d',name:'Mary Brown',department:'Production'},
];
test('search matches names, never departments',()=>assert.deepEqual(searchPeople(rows,'b').map(p=>p.target),['c','d','b']));
test('full name prefix precedes surname prefix and internal matches',()=>assert.deepEqual(searchPeople(rows,'br').map(p=>p.target),['c','d']));
test('search normalizes case and spaces',()=>assert.equal(searchPeople(rows,'  BRAD   PITT ')[0]?.target,'c'));
test('no matches returns empty',()=>assert.deepEqual(searchPeople(rows,'Blomore'),[]));
test('blank search includes all without mutating input',()=>{const before=JSON.stringify(rows);assert.equal(searchPeople(rows,'').length,4);assert.equal(JSON.stringify(rows),before)});
test('same names retain distinct target identities',()=>assert.deepEqual(searchPeople([{...rows[0],target:'z'},{...rows[0],target:'a'}],'Ann').map(p=>p.target),['a','z']));
test('missing department keys normalize safely',()=>assert.equal(personSearchKey(null),''));
test('an exact name precedes a longer prefix even when its sorting order would differ',()=>{
 const candidates=[{target:'a',name:'Ann Marie',department:''},{target:'b',name:'Ann',department:''},{target:'c',name:'Mary Ann',department:''}];
 assert.deepEqual(searchPeople(candidates,'ann').map(p=>p.target),['b','a','c']);
});
test('branch labels use the same normalization as stored assignments without turning blanks into wildcards',()=>{
 assert.equal(personBranchKey(' Head - Office (Main) '),'headoffice');
 assert.equal(personBranchKey('Pipes / Profiles'),personBranchKey('Pipes Profiles'));
 assert.notEqual(personBranchKey(''),personBranchKey('Head Office'));
});
const brPeople = [
 {target:'lebron',name:'LeBron James',department:'Production',branch:'Film Division'},
 {target:'bruno',name:'Bruno Mars',department:'Division Management',branch:'Film Division'},
 {target:'brad',name:'Brad Pitt',department:'Production',branch:'Pipes & Profiles'},
 {target:'mary',name:'Mary Brown',department:'Production',branch:'Film Division'},
];
test('BR ranks Brad and Bruno before a surname prefix and LeBron across allowed branches',()=>{
 assert.deepEqual(orderPeopleChoices(brPeople,'BR','Production','Film Division').map(p=>p.target),['brad','bruno','mary','lebron']);
});
test('empty search browses same department/branch then same branch then other branches',()=>{
 const before=JSON.stringify(brPeople);
 assert.deepEqual(orderPeopleChoices(brPeople,' ','Production','Film Division').map(p=>p.target),['lebron','mary','bruno','brad']);
 assert.equal(JSON.stringify(brPeople),before);
});
test('name ranking does not include people removed by the branch eligibility filter',()=>{
 const allowed=brPeople.filter(p=>p.branch==='Film Division');
 assert.deepEqual(orderPeopleChoices(allowed,'BR','Production','Film Division').map(p=>p.target),['bruno','mary','lebron']);
});
