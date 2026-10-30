import { PGlite } from '@electric-sql/pglite';
import {readFileSync,mkdirSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
export const id=()=>randomUUID();
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function passwordHash(s:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(s,salt,64).toString('hex')}
export function passwordValid(s:string,h:string){const [salt,key]=h.split(':');return timingSafeEqual(scryptSync(s,salt,64),Buffer.from(key,'hex'))}
type DB= PGlite;
const globalDB=globalThis as unknown as {clinicDB?:Promise<DB>};
export function db(){return globalDB.clinicDB??=(async()=>{const path=process.env.DATABASE_PATH||'.data/postgres';mkdirSync('.data',{recursive:true});mkdirSync(dirname(path),{recursive:true});const lock=path+'.lock';if(existsSync(lock)){const pid=Number(readFileSync(lock,'utf8'));let alive=true;try{process.kill(pid,0)}catch{alive=false}if(alive)throw new Error('DATABASE_IN_USE: stop other server/seed/backup processes first');unlinkSync(lock);}writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});process.once('exit',()=>{try{if(readFileSync(lock,'utf8')===String(process.pid))unlinkSync(lock)}catch{}});const d=new PGlite(path);await d.waitReady;await d.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version int PRIMARY KEY)');const r=await d.query('SELECT * FROM schema_migrations WHERE version=1');if(!r.rows.length){await d.transaction(async tx=>{await tx.exec(readFileSync('migrations/001_core.sql','utf8'));await tx.exec('INSERT INTO schema_migrations VALUES(1)')});}if(!(await d.query('SELECT * FROM schema_migrations WHERE version=2')).rows.length)await d.transaction(async tx=>{await tx.exec(readFileSync('migrations/002_integrity.sql','utf8'));await tx.exec('INSERT INTO schema_migrations VALUES(2)')});if(!(await d.query('SELECT * FROM schema_migrations WHERE version=3')).rows.length)await d.transaction(async tx=>{await tx.exec(readFileSync('migrations/003_cash.sql','utf8'));await tx.exec('INSERT INTO schema_migrations VALUES(3)')});await d.exec("INSERT INTO subscription_plans VALUES('basic','Basic',2,6,0),('growth','Growth',8,20,0),('pro','Pro',30,100,0) ON CONFLICT(id) DO NOTHING");return d;})();}
export type Actor={userId:string,clinicId:string,role:string,medical:boolean,name:string};
export async function scoped<T>(a:Actor,fn:(q:any)=>Promise<T>){return (await db()).transaction(async tx=>{await tx.query("SELECT set_config('app.actor',$1,true),set_config('app.clinic',$2,true)",[a.userId,a.clinicId]);await tx.exec('SET LOCAL ROLE clinic_app');return fn(tx);});}
export async function seed(){const d=await db();if((await d.query('SELECT id FROM clinics LIMIT 1')).rows.length)return;const password=randomBytes(18).toString('base64url');await d.transaction(async q=>{
await q.exec("INSERT INTO subscription_plans VALUES('basic','Basic',2,6,0),('growth','Growth',8,20,0),('pro','Pro',30,100,0) ON CONFLICT(id) DO NOTHING");
for(let c=1;c<=2;c++){
const clinic='clinic-'+c;await q.query('INSERT INTO clinics(id,name) VALUES($1,$2)',[clinic,c===1?'عيادة النور التخصصية':'عيادة الياسمين']);await q.query("INSERT INTO clinic_subscriptions(id,clinic_id,plan_id) VALUES($1,$2,'basic')",[id(),clinic]);
for(const [role,name] of [['manager','أ. سلمى حسن'],['receptionist','أ. مريم أحمد'],['doctor','د. أحمد منصور'],['accountant','أ. عمر علي']]){const uid=`${role}-${c}`;await q.query('INSERT INTO profiles(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[uid,name,`${role}${c}@demo.shorian.local`,passwordHash(password)]);await q.query('INSERT INTO clinic_memberships VALUES($1,$2,$3,$4,false)',[id(),clinic,uid,role]);}
await q.query("INSERT INTO doctors VALUES($1,$2,$3,$4,'طب الأسرة','teal')",['doctor-'+c,clinic,'doctor-'+c,'د. أحمد منصور']);
for(let day=0;day<7;day++)await q.query('INSERT INTO doctor_schedules VALUES($1,$2,$3,$4,8,23)',[id(),clinic,'doctor-'+c,day]);
await q.query("INSERT INTO services VALUES($1,$2,'كشف طبي',30,30000),($3,$2,'متابعة',20,15000),($4,$2,'استشارة',15,20000)",['consult-'+c,clinic,'follow-'+c,'advice-'+c]);
const names=['ليلى محمود أحمد','يوسف محمد علي','نور خالد إبراهيم','آدم حسن مصطفى','فاطمة عمر سعيد','سيف أحمد جمال','مريم عادل محمود','عمر طارق حسن'];
for(let i=0;i<names.length;i++){
const pid=`patient-${c}-${i}`;await q.query('INSERT INTO patients(id,clinic_id,file_number,name,phone,estimated_age,gender) VALUES($1,$2,$3,$4,$5,$6,$7)',[pid,clinic,1001+i,names[i],'+2010'+String(12345000+i),22+i*3,i%2?'male':'female']);
const now=new Date();const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(now);const start=new Date(`${date}T${String(9+i).padStart(2,'0')}:00:00+02:00`);const aid=`appointment-${c}-${i}`;await q.query('INSERT INTO appointments(id,clinic_id,patient_id,doctor_id,service_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[aid,clinic,pid,'doctor-'+c,'consult-'+c,start.toISOString(),new Date(+start+1800000).toISOString(),i<3?'arrived':i===3?'confirmed':'booked']);
if(i<3)await q.query('INSERT INTO queue_entries(id,clinic_id,appointment_id,arrived_at) VALUES($1,$2,$3,$4)',[id(),clinic,aid,new Date(Date.now()-(35-i*10)*60000).toISOString()]);
await q.query('INSERT INTO invoices(id,clinic_id,patient_id,appointment_id,number,total_minor) VALUES($1,$2,$3,$4,$5,30000)',[`invoice-${c}-${i}`,clinic,pid,aid,2001+i]);await q.query("INSERT INTO invoice_items VALUES($1,$2,$3,'كشف طبي',30000)",[id(),clinic,`invoice-${c}-${i}`]);
if(i<2)await q.query("INSERT INTO payments VALUES($1,$2,$3,30000,'cash',$4,now())",[id(),clinic,`invoice-${c}-${i}`,id()]);
}
}
});writeFileSync(join(dirname(process.env.DATABASE_PATH||'.data/postgres'),'demo-credentials.txt'),`Synthetic demo only. Password: ${password}\nEmails: manager1, receptionist1, doctor1, accountant1 (or 2) @demo.shorian.local\n`,{mode:0o600});}

export async function seedPlatform(){const d=await db();if(!(await d.query("SELECT id FROM profiles WHERE id='platform-0'")).rows.length){const password=randomBytes(24).toString('base64url');await d.query("INSERT INTO profiles(id,name,email,password_hash,platform_admin) VALUES('platform-0','إدارة شُريان','platform@demo.shorian.local',$1,true)",[passwordHash(password)]);writeFileSync('.data/platform-credentials.txt',password+'\n',{mode:0o600});}}
