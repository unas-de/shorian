// Run against an isolated production build, never against a real-patient database.
import {spawn} from 'node:child_process';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const cwd=process.env.VERIFY_PROJECT||'/tmp/shorian-login-verification';
const processes=[];let proxy,browser;let appOutput='';
function start(port,env){const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});processes.push(child);for(const pipe of [child.stdout,child.stderr])pipe.on('data',x=>{appOutput+=x.toString()});return child}
async function ready(url){for(let n=0;n<100;n++){try{const r=await fetch(url);if(r.ok)return}catch{}await delay(200)}throw new Error('Isolated test server did not become ready')}
try{
 start(3110,{DEMO_MODE:'true',SESSION_SECURE:'false',APP_ORIGIN:'http://localhost:3111',DATABASE_PATH:cwd+'/.data/demo/postgres'});
 await ready('http://127.0.0.1:3110/api/auth/config');
 proxy=http.createServer((req,res)=>{const upstream=http.request({host:'127.0.0.1',port:3110,path:req.url,method:req.method,headers:{...req.headers,host:'internal.test:3110'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream)});
 await new Promise(resolve=>proxy.listen(3111,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();const problems=[];page.on('pageerror',e=>problems.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydrat|didn't match/i.test(m.text()))problems.push(m.text())});
 await page.addInitScript(()=>{const apply=()=>{if(document.documentElement){document.documentElement.setAttribute('data-scribe-recorder-ready','true');observer.disconnect()}};const observer=new MutationObserver(apply);observer.observe(document,{childList:true,subtree:true});apply()});
 await page.goto('http://localhost:3111');
 await page.getByRole('button',{name:'تجربة النظام',exact:true}).click();
 await page.locator('select[name=role]').selectOption('receptionist');
 await page.getByRole('button',{name:'الدخول إلى العيادة',exact:true}).click();
 await page.getByRole('heading',{name:'نظرة على يوم العيادة'}).waitFor({timeout:60000});
 assert.equal(await page.locator('html').getAttribute('data-scribe-recorder-ready'),'true');
 await page.reload();await page.getByRole('heading',{name:'نظرة على يوم العيادة'}).waitFor();
 const rejected=await page.request.post('http://localhost:3111/api/auth/demo',{headers:{origin:'https://attacker.invalid'},data:{role:'doctor',clinic:'1'}});
 assert.equal(rejected.status(),403);assert.equal((await rejected.json()).error,'REQUEST_ORIGIN_REJECTED');
 assert.deepEqual(problems,[]);
 start(3112,{DEMO_MODE:'false',SESSION_SECURE:'false',APP_ORIGIN:'http://127.0.0.1:3112',DATABASE_PATH:cwd+'/.data/normal/postgres'});
 await ready('http://127.0.0.1:3112/api/auth/config');
 const normal=await browser.newPage();await normal.goto('http://127.0.0.1:3112');
 await normal.getByRole('button',{name:'تسجيل الدخول',exact:true}).first().waitFor();
 assert.equal(await normal.getByRole('button',{name:'تجربة النظام',exact:true}).count(),0);
 const disabled=await normal.request.post('http://127.0.0.1:3112/api/auth/demo',{headers:{origin:'http://127.0.0.1:3112'},data:{role:'doctor',clinic:'1'}});
 assert.equal(disabled.status(),403);assert.equal((await disabled.json()).error,'DEMO_DISABLED');
 console.log('Passed: Scribe pre-hydration attribute, login through rewritten Host proxy, session after reload, cross-origin denial, disabled-demo UI and API.');
}catch(e){console.error(appOutput.slice(-1500));throw e}finally{await browser?.close();await new Promise(resolve=>proxy?proxy.close(resolve):resolve());for(const child of processes)child.kill('SIGTERM');await Promise.all(processes.map(child=>child.exitCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve))))}
