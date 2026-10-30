import {PGlite} from '@electric-sql/pglite';
import {mkdir,writeFile,readFile,cp,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export async function createBackup(d:PGlite,target:string,attachments='.data/private-attachments'){
 await mkdir(target,{recursive:false,mode:0o700});const bytes=new Uint8Array(await(await d.dumpDataDir()).arrayBuffer());await writeFile(join(target,'postgres.tar.gz'),bytes,{mode:0o600});const files=(await d.query<{storage_key:string}>('SELECT storage_key FROM medical_attachments')).rows;const manifest:{version:number;databaseSha256:string;files:{key:string;sha256:string}[]}={version:1,databaseSha256:sha(bytes),files:[]};await mkdir(join(target,'attachments'),{mode:0o700});for(const f of files){if(!/^[a-f0-9-]{36}$/.test(f.storage_key))throw new Error('INVALID_STORAGE_KEY');const content=await readFile(join(attachments,f.storage_key));await writeFile(join(target,'attachments',f.storage_key),content,{mode:0o600});manifest.files.push({key:f.storage_key,sha256:sha(content)})}await writeFile(join(target,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});return manifest;
}
export async function restoreBackup(source:string,target:string){
 try{await stat(target);throw new Error('TARGET_EXISTS')}catch(e:any){if(e.code!=='ENOENT')throw e}
 const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));if(manifest.version!==1)throw new Error('INVALID_BACKUP_VERSION');const bytes=await readFile(join(source,'postgres.tar.gz'));if(sha(bytes)!==manifest.databaseSha256)throw new Error('INVALID_DATABASE_CHECKSUM');for(const f of manifest.files){if(!/^[a-f0-9-]{36}$/.test(f.key)||sha(await readFile(join(source,'attachments',f.key)))!==f.sha256)throw new Error('INVALID_ATTACHMENT_CHECKSUM')}
 await mkdir(target,{mode:0o700});const restored=new PGlite({dataDir:join(target,'postgres'),loadDataDir:new Blob([bytes])});await restored.waitReady;const count=(await restored.query<{n:number}>('SELECT count(*)::int as n FROM patients')).rows[0].n;await restored.close();await cp(join(source,'attachments'),join(target,'private-attachments'),{recursive:true});return {patients:count,attachments:manifest.files.length};
}
