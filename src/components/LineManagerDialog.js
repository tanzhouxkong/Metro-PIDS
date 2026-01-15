import { Teleport, Transition } from 'vue'

export default {
  name: 'LineManagerDialog',
  components: { Teleport, Transition },
  data() {
    return {
      visible: false,
      title: '',
      message: '',
      inputValue: '',
      resolve: null,
      type: 'prompt' // 'prompt', 'alert', 'confirm'
    }
  },
  methods: {
    prompt(message, defaultValue = '', title = '新建文件夹') {
      this.title = title;
      this.message = message;
      this.inputValue = defaultValue || '';
      this.type = 'prompt';
      this.visible = true;
      return new Promise((resolve) => {
        this.resolve = resolve;
      });
    },
    alert(message, title = '提示') {
      this.title = title;
      this.message = message;
      this.type = 'alert';
      this.visible = true;
      return new Promise((resolve) => {
        this.resolve = resolve;
      });
    },
    confirm(message, title = '确认') {
      this.title = title;
      this.message = message;
      this.type = 'confirm';
      this.visible = true;
      return new Promise((resolve) => {
        this.resolve = resolve;
      });
    },
    close(result) {
      const resolver = this.resolve;
      this.resolve = null;
      this.visible = false;
      if (resolver) resolver(result);
    },
    handleConfirm() {
      if (this.type === 'prompt') {
        this.close(this.inputValue);
      } else {
        this.close(true);
      }
    },
    handleCancel() {
      this.close(this.type === 'prompt' ? null : false);
    },
    getDialogIcon() {
      if (this.type === 'alert') return 'fa-info-circle';
      if (this.type === 'confirm') return 'fa-question-circle';
      if (this.type === 'prompt') return 'fa-folder-plus';
      return 'fa-bell';
    },
    getDialogColor() {
      if (this.type === 'alert') return '#1E90FF';
      if (this.type === 'confirm') return '#FF9F43';
      if (this.type === 'prompt') return '#FF9F43';
      return '#1677ff';
    }
  },
  mounted() {
    // 将对话框方法暴露到全局，供其他组件使用
    if (typeof window !== 'undefined') {
      window.__lineManagerDialog = {
        prompt: (msg, defaultValue, title) => this.prompt(msg, defaultValue, title),
        alert: (msg, title) => this.alert(msg, title),
        confirm: (msg, title) => this.confirm(msg, title)
      };
    }
  },
  template: `
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="visible" 
             style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; background:rgba(0,0,0,0.6); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);" 
             @click.self="handleCancel">
          <div @click.stop 
               style="background:var(--card, #ffffff); border-radius:16px; padding:0; width:420px; max-width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1); overflow:hidden; transform:scale(1); transition:transform 0.2s;">
            <!-- Header -->
            <div :style="{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '24px 28px', 
              borderBottom: '1px solid var(--divider, rgba(0,0,0,0.1))', 
              background: 'linear-gradient(135deg, ' + getDialogColor() + '15 0%, ' + getDialogColor() + '08 100%)' 
            }">
              <div style="display:flex; align-items:center; gap:12px;">
                <div :style="{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '10px', 
                  background: 'linear-gradient(135deg, ' + getDialogColor() + ' 0%, ' + getDialogColor() + 'dd 100%)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  boxShadow: '0 4px 12px ' + getDialogColor() + '40' 
                }">
                  <i :class="'fas ' + getDialogIcon()" style="color:white; font-size:18px;"></i>
                </div>
                <div>
                  <div style="margin:0; font-size:20px; font-weight:800; color:var(--text, #333); letter-spacing:-0.5px;">{{ title }}</div>
                  <div style="font-size:12px; color:var(--muted, #999); margin-top:2px;">
                    {{ type === 'alert' ? 'Alert' : type === 'confirm' ? 'Confirm' : 'Prompt' }}
                  </div>
                </div>
              </div>
              <button @click="handleCancel" 
                      style="background:none; border:none; color:var(--muted, #999); cursor:pointer; font-size:20px; padding:8px; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.2s;" 
                      @mouseover="$event.target.style.color='var(--text, #333)'" 
                      @mouseout="$event.target.style.color='var(--muted, #999)'">
                <i class="fas fa-times"></i>
              </button>
            </div>
            
            <!-- Content -->
            <div style="padding:24px 28px; background:var(--bg, #fafafa);">
              <!-- 提示信息 -->
              <div v-if="message" style="margin-bottom:20px; color:var(--text, #333); font-size:14px; line-height:1.7;">{{ message }}</div>
              
              <!-- 输入框：蓝色边框，文字选中 -->
              <input 
                v-if="type === 'prompt'" 
                v-model="inputValue" 
                @keyup.enter="handleConfirm"
                @keyup.esc="handleCancel"
                @focus="$event.target.select(); $event.target.style.borderColor='var(--accent, #1677ff)'"
                @blur="$event.target.style.borderColor='var(--divider, rgba(0,0,0,0.1))'"
                style="width:100%; padding:12px 16px; margin-bottom:20px; border:2px solid var(--divider, rgba(0,0,0,0.1)); border-radius:8px; background:var(--input-bg, #ffffff); color:var(--text, #333); font-size:14px; transition:all 0.2s; outline:none; box-sizing:border-box;"
                autofocus
              />
              
              <!-- 按钮区域 -->
              <div style="display:flex; gap:12px; justify-content:flex-end;">
                <button 
                  v-if="type !== 'alert'"
                  @click="handleCancel"
                  style="padding:10px 20px; background:var(--btn-gray-bg, #f5f5f5); color:var(--btn-gray-text, #666); border:none; border-radius:8px; font-size:14px; font-weight:500; cursor:pointer; transition:all 0.2s; min-width:80px;"
                  @mouseover="$event.target.style.background='var(--bg, #e5e5e5)'"
                  @mouseout="$event.target.style.background='var(--btn-gray-bg, #f5f5f5)'"
                >
                  取消
                </button>
                <button 
                  @click="handleConfirm"
                  :style="{ 
                    padding: '10px 20px', 
                    background: getDialogColor(), 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontSize: '14px', 
                    fontWeight: '600', 
                    cursor: 'pointer', 
                    transition: 'all 0.2s', 
                    minWidth: '80px',
                    boxShadow: '0 4px 12px ' + getDialogColor() + '40'
                  }"
                  @mouseover="$event.target.style.boxShadow='0 6px 16px ' + getDialogColor() + '60'; $event.target.style.transform='translateY(-1px)'"
                  @mouseout="$event.target.style.boxShadow='0 4px 12px ' + getDialogColor() + '40'; $event.target.style.transform='translateY(0)'"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    
    <style>
      .fade-enter-active, .fade-leave-active {
        transition: opacity 0.3s ease;
      }
      .fade-enter-from, .fade-leave-to {
        opacity: 0;
      }
    </style>
  `
}

