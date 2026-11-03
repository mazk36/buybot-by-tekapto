/* Run Evolution's PostgreSQL migrations without writing the DSN to container logs. */
const { spawnSync, spawn } = require('node:child_process')
const { cpSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

if (process.env.DATABASE_PROVIDER !== 'postgresql' || !process.env.DATABASE_CONNECTION_URI) {
  console.error('Evolution startup refused: PostgreSQL runtime configuration missing.')
  process.exit(1)
}

const runtimePrisma = '/tmp/buybot-prisma'
try {
  mkdirSync(runtimePrisma, { recursive: true })
  cpSync('/evolution/prisma/postgresql-schema.prisma', join(runtimePrisma, 'postgresql-schema.prisma'))
  cpSync('/evolution/prisma/postgresql-migrations', join(runtimePrisma, 'migrations'), { recursive: true })
} catch {
  console.error('Evolution startup refused: PostgreSQL migration files could not be prepared.')
  process.exit(1)
}

const migration = spawnSync('/evolution/node_modules/.bin/prisma', [
  'migrate', 'deploy', '--schema', join(runtimePrisma, 'postgresql-schema.prisma'),
], {
  cwd: '/evolution',
  env: process.env,
  encoding: 'utf8',
  timeout: 180000,
  maxBuffer: 16 * 1024 * 1024,
})

if (migration.error || migration.status !== 0) {
  console.error('Evolution startup refused: database migration failed; private output suppressed.')
  process.exit(1)
}
console.log('Evolution database migrations verified.')

const server = spawn(process.execPath, ['/evolution/dist/main.js'], {
  cwd: '/evolution', env: process.env, stdio: 'inherit',
})
let stopping = false
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopping = true
    server.kill(signal)
  })
}
server.on('error', () => {
  console.error('Evolution startup failed; private output suppressed.')
  process.exit(1)
})
server.on('exit', code => process.exit(stopping ? 0 : code ?? 1))
