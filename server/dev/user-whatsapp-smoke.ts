import { createServer } from 'node:http'
import { mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const dir=mkdtempSync(join(tmpdir(),'buybot-isolation-'))
const instances=new Map<string,{state:string;phone:string}>();const sent:string[]=[]
const mock=createServer(async(req,res)=>{const url=new URL(req.url!,'http://test');const parts=url.pathname.split('/');const name=parts[3];let body='';for await(const c of req)body+=c;const data=body?JSON.parse(body):{};const send=(value:unknown,code=200)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
if(parts[2]==='fetchInstances'){const id=url.searchParams.get('instanceName')!;const x=instances.get(id);return send(x?[{name:id,connectionStatus:x.state,ownerJid:x.phone+'@s.whatsapp.net'}]:[])}
if(parts[2]==='create'){instances.set(data.instanceName,{state:'connecting',phone:''});return send({})}
if(parts[2]==='connect')return send({base64:'mock-qr'})
if(parts[2]==='connectionState')return send({state:instances.get(name)?.state||'close'})
if(parts[2]==='logout'){instances.get(name)!.state='close';return send({})}
if(parts[2]==='delete'){instances.delete(name);return send({})}
if(parts[2]==='whatsappNumbers')return send([{exists:true}])
if(parts[2]==='sendText'){sent.push(name);return send({key:{id:'mock-sent'}})}
send({},404)
})
await new Promise<void>(r=>mock.listen(0,'127.0.0.1',r));const port=(mock.address() as any).port
process.env.DATA_DIR=dir;process.env.EVOLUTION_API_URL=`http://127.0.0.1:${port}`;process.env.EVOLUTION_API_KEY='mock';process.env.TZ='America/Lima'
const {db,setRaw}=await import('../src/db.js');const {createSession,destroySession}=await import('../src/auth.js');const {registerRoutes}=await import('../src/routes.js');const {whatsapps}=await import('../src/whatsapp.js');const {pickSender}=await import('../src/senders.js');const {queue}=await import('../src/queue.js');const {default:Fastify}=await import('fastify');const {default:cookie}=await import('@fastify/cookie');const app=Fastify();await app.register(cookie);await registerRoutes(app)
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
 assert.equal((await req(0,'POST','/api/campaign/start')).statusCode,200)
 assert.equal((await req(1,'POST','/api/campaign/pause')).statusCode,403);assert.equal((await req(1,'POST','/api/campaign/start')).statusCode,409)
 assert.equal((await req(1,'GET','/api/campaign')).json().status,'stopped')
 queue.nextAt=0;await queue.tick();assert.deepEqual(sent,[id1])
 assert.equal((await req(1,'POST','/api/whatsapp/disconnect')).statusCode,200);assert.equal(instances.get(id1)!.state,'open')
 console.log('OK: conexiones, QR, controles y remitentes aislados entre usuarios; conexión global antigua inaccesible.')
}finally{queue.shutdown();for(const t of tokens)destroySession(t);await app.close();db.close();await new Promise<void>(r=>mock.close(()=>r()));rmSync(dir,{recursive:true,force:true})}
