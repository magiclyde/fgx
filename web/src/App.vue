<template>
  <div class="app">
    <header v-if="!isLoginPage" class="app-header">
      <span class="logo" @click="$router.push('/')">fgx 设计稿工作台</span>
      <nav class="nav">
        <router-link to="/" exact-active-class="active">设计稿</router-link>
        <router-link v-if="authState.user?.isAdmin" to="/admin/users" active-class="active">用户管理</router-link>
      </nav>
      <div class="user">
        <el-button link class="help-btn" @click="guideVisible = true">使用说明</el-button>
        <span>{{ authState.user?.username }}</span>
        <el-button link type="primary" @click="onLogout">退出</el-button>
      </div>
    </header>
    <main :class="{ 'no-header': isLoginPage }">
      <router-view />
    </main>
    <GuideDialog v-model:visible="guideVisible" @dismiss="onGuideDismiss" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authState, logout } from '@/store/auth'
import GuideDialog from '@/components/GuideDialog.vue'

const route = useRoute()
const isLoginPage = computed(() => route.path === '/login')

// 使用引导：首次进入（登录后且未勾选"不再自动显示"）自动弹出
const GUIDE_KEY = 'fgx_guide_dismissed'
const guideVisible = ref(false)

watch(
  () => [route.path, authState.user],
  ([path, user]) => {
    if (path !== '/login' && user && !localStorage.getItem(GUIDE_KEY)) {
      guideVisible.value = true
    }
  },
  { immediate: true }
)

function onGuideDismiss() {
  localStorage.setItem(GUIDE_KEY, '1')
}

async function onLogout() {
  await logout()
}
</script>

<style>
* {
  box-sizing: border-box;
}
html,
body,
#app {
  margin: 0;
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
}
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.app-header {
  height: 52px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 0 20px;
  background: #001529;
  color: #fff;
}
.app-header .logo {
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.app-header .nav {
  flex: 1;
  display: flex;
  gap: 20px;
}
.app-header .nav a {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  font-size: 14px;
}
.app-header .nav a.active,
.app-header .nav a:hover {
  color: #fff;
}
.app-header .user {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.app-header .user .el-button {
  color: #a8c7fa;
}
.app-header .user .help-btn {
  color: rgba(255, 255, 255, 0.75);
}
.app-header .user .help-btn:hover {
  color: #fff;
}
main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #f0f2f5;
}
main.no-header {
  background: #f0f2f5;
}
</style>
