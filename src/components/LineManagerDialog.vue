<template>
  <Teleport to="body">
    <Transition name="cp-fade">
      <div
        v-if="visible"
        class="cp-overlay cp-overlay--unified"
        @click.self="onOverlayClick"
      >
        <div
          class="cp-dialog cp-dialog--compact"
          role="dialog"
          aria-modal="true"
          v-glassmorphism="glassDirective"
          @click.stop
        >
          <div class="cp-header">
            <div class="cp-header-left">
              <div class="cp-icon" :style="iconBoxStyle">
                <i :class="'fas ' + getDialogIcon()" style="color: white; font-size: 18px;"></i>
              </div>
              <div class="cp-titles">
                <div class="cp-title">{{ title }}</div>
              </div>
            </div>
            <button type="button" class="cp-close" :aria-label="tCp('closeLabel')" @click="handleCancel">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="cp-content">
            <p v-if="message" class="ud-msg">{{ message }}</p>
            <input
              v-if="type === 'prompt'"
              id="lm-dialog-input"
              v-model="inputValue"
              type="text"
              class="cp-input cp-input--dialog"
              style="margin-top: 16px;"
              @keyup.enter="handleConfirm"
              @keyup.esc="handleCancel"
              @contextmenu.prevent="onInputContextMenu($event)"
              autofocus
            />
          </div>

          <div v-if="type === 'alert'" class="cp-footer cp-footer--end">
            <div class="cp-footer-right">
              <button type="button" class="cp-btn cp-btn-primary" @click="handleConfirm">
                {{ tCp('btnConfirm') }}
              </button>
            </div>
          </div>

          <div v-else class="cp-footer cp-footer--end">
            <div class="cp-footer-right">
              <button type="button" class="cp-btn cp-btn-gray" @click="handleCancel">
                {{ tCp('btnCancel') }}
              </button>
              <button type="button" class="cp-btn cp-btn-primary" @click="handleConfirm">
                {{ tCp('btnConfirm') }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="inputMenuVisible"
          ref="inputMenuRef"
          class="station-context-menu station-context-menu--glass-shell"
          v-glassmorphism="glassDirective"
          :style="{
            left: inputMenuX + 'px',
            top: inputMenuY + 'px',
            zIndex: 1000010,
            minWidth: '120px'
          }"
          @click.stop
          @contextmenu.prevent
        >
          <div
            class="station-context-menu-item"
            @click="copyInput"
          >
            <i class="fas fa-copy" style="font-size:12px;width:14px;"></i>
            {{ tUd('copy') }}
          </div>
          <div class="station-context-menu-divider"></div>
          <div
            class="station-context-menu-item"
            @click="pasteInput"
          >
            <i class="fas fa-paste" style="font-size:12px;width:14px;"></i>
            {{ tUd('paste') }}
          </div>
        </div>
        <div
          v-if="inputMenuVisible"
          class="station-context-menu-mask"
          style="z-index: 1000009;"
          @click="closeInputMenu"
        ></div>
      </div>
    </Transition>
  </Teleport>
</template>
<script src="./LineManagerDialog.js"></script>
