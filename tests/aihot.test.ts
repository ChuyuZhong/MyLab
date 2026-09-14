import test from "node:test";
import assert from "node:assert/strict";
import {aihotPath,createAihotClient,type AihotQuery} from "../src/aihot.ts";
const q:AihotQuery={view:"selected",window:"24h",category:"paper",keyword:"遥感",date:""};
test("AIHOT queries retain explicit filters and reject short search terms",()=>{
  const u=new URL(aihotPath(q),"https://aihot.news");
  assert.equal(u.searchParams.get("category"),"paper");assert.equal(u.searchParams.get("q"),"遥感");assert.equal(u.searchParams.get("by"),"published");
  assert.throws(()=>aihotPath({...q,keyword:"X"}));
  assert.equal(aihotPath({...q,view:"daily",date:"2026-09-14"}),"/dailies/2026-09-14");
  assert.equal(aihotPath({...q,view:"hot"}),"/hot-topics");
});
test("AIHOT reuses fresh results and validates unchanged responses with ETag",async()=>{
  let time=100000,calls=0;
  const client=createAihotClient((async(_u,init)=>{
    calls++;if(calls===1)return Response.json({schemaVersion:1,items:[]},{headers:{ETag:'"a"',"Cache-Control":"s-maxage=60"}});
    assert.equal((init?.headers as Record<string,string>)["If-None-Match"],'"a"');
    return new Response(null,{status:304});
  }) as typeof fetch,()=>time);
  await client("/items?mode=selected");await client("/items?mode=selected");assert.equal(calls,1);
  time+=61000;const r=await client("/items?mode=selected");assert.equal(calls,2);assert.equal(r.unchanged,true);assert.deepEqual(r.data.items,[]);
});
test("AIHOT Retry-After blocks even a different query until the deadline",async()=>{
  let calls=0,time=100000;
  const client=createAihotClient((async()=>{calls++;return new Response(null,{status:429,headers:{"Retry-After":"120"}});}) as typeof fetch,()=>time);
  await assert.rejects(client("/items?x"));await assert.rejects(client("/hot-topics"));assert.equal(calls,1);
  time+=121000;await assert.rejects(client("/hot-topics"));assert.equal(calls,2);
});
test("AIHOT does not present unexpected response bodies as news",async()=>{
  const client=createAihotClient((async()=>Response.json({schemaVersion:2,items:[]})) as typeof fetch);
  await assert.rejects(client("/hot-topics"),/格式已变化/);
});
