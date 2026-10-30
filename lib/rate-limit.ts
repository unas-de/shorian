const attempts=new Map<string,{count:number;reset:number}>();
export function allowLogin(key:string){const now=Date.now();if(attempts.size>10000)for(const [k,v] of attempts)if(v.reset<now)attempts.delete(k);const item=attempts.get(key);if(!item||item.reset<now){attempts.set(key,{count:1,reset:now+600000});return true}item.count++;return item.count<=15;}
