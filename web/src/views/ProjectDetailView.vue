<template>
  <div class="detail" v-loading="pageLoading">
    <template v-if="project">
      <!-- 顶部工具条 -->
      <div class="toolbar">
        <div class="left">
          <el-button link @click="$router.push('/')">← 返回</el-button>
          <span class="name">{{ project.name }}</span>
          <span class="meta">{{ design?.meta.width }}×{{ design?.meta.height }} · {{ project.layerCount }} 层</span>
        </div>
        <div class="right">
          <el-button size="small" @click="downloadDesignJson">下载 design.json</el-button>
          <el-button size="small" :disabled="!checkedCount" :loading="slicing" @click="downloadSlices">
            切图打包（{{ checkedCount }}）
          </el-button>
          <el-button size="small" type="primary" @click="packageVisible = true">生成 Claude 任务包</el-button>
        </div>
      </div>

      <div class="workspace">
        <!-- 左：图层树 -->
        <aside class="panel tree-panel">
          <div class="panel-title">图层</div>
          <el-tree
            ref="treeRef"
            :data="treeData"
            node-key="id"
            show-checkbox
            :props="{ label: 'name', children: 'children' }"
            :default-expand-all="false"
            @node-click="onNodeClick"
            @check="onCheck"
          >
            <template #default="{ data }">
              <span :class="{ hidden: !data.visible }">
                <el-icon v-if="data.type === 'group'"><Folder /></el-icon>
                <el-icon v-else-if="data.type === 'text'"><Document /></el-icon>
                <el-icon v-else><Picture /></el-icon>
                {{ data.name }}
              </span>
            </template>
          </el-tree>
        </aside>

        <!-- 中：画布 -->
        <section class="canvas-area">
          <div class="zoom-bar">
            <el-slider v-model="zoom" :min="10" :max="200" :show-tooltip="false" class="zoom-slider" />
            <span>{{ zoom }}%</span>
          </div>
          <div class="canvas-scroll" ref="scrollRef">
            <div v-if="compositeOk" class="canvas-inner" :style="innerStyle">
              <img :src="compositeSrc" class="composite" @error="compositeOk = false" />
              <div v-if="highlightStyle" class="highlight" :style="highlightStyle"></div>
            </div>
            <el-empty v-else description="该 PSD 没有合成预览图（不影响图层解析与切图）" />
          </div>
        </section>

        <!-- 右：属性 -->
        <aside class="panel prop-panel">
          <div class="panel-title">属性</div>
          <template v-if="selected">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="名称">{{ selected.name }}</el-descriptions-item>
              <el-descriptions-item label="类型">{{ typeLabel(selected.type) }}</el-descriptions-item>
              <el-descriptions-item label="可见">{{ selected.visible ? '是' : '否' }}</el-descriptions-item>
              <el-descriptions-item label="位置">x: {{ selected.rect.x }}, y: {{ selected.rect.y }}</el-descriptions-item>
              <el-descriptions-item label="尺寸">{{ selected.rect.w }} × {{ selected.rect.h }}</el-descriptions-item>
            </el-descriptions>
            <template v-if="selected.text">
              <div class="panel-title sub">文本</div>
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="内容">
                  <pre class="text-content">{{ selected.text.content ?? '未提取到' }}</pre>
                </el-descriptions-item>
                <el-descriptions-item label="字体">{{ selected.text.font ?? '未提取到' }}</el-descriptions-item>
                <el-descriptions-item label="字号">{{ selected.text.size ?? '未提取到' }}</el-descriptions-item>
                <el-descriptions-item label="颜色">
                  <span v-if="selected.text.color" class="color-row">
                    <i class="swatch" :style="{ background: selected.text.color }"></i>
                    {{ selected.text.color }}
                  </span>
                  <span v-else>未提取到</span>
                </el-descriptions-item>
              </el-descriptions>
            </template>
          </template>
          <el-empty v-else description="点击左侧图层查看属性" :image-size="60" />
        </aside>
      </div>
    </template>

    <!-- 任务包对话框 -->
    <el-dialog v-model="packageVisible" title="生成 Claude 任务包" width="560px" :close-on-click-modal="false">
      <template v-if="!packageResult">
        <el-form label-width="100px">
          <el-form-item label="目标技术栈">
            <el-radio-group v-model="packageTarget">
              <el-radio value="vant">Vue3 + Vant（移动端）</el-radio>
              <el-radio value="element">Vue3 + Element Plus（PC 端）</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="切图">
            <span v-if="checkedCount">包含勾选的 {{ checkedCount }} 个图层切片</span>
            <span v-else class="warn">未勾选图层，任务包将不包含切图（可先在左侧树勾选）</span>
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-alert type="success" :closable="false" class="pkg-alert">
          <p>任务包已生成：</p>
          <p class="pkg-path">{{ packageResult.path }}</p>
        </el-alert>
        <el-input v-model="packageResult.prompt" type="textarea" :rows="3" readonly class="pkg-prompt" />
      </template>
      <template #footer>
        <template v-if="!packageResult">
          <el-button @click="packageVisible = false">取消</el-button>
          <el-button type="primary" :loading="packaging" @click="createPackage">生成</el-button>
        </template>
        <template v-else>
          <el-button @click="packageVisible = false">关闭</el-button>
          <el-button type="primary" @click="copyPrompt">复制提示词</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Folder, Document, Picture } from '@element-plus/icons-vue'
import { projectService } from '@/services/projectService'
import { parsePsd, collectCanvases } from '@/psd/parse'
import { buildSlicesZip, downloadBlob, canvasToBlob, sanitizeName } from '@/psd/slices'

const route = useRoute()
const id = route.params.id

