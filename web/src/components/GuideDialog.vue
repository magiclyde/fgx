<template>
  <el-dialog
    :model-value="visible"
    title="欢迎使用 fgx 设计稿工作台"
    width="620px"
    @update:model-value="$emit('update:visible', $event)"
    @closed="onClosed"
  >
    <div class="guide">
      <section>
        <h4>这个工具是干什么的？</h4>
        <p>
          打通「美术出 PSD → AI 生成页面」的交付流程：上传 PSD 后自动解析出图层结构，
          一键生成给 Claude Code 的任务包，由 AI 把设计稿还原成页面代码。
        </p>
      </section>

      <section>
        <h4>使用流程</h4>
        <ol>
          <li><b>上传 PSD</b>：列表页右上角，浏览器自动解析（仅支持 RGB 模式 .psd，≤500MB）</li>
          <li><b>打开详情</b>：左侧图层树勾选需要的图层，中间画布预览，右侧查看坐标/文本/颜色</li>
          <li><b>生成 Claude 任务包</b> → <b>复制提示词</b>发给 Claude Code，即可开工</li>
        </ol>
      </section>

      <section>
        <h4>详情页几个按钮是干嘛的？</h4>
        <dl>
          <dt>下载 design.json</dt>
          <dd>
            设计稿的「文字版」：画布尺寸 + 完整图层树（名称/类型/坐标/尺寸，文本层含内容/字体/字号/颜色）。
            给程序读的结构化数据，下载主要用于检查解析质量。
          </dd>
          <dt>切图打包</dt>
          <dd>
            把勾选的图层导出成 PNG 并打成 zip——即传统流程里「前端切图」的自动化，
            不用再开 Photoshop。
          </dd>
          <dt>生成 Claude 任务包</dt>
          <dd>
            在服务器上生成一个目录，备齐 Claude Code 干活的所有材料：
            design.json（结构）+ composite.png（整稿效果）+ assets/（你勾选的切图）+
            PROMPT.md（写给 AI 的任务说明书）。复制提示词发给 Claude Code 即可。
          </dd>
        </dl>
      </section>

      <section>
        <h4>小贴士</h4>
        <ul>
          <li>PSD 保存时勾选「最大兼容性」，否则没有整稿预览图（不影响解析与切图）</li>
          <li>切图/任务包只会导出<b>勾选</b>的图层，不分组的图层才能勾选</li>
          <li>右上角「使用说明」可随时重新打开本窗口</li>
        </ul>
      </section>
    </div>

    <template #footer>
      <el-checkbox v-model="dontShowAgain" class="dont-show">不再自动显示</el-checkbox>
      <el-button type="primary" @click="$emit('update:visible', false)">知道了</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'

defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible', 'dismiss'])

const dontShowAgain = ref(false)

function onClosed() {
  if (dontShowAgain.value) emit('dismiss')
}
</script>

<style scoped>
.guide section {
  margin-bottom: 16px;
}
.guide h4 {
  margin: 0 0 6px;
  font-size: 14px;
  color: #303133;
}
.guide p,
.guide li,
.guide dd {
  font-size: 13px;
  color: #606266;
  line-height: 1.7;
}
.guide ol,
.guide ul {
  margin: 0;
  padding-left: 20px;
}
.guide dl {
  margin: 0;
}
.guide dt {
  font-weight: 600;
  color: #303133;
  font-size: 13px;
  margin-top: 6px;
}
.guide dd {
  margin: 2px 0 0;
}
.dont-show {
  float: left;
}
</style>
