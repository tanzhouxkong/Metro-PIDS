import { Teleport, Transition } from 'vue'

export default {
  name: 'UnifiedDialogs',
  components: { Teleport, Transition },
  data() {
    return {
      visible: false,
      title: '',
      msg: '',
      inputVal: '',
      type: 'alert',
      resolve: null,
      // 输入框右键菜单
      inputMenuVisible: false,
      inputMenuX: 0,
      inputMenuY: 0,
      // 分享码对话框专用数据
      shareCode: '',
      shareId: '',
      shareLength: 0,
      copySuccessMsg: ''
    }
  },
  methods: {
    closeDialog(result) {
      const resolver = this.resolve;
      this.resolve = null;
      this.visible = false;
      this.inputMenuVisible = false;
      if (resolver) resolver(result);
    },
    alert(msg, title) { this.title = title || '提示'; this.msg = msg || ''; this.type = 'alert'; this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    confirm(msg, title) { this.title = title || '确认'; this.msg = msg || ''; this.type = 'confirm'; this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    prompt(msg, defaultValue, title) { this.title = title || '输入'; this.msg = msg || ''; this.inputVal = defaultValue || ''; this.type = 'prompt'; this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    showShareCode(code, id, title) { 
      this.title = title || '离线分享'; 
      this.shareCode = code || ''; 
      this.shareId = id || ''; 
      this.shareLength = code ? code.length : 0; 
      this.copySuccessMsg = ''; 
      this.type = 'shareCode'; 
      this.visible = true; 
      return new Promise((res)=>{ this.resolve = res; }) 
    },
    methodsBridge(action, msg, a2, a3) {
      // 提供给 window 桥的实例方法调用；不可用则直接调用
      if (action === 'alert') return this.alert(msg, a2);
      if (action === 'confirm') return this.confirm(msg, a2);
      if (action === 'prompt') return this.prompt(msg, a2, a3);
      if (action === 'shareCode') return this.showShareCode(msg, a2, a3);
      return Promise.resolve();
    },
    async copyShareCode() {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(this.shareCode);
          this.copySuccessMsg = '✓ 已复制到剪贴板';
          setTimeout(() => { this.copySuccessMsg = ''; }, 2000);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = this.shareCode;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          this.copySuccessMsg = '✓ 已复制到剪贴板';
          setTimeout(() => { this.copySuccessMsg = ''; }, 2000);
        }
      } catch (e) {
        console.error('复制失败', e);
        this.copySuccessMsg = '✗ 复制失败';
        setTimeout(() => { this.copySuccessMsg = ''; }, 2000);
      }
    },
    getDialogIcon() {
      if (this.type === 'alert') return 'fa-info-circle';
      if (this.type === 'confirm') return 'fa-question-circle';
      if (this.type === 'prompt') return 'fa-edit';
      if (this.type === 'shareCode') return 'fa-share-alt';
      return 'fa-bell';
    },
    getDialogColor() {
      if (this.type === 'alert') return '#1E90FF';
      if (this.type === 'confirm') return '#FF9F43';
      if (this.type === 'prompt') return '#2ED573';
      if (this.type === 'shareCode') return '#1E90FF';
      return '#1677ff';
    },
    isDarkTheme() {
      try {
        const el = document.documentElement;
        return !!(el && (el.classList.contains('dark') || el.getAttribute('data-theme') === 'dark'));
      } catch (e) {
        return false;
      }
    },
    getGlassBg() {
      return this.isDarkTheme() ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)';
    },
    // 在输入框上显示复制/粘贴右键菜单
    onInputContextMenu(e) {
      try {
        e.preventDefault();
        e.stopPropagation();
        this.inputMenuVisible = true;
        this.inputMenuX = e.clientX;
        this.inputMenuY = e.clientY;
      } catch (err) {}
    },
    closeInputMenu() {
      this.inputMenuVisible = false;
    },
    async copyInput() {
      try {
        const text = this.inputVal || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else if (document && document.execCommand) {
          const input = document.getElementById('ud-input');
          if (input) {
            const prev = input.value;
            input.value = text;
            input.select();
            document.execCommand('copy');
            input.value = prev;
          }
        }
      } catch (e) {
        console.error('复制失败', e);
      } finally {
        this.closeInputMenu();
      }
    },
    async pasteInput() {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (typeof text === 'string') {
            this.inputVal = text;
          }
        }
      } catch (e) {
        console.error('粘贴失败', e);
      } finally {
        this.closeInputMenu();
      }
    }
  },
  mounted() {
    try {
      window.__ui = window.__ui || {};
      window.__ui.dialog = {
        alert: (m,t)=> this.methodsBridge('alert', m, t),
        confirm: (m,t)=> this.methodsBridge('confirm', m, t),
        prompt: (m,d,t)=> this.methodsBridge('prompt', m, d, t),
        shareCode: (code,id,t)=> this.methodsBridge('shareCode', code, id, t)
      };
    } catch(e){}
  },
  template: `
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="visible" 
             id="unified-dialogs" 
             style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; background:transparent; backdrop-filter:none; -webkit-backdrop-filter:none;" 
             @click.self="type !== 'alert' && closeDialog(type==='confirm'?false:null)">
          <div id="ud-box" 
               :style="{ 
                 position: 'relative', 
                 background: getGlassBg(),
                 backdropFilter: 'blur(20px) saturate(180%)',
                 WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                 borderRadius: '16px', 
                 padding: '0', 
                 width: '420px', 
                 maxWidth: '90%', 
                 boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)', 
                 overflow: 'hidden',
                 transform: 'scale(1)',
                 transition: 'transform 0.2s'
               }">
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
                  <div id="ud-title" :style="{ 
                    margin: '0', 
                    fontSize: '20px', 
                    fontWeight: '800', 
                    color: 'var(--text, #333)', 
                    letterSpacing: '-0.5px' 
                  }">{{ title }}</div>
                  <div style="font-size:12px; color:var(--muted, #999); margin-top:2px;">
                    {{ type === 'alert' ? 'Alert' : type === 'confirm' ? 'Confirm' : type === 'prompt' ? 'Prompt' : type === 'shareCode' ? 'Share' : '' }}
                  </div>
                </div>
              </div>
              <button @click="closeDialog(type==='confirm'?false:null)" 
                      style="background:none; border:none; color:var(--muted, #999); cursor:pointer; font-size:20px; padding:8px; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.2s;" 
                      @mouseover="$event.target.style.color='var(--text, #333)'" 
                      @mouseout="$event.target.style.color='var(--muted, #999)'">
                <i class="fas fa-times"></i>
              </button>
            </div>
            
            <!-- Content -->
            <div :style="{ padding:'24px 28px', background: (isDarkTheme() ? 'rgba(30, 30, 30, 0.30)' : 'rgba(255, 255, 255, 0.30)') }">
              <div v-if="type !== 'shareCode'" id="ud-msg" style="margin-bottom:20px; color:var(--text, #333); font-size:14px; line-height:1.7; white-space:pre-wrap;">{{ msg }}</div>
              
              <!-- 分享码显示区域 -->
              <div v-if="type === 'shareCode'" style="margin-bottom: 20px;">
                <div style="margin-bottom: 12px; color:var(--text, #333); font-size:13px; font-weight:600;">分享码：</div>
                <div style="position: relative; background: var(--input-bg, #f8f9fa); border: 2px solid var(--divider, rgba(0,0,0,0.1)); border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto; word-break: break-all; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; line-height: 1.6; color: var(--text, #333); user-select: text; cursor: text;">{{ shareCode }}</div>
                <div v-if="copySuccessMsg" :style="{ 
                  textAlign: 'center', 
                  fontSize: '13px', 
                  color: copySuccessMsg.includes('✓') ? '#2ED573' : '#FF6B6B',
                  fontWeight: '600',
                  marginTop: '12px',
                  animation: 'fadeIn 0.3s'
                }">{{ copySuccessMsg }}</div>
              </div>
              
              <input v-if="type==='prompt'" 
                     v-model="inputVal" 
                     id="ud-input" 
                     @keyup.enter="closeDialog(inputVal)"
                     @keyup.esc="closeDialog(null)"
                     @contextmenu.prevent="onInputContextMenu($event)"
                     style="width:100%; padding:12px 16px; margin-bottom:20px; border:2px solid var(--divider, rgba(0,0,0,0.1)); border-radius:8px; background:var(--input-bg, #ffffff); color:var(--text, #333); font-size:14px; transition:all 0.2s; outline:none; box-sizing:border-box;"
                     @focus="$event.target.style.borderColor='var(--accent, #1677ff)'"
                     @blur="$event.target.style.borderColor='var(--divider, rgba(0,0,0,0.1))'"
                     autofocus />
              <div style="display:flex; gap:12px; justify-content:flex-end;">
                <button v-if="type!=='alert' && type!=='shareCode'" 
                        @click="closeDialog(type==='confirm'?false:null)"
                        class="btn" 
                        style="padding:10px 20px; background:var(--btn-gray-bg, #f5f5f5); color:var(--btn-gray-text, #666); border:none; border-radius:8px; font-size:14px; font-weight:500; cursor:pointer; transition:all 0.2s; min-width:80px;">
                  取消
                </button>
                <button v-if="type==='shareCode'"
                        @click="copyShareCode"
                        class="btn" 
                        style="padding:10px 20px; background:var(--btn-gray-bg, #f5f5f5); color:var(--btn-gray-text, #666); border:none; border-radius:8px; font-size:14px; font-weight:500; cursor:pointer; transition:all 0.2s; min-width:80px;">
                  复制
                </button>
                <button @click="closeDialog(type==='prompt'?inputVal:true)"
                        class="btn" 
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
                        @mouseout="$event.target.style.boxShadow='0 4px 12px ' + getDialogColor() + '40'; $event.target.style.transform='translateY(0)'">
                  {{ type === 'shareCode' ? '关闭' : '确定' }}
                </button>
              </div>
            </div>
          </div>
          <!-- 输入框右键菜单：复制 / 粘贴 -->
          <div v-if="inputMenuVisible"
               :style="{
                 position:'fixed',
                 left: inputMenuX + 'px',
                 top: inputMenuY + 'px',
                 zIndex: 10001,
                 background: isDarkTheme() ? 'rgba(28,28,30,0.95)' : 'rgba(255,255,255,0.97)',
                 borderRadius: '8px',
                 boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                 border: '1px solid var(--divider, rgba(0,0,0,0.1))',
                 padding: '4px 0',
                 minWidth: '120px'
               }"
               @click.stop
               @contextmenu.prevent>
            <div style="padding:8px 14px; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px; color:var(--text,#333);"
                 @click="copyInput">
              <i class="fas fa-copy" style="font-size:12px; width:14px;"></i>
              复制
            </div>
            <div style="height:1px; margin:2px 0; background:var(--divider, rgba(0,0,0,0.12));"></div>
            <div style="padding:8px 14px; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px; color:var(--text,#333);"
                 @click="pasteInput">
              <i class="fas fa-paste" style="font-size:12px; width:14px;"></i>
              粘贴
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
