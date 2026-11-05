import { createServer } from 'node:http'
import { mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const dir=mkdtempSync(join(tmpdir(),'buybot-isolation-'))
const instances=new Map<string,{state:string;phone:string}>();const sent:string[]=[]
let holdInstance = ''; let releaseSend: (() => void) | undefined
let enteredSend: (() => void) | undefined
const mock=createServer(async(req,res)=>{const url=new URL(req.url!,'http://test');const parts=url.pathname.split('/');const name=parts[3];let body='';for await(const c of req)body+=c;const data=body?JSON.parse(body):{};const send=(value:unknown,code=200)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
if(parts[2]==='fetchInstances'){const id=url.searchParams.get('instanceName')!;const x=instances.get(id);return send(x?[{name:id,connectionStatus:x.state,ownerJid:x.phone+'@s.whatsapp.net'}]:[])}
if(parts[2]==='create'){instances.set(data.instanceName,{state:'connecting',phone:''});return send({})}
if(parts[2]==='connect')return send({base64:'mock-qr'})
if(parts[2]==='connectionState')return send({state:instances.get(name)?.state||'close'})
if(parts[2]==='logout'){instances.get(name)!.state='close';return send({})}
if(parts[2]==='delete'){instances.delete(name);return send({})}
if(parts[2]==='whatsappNumbers')return send([{exists:true}])
if(parts[2]==='sendText'){sent.push(name);if(name===holdInstance){enteredSend?.();await new Promise<void>(r=>{releaseSend=r})}return send({key:{id:'mock-sent-'+sent.length}})}
send({},404)
})
await new Promise<void>(r=>mock.listen(0,'127.0.0.1',r));const port=(mock.address() as any).port
process.env.DATA_DIR=dir;process.env.EVOLUTION_API_URL=`http://127.0.0.1:${port}`;process.env.EVOLUTION_API_KEY='mock';process.env.TZ='America/Lima'
const {db,setRaw,getRaw}=await import('../src/db.js');const {createSession,destroySession}=await import('../src/auth.js');const {registerRoutes}=await import('../src/routes.js');const {whatsapps}=await import('../src/whatsapp.js');const {pickSender}=await import('../src/senders.js');const {queue}=await import('../src/queue.js');const {default:Fastify}=await import('fastify');const {default:cookie}=await import('@fastify/cookie');const app=Fastify();await app.register(cookie);await registerRoutes(app)
const tokens:string[]=[]
try{
 const user=db.prepare('INSERT INTO users(email,name,password_hash) VALUES(?,?,?)');const a=Number(user.run('a@test.local','A','unused').lastInsertRowid);const b=Number(user.run('b@test.local','B','unused').lastInsertRowid);tokens.push(createSession(a),createSession(b));const headers=tokens.map(t=>({cookie:'buybot_session='+t}));
 const req=(uid:number,method:string,url:string,payload?:unknown)=>app.inject({method:method as any,url,headers:headers[uid],payload})
 setRaw('wa_accounts',JSON.stringify([{id:'buybot',label:'Legacy'}]));instances.set('buybot',{state:'open',phone:'51999999000'})
 const id1=(await req(0,'GET','/api/whatsapp/accounts')).json().accounts[0].id;const id2=(await req(1,'GET','/api/whatsapp/accounts')).json().accounts[0].id;assert.notEqual(id1,id2);assert.notEqual(id1,'buybot');assert.equal(whatsapps.list().length,2)
 for(const action of ['connect','disconnect','reset','test'])assert.equal((await req(1,'POST',`/api/whatsapp/accounts/${id1}/${action}`,{})).statusCode,404)
 assert.equal((await req(0,'POST','/api/whatsapp/accounts',{label:'Extra'})).statusCode,409)
 await req(0,'POST','/api/whatsapp/connect');await req(1,'POST','/api/whatsapp/connect');instances.set(id1,{state:'open',phone:'51999999111'});await whatsapps.get(id1)!.refresh(true)
 assert.equal((await req(0,'GET','/api/stats')).json().whatsapp.state,'connected');assert.notEqual((await req(1,'GET','/api/stats')).json().whatsapp.state,'connected')
 await req(1,'POST','/api/whatsapp/reset');assert.equal(instances.get(id1)!.state,'open');instances.set(id2,{state:'open',phone:'51999999222'});await whatsapps.get(id2)!.refresh(true)
 assert.equal((await pickSender(a)).sender!.id,id1);assert.equal((await pickSender(b)).sender!.id,id2)
 db.prepare("INSERT INTO prospects(dni,name,phone,status,whatsapp_opt_in) VALUES('70000001','QA Test','51999999333','pending',1)").run();setRaw('windowStart','00:00');setRaw('windowEnd','23:59')
 // Initialize from the previous single-owner version; schedules transfer only to the owner.
 const oldSchedule = new Date(Date.now()+3600_000).toISOString()
 setRaw('campaign_owner_user_id',String(a));setRaw('campaign_status','running');setRaw('campaign_scheduled_at',oldSchedule)
 queue.init()
 const qa=queue.forUser(a), qb=queue.forUser(b)
 assert.equal(qa.status,'paused');assert.equal(qa.scheduledAt,oldSchedule);assert.equal(qb.scheduledAt,null)
 assert.equal((await req(0,'POST','/api/campaign/start')).statusCode,200)
 assert.equal((await req(1,'POST','/api/campaign/start')).statusCode,200)
 assert.equal((await req(0,'GET','/api/campaign')).json().status,'running')
 assert.equal((await req(1,'GET','/api/campaign')).json().status,'running')
 // Hold A's actual HTTP send open while B completes: no global busy lock, no duplicate prospect.
 db.prepare("INSERT INTO prospects(dni,name,phone,status,whatsapp_opt_in) VALUES('70000002','QA Second','51999999444','pending',1)").run()
 holdInstance=id1;const entered=new Promise<void>(r=>{enteredSend=r});qa.nextAt=0;qb.nextAt=0
 const first=qa.tick();await Promise.race([entered,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('A did not reach send')),5000);t.unref()})])
 await qb.tick();assert.deepEqual(sent,[id1,id2])
 assert.equal((db.prepare("SELECT COUNT(*) AS n FROM messages WHERE status='sent'").get() as any).n,1)
 assert.equal((db.prepare("SELECT COUNT(DISTINCT prospect_id) AS n FROM messages").get() as any).n,2)
 qb.nextAt=0;await qb.tick();assert.equal(qb.status,'running');assert.equal(qb.reason,'waiting')
 await req(1,'POST','/api/campaign/pause');assert.equal(qa.status,'running');assert.equal(qb.status,'paused')
 releaseSend!();await first;holdInstance=''
 assert.equal((db.prepare("SELECT COUNT(*) AS n FROM messages WHERE status='sent'").get() as any).n,2)
 // Mix and schedules are scoped. Cancel/stop/disconnect on B never changes A.
 await req(0,'PUT','/api/campaign/mix',{enabled:true});await req(1,'PUT','/api/campaign/mix',{enabled:false})
 assert.equal(qa.snapshot().mixBases,true);assert.equal(qb.snapshot().mixBases,false)
 db.prepare("INSERT INTO prospects(dni,name,phone,status,whatsapp_opt_in) VALUES('70000003','QA Third','51999999555','pending',1)").run()
 await req(0,'POST','/api/campaign/pause')
 const atA=new Date(Date.now()+7200_000).toISOString(),atB=new Date(Date.now()+10800_000).toISOString()
 assert.equal((await req(0,'POST','/api/campaign/schedule',{at:atA})).statusCode,200)
 assert.equal((await req(1,'POST','/api/campaign/schedule',{at:atB})).statusCode,200)
 await req(1,'POST','/api/campaign/cancel-schedule');assert.equal(qa.scheduledAt,atA);assert.equal(qb.scheduledAt,null)
 await req(1,'POST','/api/campaign/start');assert.equal(qb.status,'running')
 assert.equal((await req(1,'POST','/api/whatsapp/disconnect')).statusCode,200);assert.equal(instances.get(id1)!.state,'open');assert.equal(qa.scheduledAt,atA)
 await req(1,'POST','/api/campaign/start');qb.nextAt=0;await qb.tick()
 assert.equal(qb.reason,'whatsapp_disconnected');assert.equal(qa.scheduledAt,atA)
 // Restart keeps each schedule, pauses active workers and never reimports obsolete global state.
 queue.shutdown();queue.init()
 assert.equal(qa.status,'paused');assert.equal(qb.status,'paused');assert.equal(qa.scheduledAt,atA);assert.equal(qb.scheduledAt,null)
 assert.equal(getRaw(`campaign_user:${a}:mix_bases`),'1')
 // A due schedule starts only its own bot.
 qa.scheduledAt=new Date(Date.now()-1000).toISOString();await qa.tick();assert.equal(qa.status,'running');assert.equal(qb.status,'paused')
 await req(1,'POST','/api/campaign/stop');assert.equal(qa.status,'running');assert.equal(qb.status,'stopped')
 console.log('OK: dos envíos concurrentes sin duplicados; controles, desconexión, mezcla, horarios y recuperación por usuario; QR y remitentes aislados.')
}finally{queue.shutdown();for(const t of tokens)destroySession(t);await app.close();db.close();await new Promise<void>(r=>mock.close(()=>r()));rmSync(dir,{recursive:true,force:true})}