const pageLoading = ref(true)
const project = ref(null)
const design = ref(null)
const compositeSrc = projectService.compositeUrl(id)
const compositeOk = ref(true)

const treeRef = ref(null)
const selected = ref(null)
const zoom = ref(100)
const checkedCount = ref(0)

const slicing = ref(false)
const packageVisible = ref(false)
const packageTarget = ref('vant')
const packaging = ref(false)
const packageResult = ref(null)

// 懒加载的 PSD 重解析结果（切图用）
let canvases = null

const treeData = computed(() => design.value?.layers || [])

const innerStyle = computed(() => {
  const w = design.value?.meta.width || 0
  const h = design.value?.meta.height || 0
  const s = zoom.value / 100
  return { width: `${w * s}px`, height: `${h * s}px` }
})

const highlightStyle = computed(() => {
  const r = selected.value?.rect
  if (!r || r.w <= 0 || r.h <= 0) return null
  const s = zoom.value / 100
  return {
    left: `${r.x * s}px`,
    top: `${r.y * s}px`,
    width: `${r.w * s}px`,
    height: `${r.h * s}px`,
  }
})

function typeLabel(t) {
  return { group: '分组', text: '文本层', layer: '图像层' }[t] || t
}

function onNodeClick(node) {
  selected.value = node
}

function onCheck() {
  checkedCount.value = treeRef.value?.getCheckedNodes(true).filter((n) => n.type !== 'group').length || 0
}

// 重新拉取 original.psd 并解析出各层 canvas（切图前调用一次）
async function ensureCanvases() {
  if (canvases) return canvases
  ElMessage.info('正在重新解析 PSD 以提取切图…')
  const buffer = await projectService.fetchOriginal(id)
  const { psd } = parsePsd(buffer, project.value.name)
  canvases = collectCanvases(psd)
  return canvases
}

function checkedLayers() {
  const nodes = treeRef.value?.getCheckedNodes(true) || []
  return nodes.filter((n) => n.type !== 'group')
}

async function downloadSlices() {
  const layers = checkedLayers()
  if (!layers.length) return
  slicing.value = true
  try {
    const map = await ensureCanvases()
    const selectedSlices = layers
      .filter((n) => map.has(n.id))
      .map((n) => ({ id: n.id, name: n.name, canvas: map.get(n.id) }))
    const skipped = layers.length - selectedSlices.length
    if (!selectedSlices.length) {
      ElMessage.warning('勾选的图层没有可导出的图像数据')
      return
    }
    const blob = await buildSlicesZip(selectedSlices)
    downloadBlob(blob, `${sanitizeName(project.value.name)}-slices.zip`)
    ElMessage.success(skipped ? `已打包 ${selectedSlices.length} 张，${skipped} 层无图像数据被跳过` : `已打包 ${selectedSlices.length} 张切图`)
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    slicing.value = false
  }
}

function downloadDesignJson() {
  const a = document.createElement('a')
  a.href = projectService.designUrl(id)
  a.download = `${sanitizeName(project.value.name)}-design.json`
  a.click()
}

async function createPackage() {
  packaging.value = true
  try {
    const fd = new FormData()
    fd.append('target', packageTarget.value)
    const layers = checkedLayers()
    if (layers.length) {
      const map = await ensureCanvases()
      for (const n of layers) {
        const canvas = map.get(n.id)
        if (canvas) fd.append('slices', await canvasToBlob(canvas), `${sanitizeName(n.name)}.png`)
      }
    }
    packageResult.value = await projectService.createPackage(id, fd)
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    packaging.value = false
  }
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(packageResult.value.prompt)
    ElMessage.success('已复制，粘贴给 Claude Code 即可开工')
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制')
  }
}

onMounted(async () => {
  try {
    const [p, d] = await Promise.all([projectService.detail(id), projectService.fetchDesign(id)])
    project.value = p
    design.value = d
    // 初始缩放：画布宽度适应可视区域
    const scrollEl = document.querySelector('.canvas-scroll')
    if (scrollEl && d?.meta?.width) {
      zoom.value = Math.max(10, Math.min(100, Math.floor((scrollEl.clientWidth - 40) / d.meta.width * 100)))
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    pageLoading.value = false
  }
})
</script>

<style scoped>
.detail {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.toolbar {
  flex: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
.toolbar .left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.toolbar .name {
  font-weight: 600;
}
.toolbar .meta {
  color: #909399;
  font-size: 13px;
}
.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
}
.panel {
  background: #fff;
  overflow: auto;
  padding: 8px;
}
.tree-panel {
  width: 280px;
  flex: none;
  border-right: 1px solid #e4e7ed;
}
.prop-panel {
  width: 300px;
  flex: none;
  border-left: 1px solid #e4e7ed;
}
.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  padding: 6px 8px;
}
.panel-title.sub {
  margin-top: 12px;
}
.hidden {
  opacity: 0.45;
}
.canvas-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.zoom-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  font-size: 13px;
  color: #606266;
}
.zoom-slider {
  width: 200px;
}
.canvas-scroll {
  flex: 1;
  overflow: auto;
  padding: 20px;
}
.canvas-inner {
  position: relative;
  margin: 0 auto;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}
.composite {
  width: 100%;
  height: 100%;
  display: block;
}
.highlight {
  position: absolute;
  border: 2px solid #f56c6c;
  background: rgba(245, 108, 108, 0.15);
  pointer-events: none;
}
.text-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1px solid #dcdfe6;
  border-radius: 2px;
}
.warn {
  color: #e6a23c;
}
.pkg-alert {
  margin-bottom: 12px;
}
.pkg-path {
  font-family: monospace;
  word-break: break-all;
}
.pkg-prompt {
  margin-top: 8px;
}
</style>
