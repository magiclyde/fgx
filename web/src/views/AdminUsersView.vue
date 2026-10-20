<template>
  <div class="page">
    <div class="toolbar">
      <h3>用户管理</h3>
      <el-button type="primary" @click="createVisible = true">新建用户</el-button>
    </div>

    <el-table :data="users" v-loading="loading">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="username" label="用户名" min-width="140" />
      <el-table-column label="角色" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.isAdmin" size="small">管理员</el-tag>
          <span v-else>普通用户</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.disabled" type="danger" size="small">已禁用</el-tag>
          <el-tag v-else type="success" size="small">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openReset(row)">重置密码</el-button>
          <el-button v-if="!row.disabled" link type="danger" @click="toggleDisabled(row, true)">禁用</el-button>
          <el-button v-else link type="success" @click="toggleDisabled(row, false)">启用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createVisible" title="新建用户" width="420px" @closed="resetCreate">
      <el-form label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="createForm.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="createForm.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="管理员">
          <el-checkbox v-model="createForm.isAdmin" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetVisible" :title="`重置密码：${resetTarget?.username}`" width="420px">
      <el-input v-model="resetPassword" type="password" show-password placeholder="新密码，至少 6 位" />
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doReset">重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { userService } from '@/services/userService'

const users = ref([])
const loading = ref(false)
const submitting = ref(false)

const createVisible = ref(false)
const createForm = reactive({ username: '', password: '', isAdmin: false })

const resetVisible = ref(false)
const resetTarget = ref(null)
const resetPassword = ref('')

async function loadList() {
  loading.value = true
  try {
    users.value = await userService.list()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function resetCreate() {
  createForm.username = ''
  createForm.password = ''
  createForm.isAdmin = false
}

async function doCreate() {
  submitting.value = true
  try {
    await userService.create(createForm)
    ElMessage.success('创建成功')
    createVisible.value = false
    loadList()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    submitting.value = false
  }
}

function openReset(row) {
  resetTarget.value = row
  resetPassword.value = ''
  resetVisible.value = true
}

async function doReset() {
  submitting.value = true
  try {
    await userService.update(resetTarget.value.id, { password: resetPassword.value })
    ElMessage.success('已重置')
    resetVisible.value = false
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    submitting.value = false
  }
}

async function toggleDisabled(row, disabled) {
  try {
    await userService.update(row.id, { disabled })
    ElMessage.success(disabled ? '已禁用' : '已启用')
    loadList()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

onMounted(loadList)
</script>

<style scoped>
.page {
  padding: 20px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.toolbar h3 {
  margin: 0;
}
</style>
