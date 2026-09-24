import {describe,expect,it} from 'vitest';
import {readCrmResponse} from './client-response';
describe('CRM refresh response boundary',()=>{
 it.each(['','{','{}','null','[]'])('rejects a successful incomplete dashboard %s',async body=>{
  await expect(readCrmResponse(new Response(body),'/api/crm/jobs')).rejects.toThrow('previous data has been kept');
 });
 it('accepts complete dashboards and keeps API errors available to the auth handler',async()=>{
  const data={summary:{openJobs:1},jobs:[],quotes:[],bookkeepingRows:[]};
  expect(await readCrmResponse(Response.json(data),'/api/crm/jobs')).toEqual(data);
  expect(await readCrmResponse(Response.json({message:'Sign in'},{status:401}),'/api/crm/jobs')).toEqual({message:'Sign in'});
 });
 it('accepts the distinct active snapshot and mutation response shapes',async()=>{
  expect(await readCrmResponse(Response.json({items:[]}),'/api/crm/jobs?scope=active')).toEqual({items:[]});
  expect(await readCrmResponse(Response.json({job:{id:'created'}}),'/api/crm/jobs','POST')).toEqual({job:{id:'created'}});
  expect(await readCrmResponse(Response.json({matched:3}),'/api/crm/order-cogs/pull')).toEqual({matched:3});
 });
});
