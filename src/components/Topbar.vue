<template>

        <div class="custom-titlebar" :class="{ darwin: isDarwin, linux: isLinux }" :style="titlebarStyle">
            <div :style="titleInnerStyle">
                <i class="fas fa-subway" :style="iconStyle"></i>
                <span :style="titleTextStyle">Metro PIDS Control</span>
                <span v-if="appVersion" :style="versionChipStyle">v{{ appVersion }}</span>
            </div>
        </div>
    
</template>
<script src="./Topbar.js"></script>
