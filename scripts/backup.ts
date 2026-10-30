import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
import {db} from '../lib/db';
import {createBackup,restoreBackup} from '../lib/backup';
const [command,path,target]=process.argv.slice(2);
if(command==='create'&&path){const d=await db();console.log(await createBackup(d,path));await d.close()}else if(command==='restore'&&path&&target){console.log(await restoreBackup(path,target))}else{console.error('Stop server first. Usage: node --import tsx scripts/backup.ts create BACKUP_DIRECTORY | restore BACKUP_DIRECTORY NEW_DIRECTORY');process.exitCode=1}
