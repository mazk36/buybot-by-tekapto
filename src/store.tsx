import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api'
import type { Stats, User } from './api'
import { usePolling } from './ui'

interface StatsCtx { stats: Stats | null; error: string | null; refresh: () => Promise<void> }
const Ctx = createContext<StatsCtx>({ stats: null, error: null, refresh: async () => {} })
export const useStats = () => useContext(Ctx)

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    try { setStats(await api<Stats>('GET', '/stats')); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }, [])
  usePolling(() => void refresh(), 3000, [refresh])
  return <Ctx.Provider value={{ stats, error, refresh }}>{children}</Ctx.Provider>
}

const UserCtx = createContext<{ user: User; setUser: (u: User) => void; logout: () => Promise<void> } | null>(null)
export const UserProvider = UserCtx.Provider
export const useUser = () => { const v = useContext(UserCtx); if (!v) throw new Error('UserProvider'); return v }
