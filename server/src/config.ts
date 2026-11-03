import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const env = process.env

export const config = {
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? '0.0.0.0',
  dataDir: resolve(env.DATA_DIR ?? './data'),
  webDir: resolve(env.WEB_DIR ?? './dist'),
  evolutionUrl: (env.EVOLUTION_API_URL ?? '').replace(/\/+$/, ''),
  evolutionKey: env.EVOLUTION_API_KEY ?? '',
  instanceName: env.EVOLUTION_INSTANCE ?? 'buybot',
  /** URL con la que Evolution API alcanza a este servidor (p. ej. http://buybot:8787). Opcional. */
  webhookBase: (env.PUBLIC_WEBHOOK_URL ?? '').replace(/\/+$/, ''),
  secureCookie: env.COOKIE_SECURE === 'true',
  bootstrapEmail: env.ADMIN_EMAIL ?? '',
  bootstrapPassword: env.ADMIN_PASSWORD ?? '',
  accountClaimToken: env.ACCOUNT_CLAIM_TOKEN ?? '',
  accountInviteToken: env.ACCOUNT_INVITE_TOKEN ?? '',
  countryCode: env.DEFAULT_COUNTRY_CODE ?? '51',
}

mkdirSync(config.dataDir, { recursive: true })
