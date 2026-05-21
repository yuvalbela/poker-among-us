import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

let cachedUserId = null
let signInPromise = null

export async function ensureSignedIn() {
  if (cachedUserId) return cachedUserId
  if (signInPromise) return signInPromise
  signInPromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      cachedUserId = session.user.id
      return cachedUserId
    }
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    cachedUserId = data.user.id
    return cachedUserId
  })()
  try {
    return await signInPromise
  } finally {
    signInPromise = null
  }
}

export function useAuth() {
  const [userId, setUserId] = useState(cachedUserId)
  const [loading, setLoading] = useState(!cachedUserId)

  useEffect(() => {
    let mounted = true
    ensureSignedIn()
      .then((id) => { if (mounted) { setUserId(id); setLoading(false) } })
      .catch((e) => { console.error(e); if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  return { userId, loading }
}
