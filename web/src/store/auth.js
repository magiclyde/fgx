import { reactive } from 'vue'
import { authService } from '@/services/authService'

export const authState = reactive({ user: null, loaded: false })

export async function loadUser(force = false) {
  if (authState.loaded && !force) return authState.user
  try {
    authState.user = await authService.me()
  } catch {
    authState.user = null
  }
  authState.loaded = true
  return authState.user
}

export async function logout() {
  await authService.logout().catch(() => {})
  authState.user = null
  window.location.href = '/login'
}
