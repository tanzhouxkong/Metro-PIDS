<template>

    <div class="pids-ant-page" style="flex:1; display:flex; flex-direction:column; overflow:auto; background:var(--bg);">
      <div v-if="hasSlidePanelError" style="margin:24px; padding:16px; border:1px solid var(--divider, rgba(0,0,0,0.12)); border-radius:12px; background:var(--card, #fff); color:var(--text, #222);">
        <div style="font-weight:700; margin-bottom:8px;">设置页加载失败，已进入安全模式。</div>
        <div style="font-size:12px; color:var(--muted, #777); margin-bottom:12px; white-space:pre-wrap; word-break:break-word;">{{ slidePanelErrorMessage }}</div>
        <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
          <button class="se-btn se-btn-green" @click="recoverSlidePanel">重试加载设置页</button>
          <button class="se-btn se-btn-gray" @click="copyDiagnosticLog">复制诊断日志</button>
        </div>
        <textarea
          readonly
          :value="slidePanelDiagnosticLog"
          style="width:100%; min-height:160px; padding:8px; font-size:12px; line-height:1.45; border:1px solid var(--divider, rgba(0,0,0,0.12)); border-radius:8px; background:var(--bg, #f8f8f8); color:var(--text, #222); resize:vertical;"
        />
      </div>
      <SlidePanel v-else :key="slidePanelRenderKey" />
    </div>
  
</template>
<script src="./SettingsPage.js"></script>
