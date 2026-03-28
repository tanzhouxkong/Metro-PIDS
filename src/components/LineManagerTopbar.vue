<template>

        <div class="custom-titlebar lmw-titlebar" :class="{ darwin: isDarwin, linux: isLinux }">
            <div class="lmw-titlebar-left" style="-webkit-app-region: drag;">
                <i class="fas fa-folder-open" :style="{ color: titleColor, fontSize: '16px' }"></i>
                <span :style="{ fontSize: '13px', fontWeight: 600, color: titleColor, whiteSpace: 'nowrap' }">线路管理器</span>
            </div>
            <div class="lmw-titlebar-slot">
                <slot></slot>
            </div>
            <div class="lmw-titlebar-spacer"></div>
        </div>
    
</template>
<script src="./LineManagerTopbar.js"></script>
