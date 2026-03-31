<template>

    <Teleport to="body">
      <Transition name="cp-fade">
        <div
          v-if="visible"
          id="unified-dialogs"
          class="cp-overlay cp-overlay--unified"
          @click.self="onOverlayClick"
        >
          <div
            id="ud-box"
            class="cp-dialog cp-dialog--compact"
            role="dialog"
            aria-modal="true"
            v-glassmorphism="{ blur: 12, opacity: 0.2, color: '#ffffff' }"
            @click.stop
          >
            <div class="cp-header">
              <div class="cp-header-left">
                <div class="cp-icon" :style="iconBoxStyle">
                  <i :class="'fas ' + getDialogIcon()" style="color:white;font-size:18px;"></i>
                </div>
                <div class="cp-titles">
                  <div id="ud-title" class="cp-title">{{ title }}</div>
                </div>
              </div>
              <button
                type="button"
                class="cp-close"
                @click="closeDialog(type === 'confirm' ? false : null)"
                :aria-label="tCp('closeLabel')"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>

            <div class="cp-content">
              <p v-if="type !== 'shareCode'" id="ud-msg" class="ud-msg">{{ msg }}</p>
              <template v-if="type === 'shareCode'">
                <label class="ud-share-label">{{ tUd('shareCodeLabel') }}</label>
                <div class="ud-share-code">{{ shareCode }}</div>
              </template>
              <input
                v-if="type === 'prompt'"
                v-model="inputVal"
                id="ud-input"
                type="text"
                class="cp-input cp-input--dialog"
                style="margin-top:16px;"
                @keyup.enter="closeDialog(inputVal)"
                @keyup.esc="closeDialog(null)"
                @contextmenu.prevent="onInputContextMenu($event)"
                autofocus
              />
            </div>

            <div v-if="type === 'alert'" class="cp-footer cp-footer--end">
              <div class="cp-footer-right">
                <button type="button" class="cp-btn cp-btn-primary" @click="closeDialog(true)">
                  {{ tCp('btnConfirm') }}
                </button>
              </div>
            </div>

            <div v-else-if="type === 'confirm' || type === 'prompt'" class="cp-footer cp-footer--end">
              <div class="cp-footer-right">
                <button type="button" class="cp-btn cp-btn-gray" @click="closeDialog(type === 'confirm' ? false : null)">
                  {{ tCp('btnCancel') }}
                </button>
                <button type="button" class="cp-btn cp-btn-primary" @click="closeDialog(type === 'prompt' ? inputVal : true)">
                  {{ tCp('btnConfirm') }}
                </button>
              </div>
            </div>

            <div v-else-if="type === 'shareCode'" class="cp-footer">
              <button type="button" class="cp-btn cp-btn-gray" @click="copyShareCode">
                {{ tUd('copy') }}
              </button>
              <div class="cp-footer-right">
                <button type="button" class="cp-btn cp-btn-primary" @click="closeDialog(true)">
                  {{ tCp('closeLabel') }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="inputMenuVisible"
            :style="{
              position:'fixed',
              left: inputMenuX + 'px',
              top: inputMenuY + 'px',
              zIndex: 1000010,
              background: isDarkTheme() ? 'rgba(28,28,30,0.95)' : 'rgba(255,255,255,0.97)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              border: '1px solid var(--divider, rgba(0,0,0,0.1))',
              padding: '4px 0',
              minWidth: '120px'
            }"
            @click.stop
            @contextmenu.prevent
          >
            <div
              style="padding:8px 14px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--text,#333);"
              @click="copyInput"
            >
              <i class="fas fa-copy" style="font-size:12px;width:14px;"></i>
              {{ tUd('copy') }}
            </div>
            <div style="height:1px;margin:2px 0;background:var(--divider, rgba(0,0,0,0.12));"></div>
            <div
              style="padding:8px 14px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--text,#333);"
              @click="pasteInput"
            >
              <i class="fas fa-paste" style="font-size:12px;width:14px;"></i>
              {{ tUd('paste') }}
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

</template>
<script src="./UnifiedDialogs.js"></script>
