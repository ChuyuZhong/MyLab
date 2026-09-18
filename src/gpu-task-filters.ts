export type TaskColumn='state'|'id'|'user'|'pool'|'startTime';
export type FilterTask={state:string;id:string;description:string;user:string;pool:string;startTime:string};
export type TaskFilters=Partial<Record<TaskColumn,string[]|null>>;
export const taskColumns:{key:TaskColumn;label:string}[]=[{key:'state',label:'状态'},{key:'id',label:'任务 / ID'},{key:'user',label:'用户'},{key:'pool',label:'资源池'},{key:'startTime',label:'开始日期'}];
export function taskValue(t:FilterTask,column:TaskColumn){
 if(column!=='startTime')return t[column]||'';
 const d=new Date(t.startTime);if(!t.startTime||!Number.isFinite(d.getTime()))return '';
 return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
export function matchesTaskFilters(t:FilterTask,filters:TaskFilters){return taskColumns.every(({key})=>filters[key]==null||filters[key]!.includes(taskValue(t,key)));}
export function taskFilterOptions(tasks:FilterTask[],column:TaskColumn,selected?:string[]|null){
 const options=new Map<string,string>();
 for(const t of tasks){const value=taskValue(t,column);options.set(value,column==='id'?`${t.description||'未命名任务'} · ${t.id}`:value||'未提供');}
 for(const value of selected||[])if(!options.has(value))options.set(value,(value||'未提供')+'（当前列表无记录）');
 return [...options].map(([value,label])=>({value,label})).sort((a,b)=>column==='startTime'?b.value.localeCompare(a.value):a.label.localeCompare(b.label,'zh-CN'));
}
