export default {
  name: 'LineManagerDialog',
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
    <div v-if="visible" style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; background:rgba(0,0,0,0.5);" @click.self="handleCancel">
      <div @click.stop style="background:#fff; border-radius:8px; padding:24px; width:420px; max-width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <!-- 标题：居中显示 -->
        <div style="font-weight:600; font-size:18px; margin-bottom:16px; color:#333; text-align:center;">{{ title }}</div>
        <!-- 提示信息 -->
        <div v-if="message" style="margin-bottom:16px; color:#666; font-size:14px; line-height:1.5;">{{ message }}</div>
        <!-- 输入框：蓝色边框，文字选中 -->
        <input 
          v-if="type === 'prompt'" 
          v-model="inputValue" 
          @keyup.enter="handleConfirm"
          @keyup.esc="handleCancel"
          @focus="$event.target.select()"
          style="width:100%; padding:10px; margin-bottom:20px; border:2px solid #1677ff; border-radius:4px; background:#fff; color:#333; font-size:14px; outline:none; box-sizing:border-box;"
          autofocus
        />
        <!-- 按钮区域 -->
        <div style="display:flex; gap:12px; justify-content:flex-end;">
          <button 
            v-if="type !== 'alert'"
            @click="handleCancel"
            style="padding:8px 20px; background:#fff; color:#333; border:1px solid #d9d9d9; border-radius:4px; font-size:14px; cursor:pointer; transition:all 0.2s; min-width:60px;"
            @mouseover="$event.target.style.borderColor='#bbb'; $event.target.style.backgroundColor='#fafafa'"
            @mouseout="$event.target.style.borderColor='#d9d9d9'; $event.target.style.backgroundColor='#fff'"
          >
            取消
          </button>
          <button 
            @click="handleConfirm"
            style="padding:8px 20px; background:#1677ff; color:#fff; border:none; border-radius:4px; font-size:14px; cursor:pointer; transition:all 0.2s; font-weight:500; min-width:60px;"
            @mouseover="$event.target.style.background='#0958d9'"
            @mouseout="$event.target.style.background='#1677ff'"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  `
}

