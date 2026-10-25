import 'dotenv/config';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server.mjs';

const action=process.argv[2]||'status';
if(!['init','status'].includes(action)){
  console.error('Usage: node scripts/database.mjs init|status');
  process.exitCode=1;
}else{
  const app=createApp();
  const db=app.locals.db;
  if(app.locals.store.kind==='appwrite'){
    try{await app.locals.store.health();console.log(JSON.stringify({database:'Appwrite TablesDB',status:'healthy',activeOrders:(await app.locals.store.held()).length},null,2));}catch(error){console.error(error.message);process.exitCode=1;}
    process.exit(process.exitCode||0);
  }
  try{
    const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check;
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
    const required=['orders','payment_events'];
    if(integrity!=='ok'||!required.every(table=>tables.includes(table)))throw Error('Database health check failed');
    const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    console.log(JSON.stringify({
      database:'SQLite',status:action==='init'?'initialized':'healthy',integrity,
      path:path.resolve(process.env.DATABASE_PATH||path.join(root,'data/orders.sqlite')),
      journalMode:db.prepare('PRAGMA journal_mode').get().journal_mode,
      tables,orders:db.prepare('SELECT count(*) AS total FROM orders').get().total,
      paymentEvents:db.prepare('SELECT count(*) AS total FROM payment_events').get().total
    },null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
  finally{db.close();}
}
