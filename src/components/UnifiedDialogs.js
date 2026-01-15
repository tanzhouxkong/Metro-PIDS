import { Teleport, Transition } from 'vue'

export default {
  name: 'UnifiedDialogs',
  components: { Teleport, Transition },
  data() { return { visible: false, title: '', msg: '', inputVal: '', type: 'alert', resolve: null } },
  methods: {
    closeDialog(result) {
      const resolver = this.resolve;
      this.resolve = null;
      this.visible = false;
      if (resolver) resolver(result);
    },
    alert(msg, title) { this.title = title || '提示'; this.msg = msg || ''; this.type = 'alert'; this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    confirm(msg, title) { this.title = title || '确认'; this.msg = msg || ''; this.type = 'confirm'; this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    prompt(msg, defaultValue, title) { this.title = title || '输入'; this.msg = msg || ''; this.inputVal = defaultValue || ''; this.type = 'prompt'; this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    methodsBridge(action, msg, a2, a3) {
      // 提供给 window 桥的实例方法调用；不可用则直接调用
      if (action === 'alert') return this.alert(msg, a2);
      if (action === 'confirm') return this.confirm(msg, a2);
      if (action === 'prompt') return this.prompt(msg, a2, a3);
      return Promise.resolve();
    },
    getDialogIcon() {
      if (this.type === 'alert') return 'fa-info-circle';
      if (this.type === 'confirm') return 'fa-question-circle';
      if (this.type === 'prompt') return 'fa-edit';
      return 'fa-bell';
    },
    getDialogColor() {
      if (this.type === 'alert') return '#1E90FF';
      if (this.type === 'confirm') return '#FF9F43';
      if (this.type === 'prompt') return '#2ED573';
      return '#1677ff';
    }
  },
  mounted() {
    try {
      window.__ui = window.__ui || {};
      window.__ui.dialog = {
        alert: (m,t)=> this.methodsBridge('alert', m, t),
        confirm: (m,t)=> this.methodsBridge('confirm', m, t),
        prompt: (m,d,t)=> this.methodsBridge('prompt', m, d, t)
      };
    } catch(e){}
  },
  template: `
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="visible" 
             id="unified-dialogs" 
             style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; background:rgba(0,0,0,0.6); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);" 
             @click.self="type !== 'alert' && closeDialog(type==='confirm'?false:null)">
          <div id="ud-box" 
               :style="{ 
                 position: 'relative', 
                 background: 'var(--card, #ffffff)', 
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
                    {{ type === 'alert' ? 'Alert' : type === 'confirm' ? 'Confirm' : 'Prompt' }}
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
            <div style="padding:24px 28px; background:var(--bg, #fafafa);">
              <div id="ud-msg" style="margin-bottom:20px; color:var(--text, #333); font-size:14px; line-height:1.7; white-space:pre-wrap;">{{ msg }}</div>
              <input v-if="type==='prompt'" 
                     v-model="inputVal" 
                     id="ud-input" 
                     @keyup.enter="closeDialog(inputVal)"
                     @keyup.esc="closeDialog(null)"
                     style="width:100%; padding:12px 16px; margin-bottom:20px; border:2px solid var(--divider, rgba(0,0,0,0.1)); border-radius:8px; background:var(--input-bg, #ffffff); color:var(--text, #333); font-size:14px; transition:all 0.2s; outline:none; box-sizing:border-box;"
                     @focus="$event.target.style.borderColor='var(--accent, #1677ff)'"
                     @blur="$event.target.style.borderColor='var(--divider, rgba(0,0,0,0.1))'"
                     autofocus />
              <div style="display:flex; gap:12px; justify-content:flex-end;">
                <button v-if="type!=='alert'" 
                        @click="closeDialog(type==='confirm'?false:null)"
                        class="btn" 
                        style="padding:10px 20px; background:var(--btn-gray-bg, #f5f5f5); color:var(--btn-gray-text, #666); border:none; border-radius:8px; font-size:14px; font-weight:500; cursor:pointer; transition:all 0.2s; min-width:80px;">
                  取消
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
