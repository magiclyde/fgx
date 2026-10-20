import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 0, // 大文件上传/解析不限时
})

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status
    const msg = err.response?.data?.error || err.message || '请求失败'
    if (status === 401 && !location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    return Promise.reject(new Error(msg))
  }
)
