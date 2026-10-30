import {db,seed,seedPlatform} from '../lib/db';
const database=await db();
if(process.env.DEMO_MODE==='true'){
  await seed();
  await seedPlatform();
  console.log('Synthetic demo initialized. No credentials are printed.');
}
await database.query('SELECT 1');
await database.close();
console.log('Persistent database initialized and verified.');
