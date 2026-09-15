import test from "node:test";
import assert from "node:assert/strict";
import {cleanLegacyWechat,archiveGroups} from "../src/wechat-archive.ts";
import {defaultData} from "../src/core.ts";
import type {Article} from "../src/types.ts";
const a:Article={id:"rsdl:a",sourceId:"wechat-rsdl",kind:"wechat",title:"旧目录",content:"",url:"https://mp.weixin.qq.com/s/a",publishedAt:"",indexedAt:"2026-08-01T00:00:00Z",author:"RSDL",read:false,saved:false,contentScope:"link",provenance:"RSDL 公开目录"};
test("remove untouched catalogue while preserving user reading work",()=>{
  const d=defaultData();d.articles=[a,{...a,id:"body",content:"正文"},{...a,id:"saved",saved:true},{...a,id:"read",read:true},{...a,id:"manual",sourceId:"manual-wechat"}];
  assert.deepEqual(cleanLegacyWechat(d).articles.map(x=>x.id),["body","saved","read","manual"]);
  assert.deepEqual(cleanLegacyWechat(cleanLegacyWechat(d)),cleanLegacyWechat(d));
});
test("archive sorts by actual import/read times, never upstream indexing dates",()=>{
  const old={...a,id:"old",read:true}, early={...a,id:"early",importedAt:"2026-09-01T12:00:00Z"},late={...a,id:"late",importedAt:"2026-09-02T12:00:00Z",read:true,readAt:"2026-09-03T12:00:00Z"};
  const imports=archiveGroups([old,early,late],"imported");assert.equal(imports[0][1][0].id,"late");assert.equal(imports.at(-1)?.[0],"时间未记录");
  const reads=archiveGroups([old,early,late],"read");assert.equal(reads.flatMap(x=>x[1]).length,2);assert.equal(reads[0][1][0].id,"late");
});
