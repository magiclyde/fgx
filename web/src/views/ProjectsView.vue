<template>
  <div class="page">
    <div class="toolbar">
      <h3>设计稿</h3>
      <el-button type="primary" @click="openUpload">上传 PSD</el-button>
    </div>

    <el-table :data="projects" v-loading="loading" class="table">
      <el-table-column prop="name" label="名称" min-width="200" show-overflow-tooltip />
      <el-table-column label="尺寸" width="120">
        <template #default="{ row }">{{ row.width }}×{{ row.height }}</template>
      </el-table-column>
      <el-table-column prop="layerCount" label="图层数" width="90" />
      <el-table-column label="大小" width="100">
        <template #default="{ row }">{{ formatSize(row.sizeBytes) }}</template>
      </el-table-column>
      <el-table-column prop="owner" label="上传者" width="110" />
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="任务包" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.hasPackage" type="success" size="small">已生成</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/projects/${row.id}`)">打开</el-button>
          <el-button link type="danger" @click="onRemove(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>还没有设计稿，点击右上角「上传 PSD」开始</template>
    </el-table>

    <el-dialog v-model="uploadVisible" title="上传 PSD" width="560px" :close-on-click-modal="false" @closed="resetUpload">
      <div v-if="!parsed">
        <el-upload
          drag
          :auto-upload="false"
          :limit="1"
          accept=".psd"
          :on-change="onFileChange"
          :on-remove="() => (file = null)"
        >
          <div class="upload-tip">
            <p>拖拽 PSD 文件到这里，或点击选择</p>
            <p class="sub">仅支持 RGB 模式 .psd（不支持 PSB），不超过 500MB</p>
          </div>
        </el-upload>
        <div v-if="parsing" class="parsing" v-loading="true">正在解析 PSD…</div>
      </div>

      <div v-else class="preview">
        <div class="preview-img" v-if="previewUrl">
          <img :src="previewUrl" alt="合成预览" />
        </div>
        <el-descriptions :column="1" border size="small" class="preview-meta">
          <el-descriptions-item label="文件名">{{ parsed.design.meta.name }}</el-descriptions-item>
          <el-descriptions-item label="画布尺寸">
            {{ parsed.design.meta.width }}×{{ parsed.design.meta.height }}
          </el-descriptions-item>
          <el-descriptions-item label="图层数">{{ layerCount }}</el-descriptions-item>
          <el-descriptions-item label="显示名">
            <el-input v-model="uploadName" size="small" />
          </el-descriptions-item>
        </el-descriptions>
        <el-progress v-if="uploading" :percentage="uploadPercent" class="progress" />
      </div>

      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button v-if="parsed" link type="warning" @click="resetUpload">重新选择</el-button>
        <el-button type="primary" :disabled="!parsed" :loading="uploading" @click="doUpload">
          确认上传
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { projectService } from '@/services/projectService'
import { parsePsd, countLayers, MAX_PSD_SIZE } from '@/psd/parse'
import { canvasToBlob } from '@/psd/slices'

const router = useRouter()
const projects = ref([])
const loading = ref(false)

const uploadVisible = ref(false)
const file = ref(null)
const parsing = ref(false)
const parsed = ref(null) // { design, psd }
const previewUrl = ref('')
const uploadName = ref('')
const layerCount = ref(0)
const uploading = ref(false)
const uploadPercent = ref(0)

function formatSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

async function loadList() {
  loading.value = true
  try {
    projects.value = await projectService.list()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function openUpload() {
  uploadVisible.value = true
}

function resetUpload() {
  file.value = null
  parsed.value = null
  previewUrl.value = ''
  uploadName.value = ''
  uploading.value = false
  uploadPercent.value = 0
}

async function onFileChange(uploadFile) {
  const raw = uploadFile.raw
  if (!raw) return
  if (raw.size > MAX_PSD_SIZE) {
    ElMessage.error('文件超过 500MB 限制')
    return
  }
  file.value = raw
  parsing.value = true
  try {
    const buffer = await raw.arrayBuffer()
    // 让出一帧，避免大文件解析时 UI 完全不响应
    await new Promise((r) => setTimeout(r, 50))
    parsed.value = parsePsd(buffer, raw.name)
    layerCount.value = countLayers(parsed.value.design.layers)
    uploadName.value = raw.name.replace(/\.psd$/i, '')
    const composite = parsed.value.psd.canvas
    previewUrl.value = composite ? composite.toDataURL('image/png') : ''
    if (!composite) ElMessage.warning('该 PSD 未保存合成预览图（不影响图层解析与切图）')
  } catch (e) {
    ElMessage.error(e.message)
    resetUpload()
  } finally {
    parsing.value = false
  }
}

async function doUpload() {
  if (!parsed.value || !file.value) return
  uploading.value = true
  uploadPercent.value = 0
  try {
    const fd = new FormData()
    fd.append('name', uploadName.value || file.value.name)
    fd.append('design', JSON.stringify(parsed.value.design))
    fd.append('file', file.value)
    if (parsed.value.psd.canvas) {
      fd.append('composite', await canvasToBlob(parsed.value.psd.canvas), 'composite.png')
    }
    const created = await projectService.upload(fd, (e) => {
      if (e.total) uploadPercent.value = Math.round((e.loaded / e.total) * 100)
    })
    ElMessage.success('上传成功')
    uploadVisible.value = false
    loadList()
    // 上传完直接进入详情
    if (created?.id) router.push(`/projects/${created.id}`)
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    uploading.value = false
  }
}

async function onRemove(row) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」？文件与任务包会一并删除。`, '删除确认', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await projectService.remove(row.id)
    ElMessage.success('已删除')
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
.table {
  background: #fff;
}
.upload-tip {
  padding: 20px 0;
  text-align: center;
  color: #606266;
}
.upload-tip .sub {
  font-size: 12px;
  color: #909399;
}
.parsing {
  margin-top: 12px;
  text-align: center;
  color: #606266;
  min-height: 40px;
}
.preview {
  display: flex;
  gap: 16px;
}
.preview-img {
  flex: none;
  width: 200px;
  max-height: 320px;
  overflow: auto;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #fafafa;
}
.preview-img img {
  width: 100%;
  display: block;
}
.preview-meta {
  flex: 1;
  min-width: 0;
}
.progress {
  width: 100%;
  margin-top: 12px;
}
</style>
