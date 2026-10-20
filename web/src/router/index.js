import { createRouter, createWebHistory } from 'vue-router'
import { loadUser } from '@/store/auth'

const routes = [
  { path: '/login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录', public: true } },
  { path: '/', component: () => import('@/views/ProjectsView.vue'), meta: { title: '设计稿' } },
  { path: '/projects/:id', component: () => import('@/views/ProjectDetailView.vue'), meta: { title: '设计稿详情' } },
  { path: '/admin/users', component: () => import('@/views/AdminUsersView.vue'), meta: { title: '用户管理', admin: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  document.title = to.meta.title ? `${to.meta.title} - fgx` : 'fgx 设计稿工作台'
  if (to.meta.public) return true
  const user = await loadUser()
  if (!user) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.admin && !user.isAdmin) return { path: '/' }
  return true
})

export default router
