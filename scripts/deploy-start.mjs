import {spawnSync,spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
const port=Number(process.env.PORT||3000);
const hostname=process.env.BIND_HOST||'0.0.0.0';
if(!['0.0.0.0','127.0.0.1','::1'].includes(hostname))throw new Error('Invalid BIND_HOST');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
// Local .env files must not change provider settings or include development secrets.
if(process.env.RENDER==='true'&&existsSync('.env.local'))throw new Error('Do not upload .env.local to the deployment. Configure environment variables in Render.');
const initialized=spawnSync(process.execPath,['--import','tsx','scripts/deploy-init.ts'],{stdio:'inherit',env:process.env});
if(initialized.status!==0)process.exit(initialized.status||1);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname',hostname,'--port',String(port)],{stdio:'inherit',env:process.env});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.kill(signal));
server.on('error',error=>{console.error(error.message);process.exitCode=1});
server.on('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGTERM'||signal==='SIGINT'?0:1)});
