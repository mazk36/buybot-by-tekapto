import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
const dir=mkdtempSync(join(tmpdir(),'buybot-dashboard-'));process.env.DATA_DIR=dir
const {db}=await import('../src/db.js')
const {registerRoutes}=await import('../src/routes.js')
const {createSession, destroySession}=await import('../src/auth.js')
const {default:Fastify}=await import('fastify');const {default:cookie}=await import('@fastify/cookie')
const app=Fastify();await app.register(cookie);await registerRoutes(app)
let token=''
try {
 const user=db.prepare("INSERT INTO users(email,name,password_hash) VALUES('qa@example.test','QA','unused')").run()
 token=createSession(Number(user.lastInsertRowid));const headers={cookie:'buybot_session='+token}
 const base=Number(db.prepare("INSERT INTO import_batches(name) VALUES('QA')").run().lastInsertRowid)
 db.prepare("INSERT INTO prospects(dni,name,phone,status,whatsapp_opt_in,import_batch_id) VALUES('70000001','Cliente Uno','51999999111','sent',1,?)").run(base)
 db.prepare("INSERT INTO prospects(dni,name,phone,status,whatsapp_opt_in,import_batch_id) VALUES('70000002','Sin Whatsapp','51999999222','no_whatsapp',1,?)").run(base)
 const add=db.prepare("INSERT INTO messages(prospect_id,name,phone,body,status,sent_at) VALUES(?,'QA','51999999111','QA','sent',?)")
 const now=new Date().toISOString();add.run(1,now);for(let i=0;i<3;i++)add.run(null,now)
 const stats=(await app.inject({url:'/api/stats',headers})).json()
 assert.equal(stats.sentToday,1);assert.equal(stats.totalMessagesToday,4);assert.equal(stats.manualMessagesToday,3);assert.equal(stats.contactedTotal,1);assert.equal(stats.total,1)
 const list=(await app.inject({url:'/api/prospects?status=all',headers})).json();assert.equal(list.total,1)
 const excluded=(await app.inject({url:'/api/prospects?status=no_whatsapp',headers})).json();assert.equal(excluded.total,1)
 const bases=(await app.inject({url:'/api/bases',headers})).json();assert.equal(bases.items[0].contacted,1);assert.equal(bases.items[0].total,1)
 const imports=(await app.inject({url:'/api/imports',headers})).json();assert.equal(imports.items[0].total,2)
 const renamed=await app.inject({method:'PATCH',url:`/api/bases/${base}`,headers,payload:{name:'  Base renombrada  '}});assert.equal(renamed.statusCode,200)
 assert.equal((await app.inject({url:'/api/imports',headers})).json().items[0].name,'Base renombrada')
 assert.equal((await app.inject({url:'/api/bases',headers})).json().items[0].name,'Base renombrada')
 assert.equal((await app.inject({method:'PATCH',url:`/api/bases/${base}`,headers,payload:{name:' '}})).statusCode,400)
 assert.equal((await app.inject({method:'PATCH',url:'/api/bases/999999',headers,payload:{name:'No existe'}})).statusCode,404)
 assert.equal((await app.inject({url:'/api/imports'})).statusCode,401)
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM prospects').get() as any).n,2)
 console.log('OK: API concilia contactos y mensajes manuales; filtro conserva registros sin WhatsApp.')
} finally { if(token)destroySession(token);await app.close();db.close();rmSync(dir,{recursive:true,force:true}) }
