import { api } from './api'

export const authService = {
  me: () => api.get('/auth/me'),
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
}
