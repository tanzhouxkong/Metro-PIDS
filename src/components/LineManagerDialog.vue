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
      </div>
    </Transition>
  </Teleport>
</template>
<script src="./LineManagerDialog.js"></script>
