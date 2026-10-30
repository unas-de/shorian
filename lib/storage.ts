import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {Actor} from './db';
export const storageRoot='.data/private-attachments';
function key(){mkdirSync(storageRoot,{recursive:true});const file='.data/storage-signing-key';if(!existsSync(file))try{writeFileSync(file,randomBytes(32),{mode:0o600,flag:'wx'})}catch{}return readFileSync(file)}
export function signFile(a:Actor,id:string,expiry:number){return createHmac('sha256',key()).update([a.userId,a.clinicId,id,expiry].join(':')).digest('hex')}
export function verifyFile(a:Actor,id:string,expiry:number,signature:string){if(!Number.isSafeInteger(expiry)||expiry<Date.now()||expiry>Date.now()+301000||!/^[a-f0-9]{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signFile(a,id,expiry),'hex'),Buffer.from(signature,'hex'))}
