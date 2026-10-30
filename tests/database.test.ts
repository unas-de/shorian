import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const keepAlive=setInterval(()=>{},1000);
const root=mkdtempSync(join(tmpdir(),'shorian-test-'));process.env.DATABASE_PATH=join(root,'pg');
const {db,seed,scoped,id}=await import('../lib/db');
await seed();
const manager={userId:'manager-1',clinicId:'clinic-1',role:'manager',medical:false,name:'Test'};
const reception={...manager,userId:'receptionist-1',role:'receptionist'};
const doctor={...manager,userId:'doctor-1',role:'doctor',medical:true};
after(async()=>{clearInterval(keepAlive);await(await db()).close();rmSync(root,{recursive:true,force:true})});
test('tenant RLS rejects direct IDs and forged clinic selection',async()=>{
 await scoped(manager,async q=>{assert.equal((await q.query("SELECT * FROM patients WHERE id='patient-2-0'")).rows.length,0);assert.equal((await q.query("SELECT * FROM appointments WHERE id='appointment-2-0'")).rows.length,0);assert.equal((await q.query("SELECT * FROM invoices WHERE id='invoice-2-0'")).rows.length,0);assert.equal((await q.query('SELECT * FROM medical_attachments')).rows.length,0)});
 await scoped({...manager,clinicId:'clinic-2'},async q=>assert.equal((await q.query('SELECT * FROM patients')).rows.length,0));
});
test('composite foreign keys prevent cross-tenant appointment references',async()=>{
 await assert.rejects(scoped(manager,q=>q.query("INSERT INTO appointments(id,clinic_id,patient_id,doctor_id,service_id,starts_at,ends_at) VALUES($1,'clinic-1','patient-2-0','doctor-1','consult-1','2027-01-02T09:00Z','2027-01-02T09:30Z')",[id()])));
});
test('database trigger serializes concurrent overlapping booking attempts',async()=>{
 const insert=()=>scoped(manager,q=>q.query("INSERT INTO appointments(id,clinic_id,patient_id,doctor_id,service_id,starts_at,ends_at) VALUES($1,'clinic-1','patient-1-0','doctor-1','consult-1','2027-02-03T09:00Z','2027-02-03T09:30Z')",[id()]));
 const r=await Promise.allSettled([insert(),insert()]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.filter(x=>x.status==='rejected').length,1);
});
test('clinical records are denied to reception, accountant and owner by RLS',async()=>{
 await scoped(doctor,q=>q.query("INSERT INTO encounters(id,clinic_id,appointment_id,patient_id,doctor_id,content) VALUES('enc-test','clinic-1','appointment-1-0','patient-1-0','doctor-1','{\"diagnosis\":\"synthetic\"}')"));
 for(const a of [manager,reception,{...manager,userId:'accountant-1',role:'accountant'}])await scoped(a,async q=>assert.equal((await q.query("SELECT * FROM encounters WHERE id='enc-test'")).rows.length,0));
 await assert.rejects(scoped(reception,q=>q.query("INSERT INTO clinical_notes VALUES($1,'clinic-1','enc-test','receptionist-1','not permitted',now())",[id()])));
});
test('signed medical records are immutable, append-only correction retains original',async()=>{
 await scoped(doctor,q=>q.query("UPDATE encounters SET status='signed',signed_at=now(),signed_by='doctor-1' WHERE id='enc-test'"));
 await assert.rejects(scoped(doctor,q=>q.query("UPDATE encounters SET content='{}' WHERE id='enc-test'")),/SIGNED_ENCOUNTER_LOCKED/);
 await scoped(doctor,q=>q.query("INSERT INTO clinical_notes VALUES($1,'clinic-1','enc-test','doctor-1','dated correction',now())",[id()]));
 await scoped(doctor,async q=>{const r=await q.query("SELECT content FROM encounters WHERE id='enc-test'");assert.equal(r.rows[0].content.diagnosis,'synthetic');assert.equal((await q.query("SELECT * FROM clinical_notes WHERE encounter_id='enc-test'")).rows.length,1)});
});
test('financial ledger rejects duplicate keys and edits; physician has no access',async()=>{
 const key=id();await scoped(reception,q=>q.query("INSERT INTO payments VALUES($1,'clinic-1','invoice-1-2',10000,'cash',$2,now())",[id(),key]));
 await assert.rejects(scoped(reception,q=>q.query("INSERT INTO payments VALUES($1,'clinic-1','invoice-1-2',10000,'cash',$2,now())",[id(),key])));
 await assert.rejects(scoped(reception,q=>q.query("UPDATE payments SET amount_minor=1 WHERE idempotency_key=$1",[key])));
 await scoped(doctor,async q=>assert.equal((await q.query('SELECT * FROM payments')).rows.length,0));
});
test('manager cannot grant own subscription upgrade through application DB role',async()=>{
 await assert.rejects(scoped(manager,q=>q.query("UPDATE clinic_subscriptions SET plan_id='pro'")));
});

