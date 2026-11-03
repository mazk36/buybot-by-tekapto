import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { audit, db, tx } from '../src/db.js'
import { hashPassword } from '../src/auth.js'

function hiddenLine(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Ejecuta este comando en una terminal interactiva.'))
  }
  stdout.write(prompt)
  stdin.setRawMode(true)
  stdin.resume()
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error?: Error) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (chunk: Buffer | string) => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') return finish(new Error('Operación cancelada.'))
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else if (char >= ' ') value += char
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const users = db.prepare('SELECT id, email FROM users ORDER BY id').all() as { id: number; email: string }[]
  if (users.length !== 1) {
    throw new Error(`Se esperaba una cuenta local y se encontraron ${users.length}. No se cambió nada.`)
  }
  const user = users[0]
  console.log(`Cuenta actual: ${user.email}`)
  const rl = createInterface({ input: stdin, output: stdout })
  const enteredEmail = (await rl.question('Nuevo correo de acceso (Enter conserva el actual): ')).trim()
  rl.close()
  const email = enteredEmail || user.email
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Escribe un correo válido.')

  const password = await hiddenLine('Nueva contraseña (mínimo 8 caracteres, no se mostrará): ')
  const confirmation = await hiddenLine('Repite la nueva contraseña: ')
  if (password.length < 8 || password.length > 256) throw new Error('La contraseña debe tener entre 8 y 256 caracteres.')
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden. No se cambió nada.')

  const passwordHash = await hashPassword(password)
  tx(() => {
    db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(email, passwordHash, user.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
    audit('terminal local', 'auth.credentials_reset', 'user', user.id, email, 'Credenciales actualizadas por el usuario desde la terminal local.')
  })
  console.log(`Credenciales actualizadas. Usuario de acceso: ${email}`)
  console.log('La contraseña no se guardó en el historial ni se mostró en pantalla.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudieron actualizar las credenciales.')
  process.exitCode = 1
}).finally(() => db.close())