test('database snapshot restores into independent PostgreSQL instance',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const snapshot=await(await db()).dumpDataDir();
 const restored=new PGlite({dataDir:join(root,'restored'),loadDataDir:snapshot});await restored.waitReady;
 assert.equal((await restored.query<any>('SELECT count(*)::int as n FROM patients')).rows[0].n,16);
 assert.equal((await restored.query<any>("SELECT content FROM encounters WHERE id='enc-test'")).rows[0].content.diagnosis,'synthetic');await restored.close();
});
test('backup restores database and private attachments with verified checksums',async()=>{
 const {mkdirSync,writeFileSync,readFileSync}=await import('node:fs');const {createBackup,restoreBackup}=await import('../lib/backup');const attachment=id();const source=join(root,'source-files');mkdirSync(source);writeFileSync(join(source,attachment),'%PDF-1.4 synthetic attachment');
 await scoped(doctor,q=>q.query("INSERT INTO medical_attachments(id,clinic_id,patient_id,title,mime,size,storage_key) VALUES($1,'clinic-1','patient-1-0','synthetic','application/pdf',29,$1)",[attachment]));
 const backup=join(root,'backup');await createBackup(await db(),backup,source);const target=join(root,'restored-with-files');const restored=await restoreBackup(backup,target);assert.equal(restored.patients,16);assert.equal(restored.attachments,1);assert.equal(readFileSync(join(target,'private-attachments',attachment),'utf8'),'%PDF-1.4 synthetic attachment');
});
test('plan limits apply at database level without deleting existing doctors',async()=>{
 await scoped(manager,q=>q.query("INSERT INTO doctors VALUES('extra-doctor','clinic-1','doctor-1','Synthetic second','test','teal')"));
 await assert.rejects(scoped(manager,q=>q.query("INSERT INTO doctors VALUES('over-limit-doctor','clinic-1','doctor-1','Synthetic third','test','teal')")),/PLAN_LIMIT/);
 await scoped(manager,async q=>assert.equal((await q.query('SELECT * FROM doctors')).rows.length,2));
});
test('schedule and leave constraints reject direct invalid database bookings',async()=>{
 await assert.rejects(scoped(manager,q=>q.query("INSERT INTO appointments(id,clinic_id,patient_id,doctor_id,service_id,starts_at,ends_at) VALUES($1,'clinic-1','patient-1-0','doctor-1','consult-1','2027-03-03T01:00Z','2027-03-03T01:30Z')",[id()])),/OUTSIDE_SCHEDULE/);
 await scoped(manager,q=>q.query("INSERT INTO schedule_exceptions VALUES($1,'clinic-1','doctor-1','2027-03-03T08:00Z','2027-03-03T12:00Z','synthetic leave')",[id()]));
 await assert.rejects(scoped(manager,q=>q.query("INSERT INTO appointments(id,clinic_id,patient_id,doctor_id,service_id,starts_at,ends_at) VALUES($1,'clinic-1','patient-1-0','doctor-1','consult-1','2027-03-03T09:00Z','2027-03-03T09:30Z')",[id()])),/OUTSIDE_SCHEDULE/);
});
test('database rejects overpayments and excessive refunds',async()=>{
 await assert.rejects(scoped(reception,q=>q.query("INSERT INTO payments VALUES($1,'clinic-1','invoice-1-2',90000,'cash',$2,now())",[id(),id()])),/INVALID_AMOUNT/);
 const payment=(await scoped<any>(manager,q=>q.query("SELECT id FROM payments WHERE invoice_id='invoice-1-2'"))).rows[0];
 await assert.rejects(scoped(manager,q=>q.query("INSERT INTO refunds VALUES($1,'clinic-1',$2,99999,'synthetic',$3,now())",[id(),payment.id,id()])),/INVALID_AMOUNT/);
});
