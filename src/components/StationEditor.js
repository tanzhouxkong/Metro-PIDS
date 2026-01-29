<<<<<<< HEAD
import { reactive, ref, watch, h, onBeforeUnmount } from 'vue';
=======
import { reactive, ref, watch, computed, Teleport, Transition } from 'vue';
>>>>>>> feature/ui-update
import ColorPicker from './ColorPicker.js';

export default {
  name: 'StationEditor',
<<<<<<< HEAD
  components: { ColorPicker },
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    station: {
      type: Object,
      default: () => ({})
    },
    isNew: {
      type: Boolean,
      default: false
    }
=======
  components: { Teleport, Transition, ColorPicker },
  props: {
    modelValue: { type: Boolean, default: false },
    station: { type: Object, default: () => ({}) },
    isNew: { type: Boolean, default: false }
>>>>>>> feature/ui-update
  },
  emits: ['update:modelValue', 'save'],
  setup(props, { emit }) {
    const form = reactive({
      name: '',
      en: '',
      skip: false,
      door: 'left',
      dock: 'both',
<<<<<<< HEAD
      // 折返标记: 'none' | 'pre' | 'post'
      turnback: 'none',
=======
      turnback: 'none', // 'none' | 'pre' | 'post'
>>>>>>> feature/ui-update
      xfer: [],
      expressStop: false
    });

<<<<<<< HEAD
    // 监听 station 变更以同步表单
    watch(() => props.station, (newVal) => {
      if (newVal) {
        form.name = newVal.name || '';
        form.en = newVal.en || '';
        form.skip = newVal.skip || false;
        form.door = newVal.door || 'left';
        form.dock = newVal.dock || 'both';
        form.turnback = newVal.turnback || 'none';
        form.expressStop = newVal.expressStop !== undefined ? !!newVal.expressStop : false;
        // 深拷贝换乘数组，避免直接改 props
        form.xfer = newVal.xfer ? JSON.parse(JSON.stringify(newVal.xfer.map(x => ({
          ...x,
          exitTransfer: x.exitTransfer || false // 确保 exitTransfer 字段存在
        })))) : [];
      }
    }, { immediate: true, deep: true });

    const close = () => {
      try { console.log('[StationEditor] close -> emit update:modelValue false'); } catch(e){}
      emit('update:modelValue', false);
    };

    const save = () => {
      if (!form.name) return; // 基础校验
      try { console.log('[StationEditor] save -> emitting save with', JSON.parse(JSON.stringify(form))); } catch(e){}
=======
    watch(() => props.station, (newVal) => {
      if (!newVal) return;
      form.name = newVal.name || '';
      form.en = newVal.en || '';
      form.skip = newVal.skip || false;
      form.door = newVal.door || 'left';
      form.dock = newVal.dock || 'both';
      form.turnback = newVal.turnback || 'none';
      form.expressStop = newVal.expressStop !== undefined ? !!newVal.expressStop : false;
      form.xfer = newVal.xfer
        ? JSON.parse(JSON.stringify(newVal.xfer.map(x => ({ ...x, exitTransfer: x.exitTransfer || false }))))
        : [];
    }, { immediate: true, deep: true });

    const isDarkTheme = computed(() => {
      try {
        const el = document.documentElement;
        return !!(el && (el.classList.contains('dark') || el.getAttribute('data-theme') === 'dark'));
      } catch (e) {
        return false;
      }
    });

    const close = () => emit('update:modelValue', false);
    const save = () => {
      if (!form.name) return;
>>>>>>> feature/ui-update
      emit('save', JSON.parse(JSON.stringify(form)));
      close();
    };

    const addXfer = () => {
<<<<<<< HEAD
      form.xfer.push({
        line: '',
        color: '#000000',
        suspended: false,
        exitTransfer: false // 出站换乘标记
      });
    };

    const removeXfer = (index) => {
      form.xfer.splice(index, 1);
    };

    const toggleXferSuspended = (index) => {
      const xf = form.xfer[index];
      xf.suspended = !xf.suspended;
      // 如果设置为暂缓，自动关闭出站换乘
      if (xf.suspended) {
        xf.exitTransfer = false;
      }
    };

    const toggleExitTransfer = (index) => {
      const xf = form.xfer[index];
      xf.exitTransfer = !xf.exitTransfer;
      // 如果设置为出站换乘，自动关闭暂缓
      if (xf.exitTransfer) {
        xf.suspended = false;
      }
    };

    // 颜色选择器
    const showColorPicker = ref(false);
    const colorPickerIndex = ref(-1);
    const colorPickerInitialColor = ref('#000000');
    
    // 打开颜色选择器
    const openColorPicker = (xfIndex) => {
      colorPickerIndex.value = xfIndex;
      colorPickerInitialColor.value = form.xfer[xfIndex].color || '#808080';
      showColorPicker.value = true;
    };
    
    // 确认颜色选择
=======
      form.xfer.push({ line: '', color: '#000000', suspended: false, exitTransfer: false });
    };
    const removeXfer = (index) => form.xfer.splice(index, 1);
    const toggleXferSuspended = (index) => {
      const xf = form.xfer[index];
      xf.suspended = !xf.suspended;
      if (xf.suspended) xf.exitTransfer = false;
    };
    const toggleExitTransfer = (index) => {
      const xf = form.xfer[index];
      xf.exitTransfer = !xf.exitTransfer;
      if (xf.exitTransfer) xf.suspended = false;
    };

    // Color picker
    const showColorPicker = ref(false);
    const colorPickerIndex = ref(-1);
    const colorPickerInitialColor = ref('#000000');
    const openColorPicker = (idx) => {
      colorPickerIndex.value = idx;
      colorPickerInitialColor.value = form.xfer[idx]?.color || '#808080';
      showColorPicker.value = true;
    };
>>>>>>> feature/ui-update
    const onColorConfirm = (color) => {
      if (colorPickerIndex.value >= 0 && form.xfer[colorPickerIndex.value]) {
        form.xfer[colorPickerIndex.value].color = color;
      }
      colorPickerIndex.value = -1;
    };
<<<<<<< HEAD
    
    // 取色功能（保留作为快捷方式）
    const hasElectronAPI = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick;
    
    const pickColor = async (xfIndex) => {
      if (hasElectronAPI && window.electronAPI.startColorPick) {
        try {
          const result = await window.electronAPI.startColorPick();
          if (result && result.ok && result.color) {
            form.xfer[xfIndex].color = result.color;
          }
        } catch (e) {
          console.error('取色失败:', e);
        }
      } else {
        // 如果没有 Electron API，打开颜色选择器
        openColorPicker(xfIndex);
      }
    };


    return () => {
      if (!props.modelValue) return null;

      return h('div', {
        style: {
          position: 'fixed',
          inset: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: '10001'
        },
        onClick: (e) => {
          if (e.target === e.currentTarget) close();
        }
      }, [
        h('div', {
          style: {
            background: 'var(--card, #ffffff)',
            padding: '0',
            borderRadius: '16px',
            width: '680px',
            maxWidth: '95%',
            maxHeight: '85vh',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)',
            color: 'var(--text)',
            display: 'flex',
            flexDirection: 'column'
          }
        }, [
          // 顶部区域 - Header
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '24px 28px',
              borderBottom: '1px solid var(--divider, rgba(0,0,0,0.1))',
              background: 'linear-gradient(135deg, rgba(22,119,255,0.05) 0%, rgba(255,159,67,0.05) 100%)'
            }
          }, [
            h('div', { 
              style: { 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px' 
              } 
            }, [
              h('div', {
                style: {
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #1677ff 0%, #FF9F43 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(22,119,255,0.3)'
                }
              }, [
                h('i', { class: props.isNew ? 'fas fa-plus' : 'fas fa-edit', style: { color: 'white', fontSize: '18px' } })
              ]),
              h('div', {}, [
                h('div', { 
                  style: { 
                    fontWeight: '800', 
                    fontSize: '20px', 
                    letterSpacing: '-0.5px',
                    color: 'var(--text, #333)'
                  } 
                }, props.isNew ? '新建站点' : '站点编辑'),
                h('div', {
                  style: {
                    fontSize: '12px',
                    color: 'var(--muted, #999)',
                    marginTop: '2px'
                  }
                }, props.isNew ? 'New Station' : 'Edit Station')
              ])
            ]),
            h('button', {
              style: { 
                background: 'none', 
                border: 'none', 
                color: 'var(--muted, #999)', 
                cursor: 'pointer', 
                fontSize: '20px', 
                padding: '8px', 
                width: '36px', 
                height: '36px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                borderRadius: '8px', 
                transition: 'all 0.2s' 
              },
              onMouseover: (e) => {
                e.target.style.color = 'var(--text, #333)';
              },
              onMouseout: (e) => {
                e.target.style.color = 'var(--muted, #999)';
              },
              onClick: close
            }, [
              h('i', { class: 'fas fa-times' })
            ])
          ]),
          // Content Area
          h('div', {
            style: {
              flex: '1',
              overflow: 'auto',
              padding: '24px 28px',
              background: 'var(--bg, #fafafa)'
            }
          }, [

          // 站名输入
          h('div', { style: { display: 'flex', gap: '12px', marginBottom: '16px' } }, [
            h('div', { style: { flex: '1' } }, [
                h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '中文站名'),
                h('input', {
                  value: form.name,
                  onInput: (e) => form.name = e.target.value,
                  placeholder: '例如: 人民广场',
                  style: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--divider)', background: 'var(--input-bg)', color: 'var(--text)' }
                })
            ]),
            h('div', { style: { flex: '1' } }, [
                h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '英文站名 (English)'),
                h('input', {
                  value: form.en,
                  onInput: (e) => form.en = e.target.value,
                  placeholder: 'e.g. People\'s Square',
                  style: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--divider)', background: 'var(--input-bg)', color: 'var(--text)' }
                })
            ])
          ]),

          // 运营状态与开门侧
          h('div', { style: { marginBottom: '20px', display: 'flex', gap: '12px' } }, [
            // 运营状态
            h('div', { style: { flex: '1' } }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '站点状态 (Status)'),
              h('div', { style: { display: 'flex', background: 'var(--input-bg)', padding: '4px', borderRadius: '6px' } }, [
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: !form.skip ? 'var(--input-bg)' : 'transparent', color: !form.skip ? 'var(--accent)' : 'var(--muted)', fontWeight: 'bold', boxShadow: !form.skip ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.skip = false
                }, '正常运营'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.skip ? 'var(--input-bg)' : 'transparent', color: form.skip ? 'var(--btn-org-bg)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.skip ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.skip = true
                }, '暂缓开通')
              ])
            ]),
            // 开门方向
            h('div', { style: { flex: '1' } }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '开门方向 (Door)'),
              h('div', { style: { display: 'flex', background: 'var(--input-bg)', padding: '4px', borderRadius: '6px' } }, [
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.door === 'left' ? 'var(--accent)' : 'transparent', color: form.door === 'left' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.door === 'left' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.door = 'left'
                }, '左侧'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.door === 'right' ? 'var(--accent)' : 'transparent', color: form.door === 'right' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.door === 'right' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.door = 'right'
                }, '右侧'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.door === 'both' ? 'var(--accent)' : 'transparent', color: form.door === 'both' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.door === 'both' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.door = 'both'
                }, '双侧')
              ])
            ])
        ,
          // 停靠方向（仅允许上/下/双）
          h('div', { style: { flex: '1' } }, [
            h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '停靠方向 (Dock)'),
            h('div', { style: { display: 'flex', background: 'var(--input-bg)', padding: '4px', borderRadius: '6px' } }, [
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.dock === 'up' ? 'var(--accent)' : 'transparent', color: form.dock === 'up' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.dock === 'up' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => form.dock = 'up'
              }, '仅上行'),
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.dock === 'down' ? 'var(--accent)' : 'transparent', color: form.dock === 'down' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.dock === 'down' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => form.dock = 'down'
              }, '仅下行'),
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.dock === 'both' ? 'var(--accent)' : 'transparent', color: form.dock === 'both' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.dock === 'both' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => form.dock = 'both'
              }, '双向')
            ])
          ])
          ]),

          // 折返设置 + 大站停靠同一行
          h('div', { style: { flex: '1', display:'flex', gap:'12px', alignItems:'stretch', marginTop:'12px' } }, [
            h('div', { style: { flex: '1' } }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '折返位置 (Turnback)'),
              h('div', { style: { display: 'flex', background: 'var(--input-bg)', padding: '4px', borderRadius: '6px' } }, [
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.turnback === 'none' ? 'var(--accent)' : 'transparent', color: form.turnback === 'none' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.turnback === 'none' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.turnback = 'none'
                }, '无'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.turnback === 'pre' ? 'var(--accent)' : 'transparent', color: form.turnback === 'pre' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.turnback === 'pre' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.turnback = 'pre'
                }, '站前折返'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.turnback === 'post' ? 'var(--accent)' : 'transparent', color: form.turnback === 'post' ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.turnback === 'post' ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.turnback = 'post'
                }, '站后折返')
              ])
            ]),
            h('div', { style: { width:'160px', display:'flex', flexDirection:'column', gap:'6px' } }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)' } }, '大站停靠'),
            h('div', { style: { display:'flex', background: 'var(--input-bg)', padding: '4px', borderRadius: '6px' } }, [
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.expressStop ? 'var(--accent)' : 'transparent', color: form.expressStop ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.expressStop ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => { form.expressStop = true; }
              }, '停靠'),
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: !form.expressStop ? 'var(--accent)' : 'transparent', color: !form.expressStop ? '#fff' : 'var(--muted)', fontWeight: 'bold', boxShadow: !form.expressStop ? '0 1px 6px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => { form.expressStop = false; }
              }, '跳过')
            ])
            ])
          ]),

          h('div', { style: { height:'12px' }}, []),

          // 换乘设置
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px dashed var(--divider)'
            }
          }, [
            h('span', { style: { fontWeight: 'bold', fontSize: '14px' } }, '换乘线路'),
            h('button', {
              class: 'btn',
              style: { background: 'var(--input-bg)', color: 'var(--accent)', fontSize: '12px', padding: '6px 12px', boxShadow:'0 4px 12px rgba(0,0,0,0.12)', borderRadius:'6px' },
              onClick: (e) => { e.preventDefault(); addXfer(); }
            }, '+ 添加换乘')
          ]),

          h('div', { style: { height:'4px' }}, []),

          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, form.xfer.map((xf, idx) => {
            return h('div', { key: idx, style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
              h('input', {
                value: xf.line,
                onInput: (e) => xf.line = e.target.value,
                placeholder: '线路名称/编号',
                style: { flex: '1', padding: '8px', borderRadius: '6px', border: '1px solid var(--divider)', background: 'var(--input-bg)', color: 'var(--text)' }
              }),
              h('div', { style: { position: 'relative', width: '40px', height: '34px' } }, [
                  !hasElectronAPI ? h('input', {
                    type: 'color',
                    value: xf.color || '#808080',
                    onInput: (e) => xf.color = e.target.value,
                    style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', padding: 0, margin: 0, border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: 0, zIndex: 2 }
                  }) : null,
                  h('div', {
                    style: {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      borderRadius: '6px',
                      border: '2px solid var(--divider)',
                      backgroundColor: xf.color || '#808080',
                      pointerEvents: 'auto',
                      zIndex: 1,
                      cursor: 'pointer'
                    },
                    onClick: () => openColorPicker(idx)
                  })
              ]),
              // 出站换乘按钮（如果暂缓则禁用，但不隐藏）
              h('button', {
                class: 'btn',
                style: { 
                  padding: '0 10px', 
                  height: '34px', 
                  fontSize: '12px', 
                  background: xf.exitTransfer ? 'var(--btn-blue-bg)' : 'var(--input-bg)', 
                  color: xf.exitTransfer ? 'white' : 'var(--text)',
                  border: xf.exitTransfer ? 'none' : '1px solid var(--divider)',
                  opacity: xf.suspended ? 0.5 : 1,
                  cursor: xf.suspended ? 'not-allowed' : 'pointer'
                },
                onClick: () => {
                  if (!xf.suspended) {
                    toggleExitTransfer(idx);
                  }
                },
                disabled: xf.suspended,
                title: xf.suspended ? '暂缓时不能设置出站换乘' : '出站换乘'
              }, '出站'),
              // 暂缓按钮（如果出站换乘则禁用）
              h('button', {
                class: 'btn',
                style: { 
                  padding: '0 10px', 
                  height: '34px', 
                  fontSize: '12px', 
                  background: xf.suspended ? 'var(--btn-org-bg)' : 'var(--input-bg)', 
                  color: xf.suspended ? 'white' : 'var(--text)',
                  opacity: xf.exitTransfer ? 0.5 : 1,
                  cursor: xf.exitTransfer ? 'not-allowed' : 'pointer'
                },
                onClick: () => {
                  if (!xf.exitTransfer) {
                    toggleXferSuspended(idx);
                  }
                },
                disabled: xf.exitTransfer,
                title: xf.exitTransfer ? '出站换乘时不能暂缓' : (xf.suspended ? '暂缓' : '正常')
              }, xf.suspended ? '暂缓' : '正常'),
              h('button', {
                class: 'btn',
                style: { padding: '0 10px', height: '34px', background: 'var(--btn-red-bg)', color: 'white' },
                onClick: () => removeXfer(idx)
              }, h('i', { class: 'fas fa-times' }))
            ]);
          }))
          ]),
          // Footer - 底部按钮区域
          h('div', {
            style: {
              padding: '20px 28px',
              borderTop: '1px solid var(--divider, rgba(0,0,0,0.1))',
              background: 'var(--card, #ffffff)',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              flexShrink: 0
            }
          }, [
            h('button', {
              class: 'btn',
              style: { 
                padding: '10px 20px', 
                background: 'var(--btn-gray-bg, #f5f5f5)', 
                color: 'var(--btn-gray-text, #666)', 
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                minWidth: '80px'
              },
              onClick: close
            }, '取消'),
            h('button', {
              class: 'btn',
              style: { 
                padding: '10px 20px', 
                background: 'var(--accent, #1677ff)', 
                color: 'white', 
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                minWidth: '80px',
                boxShadow: '0 4px 12px rgba(22,119,255,0.4)'
              },
              onClick: save
            }, '保存')
          ])
        ]),
        // 颜色选择器对话框
        h(ColorPicker, {
          modelValue: showColorPicker.value,
          'onUpdate:modelValue': (val) => { showColorPicker.value = val; },
          initialColor: colorPickerInitialColor.value,
          onConfirm: onColorConfirm
        })
      ]);
    };
  }
};
=======

    const hasElectronAPI = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick;
    const pickColor = async (idx) => {
      if (hasElectronAPI) {
        try {
          const result = await window.electronAPI.startColorPick();
          if (result && result.ok && result.color) form.xfer[idx].color = result.color;
          return;
        } catch (e) {
          console.error('取色失败:', e);
        }
      }
      openColorPicker(idx);
    };

    return {
      form,
      isDarkTheme,
      close,
      save,
      addXfer,
      removeXfer,
      toggleXferSuspended,
      toggleExitTransfer,
      showColorPicker,
      colorPickerInitialColor,
      openColorPicker,
      onColorConfirm,
      pickColor
    };
  },
  template: `
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="modelValue"
             class="se-overlay"
             style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:99999; background:transparent;"
             @click.self="close">
          <div class="se-dialog" role="dialog" aria-modal="true"
               style="width:680px; max-width:95%; max-height:85vh; display:flex; flex-direction:column;">
            <div class="se-header">
              <div class="se-header-left">
                <div class="se-icon">
                  <i :class="isNew ? 'fas fa-plus' : 'fas fa-edit'"></i>
                </div>
                <div class="se-titles">
                  <div class="se-title">{{ isNew ? '新建站点' : '站点编辑' }}</div>
                  <div class="se-subtitle">{{ isNew ? 'New Station' : 'Edit Station' }}</div>
                </div>
              </div>
              <button class="se-close" @click="close" aria-label="关闭">
                <i class="fas fa-times"></i>
              </button>
            </div>

            <div class="se-content">
              <div class="se-grid2">
                <div class="se-field">
                  <label class="se-label">中文站名</label>
                  <input class="se-input" v-model="form.name" placeholder="例如: 人民广场" />
                </div>
                <div class="se-field">
                  <label class="se-label">英文站名 (English)</label>
                  <input class="se-input" v-model="form.en" placeholder="e.g. People's Square" />
                </div>
              </div>

              <div class="se-grid3">
                <div class="se-field">
                  <div class="se-label">站点状态 (Status)</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: !form.skip }" @click="form.skip=false">正常运营</button>
                    <button class="se-seg-btn" :class="{ warn: form.skip }" @click="form.skip=true">暂缓开通</button>
                  </div>
                </div>
                <div class="se-field">
                  <div class="se-label">开门方向 (Door)</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: form.door==='left' }" @click="form.door='left'">左侧</button>
                    <button class="se-seg-btn" :class="{ on: form.door==='right' }" @click="form.door='right'">右侧</button>
                    <button class="se-seg-btn" :class="{ on: form.door==='both' }" @click="form.door='both'">双侧</button>
                  </div>
                </div>
                <div class="se-field">
                  <div class="se-label">停靠方向 (Dock)</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: form.dock==='up' }" @click="form.dock='up'">仅上行</button>
                    <button class="se-seg-btn" :class="{ on: form.dock==='down' }" @click="form.dock='down'">仅下行</button>
                    <button class="se-seg-btn" :class="{ on: form.dock==='both' }" @click="form.dock='both'">双向</button>
                  </div>
                </div>
              </div>

              <div class="se-grid2 se-mt">
                <div class="se-field">
                  <div class="se-label">折返位置 (Turnback)</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: form.turnback==='none' }" @click="form.turnback='none'">无</button>
                    <button class="se-seg-btn" :class="{ on: form.turnback==='pre' }" @click="form.turnback='pre'">站前折返</button>
                    <button class="se-seg-btn" :class="{ on: form.turnback==='post' }" @click="form.turnback='post'">站后折返</button>
                  </div>
                </div>
                <div class="se-field se-field-narrow">
                  <div class="se-label">大站停靠</div>
                  <div class="se-seg">
                    <button class="se-seg-btn" :class="{ on: form.expressStop }" @click="form.expressStop=true">停靠</button>
                    <button class="se-seg-btn" :class="{ on: !form.expressStop }" @click="form.expressStop=false">跳过</button>
                  </div>
                </div>
              </div>

              <div class="se-section">
                <div class="se-section-head">
                  <div class="se-section-title">换乘线路</div>
                  <button class="se-mini" @click.prevent="addXfer">+ 添加换乘</button>
                </div>

                <div v-if="form.xfer.length===0" class="se-empty">暂无换乘</div>
                <div v-else class="se-xfer-list">
                  <div v-for="(xf, idx) in form.xfer" :key="idx" class="se-xfer-row">
                    <input class="se-input se-xfer-line" v-model="xf.line" placeholder="线路名称/编号" />

                    <div class="se-color">
                      <div class="se-color-swatch" :style="{ backgroundColor: xf.color || '#808080' }" @click="openColorPicker(idx)" title="选择颜色"></div>
                      <button class="se-mini" @click.prevent="pickColor(idx)" title="取色">取色</button>
                    </div>

                    <button class="se-tag"
                            :class="{ on: xf.exitTransfer }"
                            :disabled="xf.suspended"
                            :title="xf.suspended ? '暂缓时不能设置出站换乘' : '出站换乘'"
                            @click="!xf.suspended && toggleExitTransfer(idx)">
                      出站
                    </button>

                    <button class="se-tag warn"
                            :class="{ on: xf.suspended }"
                            :disabled="xf.exitTransfer"
                            :title="xf.exitTransfer ? '出站换乘时不能暂缓' : (xf.suspended ? '暂缓' : '正常')"
                            @click="!xf.exitTransfer && toggleXferSuspended(idx)">
                      {{ xf.suspended ? '暂缓' : '正常' }}
                    </button>

                    <button class="se-danger" @click="removeXfer(idx)" title="删除">
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="se-footer">
              <button class="se-btn se-btn-gray" @click="close">取消</button>
              <button class="se-btn se-btn-green" @click="save" :disabled="!form.name">保存</button>
            </div>
          </div>

          <ColorPicker
            v-model="showColorPicker"
            :initial-color="colorPickerInitialColor"
            @confirm="onColorConfirm"
          />
        </div>
      </Transition>
    </Teleport>

    <style>
      .fade-enter-active, .fade-leave-active { transition: opacity .25s ease; }
      .fade-enter-from, .fade-leave-to { opacity: 0; }

      .se-overlay{
        position:fixed; inset:0;
        display:flex; align-items:center; justify-content:center;
        z-index:99999; /* 强制置顶，避免被其它浮层盖住 */
        background: transparent; /* 不压暗 */
      }

      .se-dialog{
        width: 680px;
        max-width: 95%;
        max-height: 85vh;
        display:flex; flex-direction:column;
        border-radius: 20px;
        overflow:hidden;
        /* 对齐更新日志弹窗：外阴影 + 内描边 */
        box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.5) inset;
        background: rgba(255,255,255,0.85);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.3);
      }

      .se-header{
        display:flex; align-items:center; justify-content:space-between;
        padding: 24px 28px;
        border-bottom: 1px solid rgba(0,0,0,0.08);
        background: rgba(255,255,255,0.40);
      }
      .se-header-left{ display:flex; align-items:center; gap:12px; min-width:0; }
      .se-icon{
        width:40px; height:40px; border-radius:10px;
        background: linear-gradient(135deg, #1677ff 0%, #FF9F43 100%);
        display:flex; align-items:center; justify-content:center;
        box-shadow: 0 4px 12px rgba(22,119,255,0.3);
        flex: 0 0 auto;
      }
      .se-icon i{ color:#fff; font-size:18px; }
      .se-titles{ min-width:0; }
      .se-title{ font-size:22px; font-weight:800; letter-spacing:-0.5px; color:var(--text,#333); }
      .se-subtitle{ font-size:12px; color:var(--muted,#999); margin-top:2px; }
      .se-close{
        background:none; border:none;
        color: var(--muted,#999);
        cursor:pointer;
        font-size:20px;
        width:36px; height:36px;
        display:flex; align-items:center; justify-content:center;
        border-radius:8px;
        transition: all .2s;
      }
      .se-close:hover{ color: var(--text,#333); background: rgba(0,0,0,0.04); }

      .se-content{
        flex:1;
        overflow:auto;
        padding:24px 28px;
        background: rgba(255,255,255,0.35);
      }

      .se-grid2{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      .se-grid3{ display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-top:16px; }
      .se-mt{ margin-top:12px; }
      .se-field{ min-width:0; }
      .se-field-narrow{ max-width: 260px; }
      .se-label{ display:block; font-size:12px; font-weight:700; color:var(--muted); margin-bottom:6px; }

      .se-input{
        width:100%;
        padding:10px;
        border-radius:6px;
        border:1px solid rgba(0,0,0,0.10);
        background: rgba(255,255,255,0.70);
        color: var(--text);
        outline:none;
      }

      .se-seg{
        display:flex;
        gap:0;
        padding:4px;
        border-radius:6px;
        border: 1px solid rgba(0,0,0,0.10);
        background: rgba(255,255,255,0.70);
      }
      .se-seg-btn{
        flex:1;
        border:none;
        background: transparent;
        color: var(--muted);
        padding:8px;
        border-radius:4px;
        font-weight:700;
        cursor:pointer;
        transition: all .15s;
      }
      .se-seg-btn.on{
        background: var(--accent, #1677ff);
        color:#fff;
        box-shadow: 0 1px 6px rgba(0,0,0,0.12);
      }
      .se-seg-btn.warn.on{
        background: var(--btn-org-bg, #FF9F43);
        color:#fff;
      }

      .se-section{ margin-top:16px; }
      .se-section-head{
        display:flex; align-items:center; justify-content:space-between;
        padding-bottom:8px;
        border-bottom: 1px dashed rgba(0,0,0,0.10);
        margin-bottom:12px;
      }
      .se-section-title{ font-weight:800; font-size:14px; color:var(--text); }
      .se-mini{
        border:none;
        background: rgba(255,255,255,0.70);
        border:1px solid rgba(0,0,0,0.10);
        color: var(--accent, #1677ff);
        font-size:12px;
        padding:6px 12px;
        border-radius:6px;
        cursor:pointer;
      }
      .se-mini:hover{ background: rgba(255,255,255,0.70); }

      .se-empty{ color: var(--muted); font-size:12px; padding:8px 0; }

      .se-xfer-list{ display:flex; flex-direction:column; gap:8px; }
      .se-xfer-row{ display:flex; gap:8px; align-items:center; }
      .se-xfer-line{ flex: 1 1 auto; }

      .se-color{ display:flex; gap:8px; align-items:center; }
      .se-color-swatch{
        width:40px; height:34px;
        border-radius:6px;
        border: 2px solid rgba(0,0,0,0.10);
        cursor:pointer;
      }

      .se-tag{
        padding: 0 10px;
        height: 34px;
        border-radius: 6px;
        border: 1px solid rgba(0,0,0,0.10);
        background: rgba(255,255,255,0.70);
        color: var(--text);
        font-size:12px;
        cursor:pointer;
        transition: all .15s;
      }
      .se-tag.on{
        background: var(--btn-blue-bg, #1677ff);
        border-color: transparent;
        color:#fff;
      }
      .se-tag.warn.on{
        background: var(--btn-org-bg, #FF9F43);
        border-color: transparent;
        color:#fff;
      }
      .se-tag:disabled{ opacity:.5; cursor:not-allowed; }

      .se-danger{
        width:34px; height:34px;
        border:none;
        border-radius:6px;
        background: var(--btn-red-bg, #ff4444);
        color:#fff;
        cursor:pointer;
      }

      .se-footer{
        padding: 20px 28px;
        border-top: 1px solid rgba(0,0,0,0.08);
        background: rgba(255,255,255,0.40);
        display:flex; gap:12px; justify-content:flex-end;
      }
      .se-btn{
        padding:10px 20px;
        border:none;
        border-radius:8px;
        font-size:14px;
        font-weight:600;
        cursor:pointer;
        min-width:80px;
        transition: all .15s;
      }
      .se-btn:disabled{ opacity:.6; cursor:not-allowed; }
      .se-btn-gray{ background: var(--btn-gray-bg, #f5f5f5); color: var(--btn-gray-text, #666); }
      .se-btn-gray:hover{ background: var(--bg, #e5e5e5); }
      .se-btn-green{ background:#2ED573; color:#fff; box-shadow: 0 4px 12px rgba(46,213,115,0.4); }
      .se-btn-green:hover{ box-shadow: 0 6px 16px rgba(46,213,115,0.6); transform: translateY(-1px); }

      /* Dark mode */
      @media (prefers-color-scheme: dark) {
        .se-dialog{ background: rgba(30,30,30,0.85) !important; border: 1px solid rgba(255,255,255,0.1); }
        .se-header{ background: rgba(30,30,30,0.40) !important; border-bottom-color: rgba(255,255,255,0.1); }
        .se-content{ background: rgba(30,30,30,0.30) !important; }
        .se-footer{ background: rgba(30,30,30,0.40) !important; border-top-color: rgba(255,255,255,0.1); }
        .se-input, .se-seg, .se-mini, .se-tag{ background: rgba(50,50,50,0.60); border-color: rgba(255,255,255,0.12); }
        .se-color-swatch{ border-color: rgba(255,255,255,0.12); }
        .se-close:hover{ background: rgba(255,255,255,0.06); }
      }
      :global(.dark) .se-dialog, :global([data-theme="dark"]) .se-dialog { background: rgba(30,30,30,0.85) !important; border: 1px solid rgba(255,255,255,0.1); }
      :global(.dark) .se-header, :global([data-theme="dark"]) .se-header { background: rgba(30,30,30,0.40) !important; border-bottom-color: rgba(255,255,255,0.1) !important; }
      :global(.dark) .se-content, :global([data-theme="dark"]) .se-content { background: rgba(30,30,30,0.30) !important; }
      :global(.dark) .se-footer, :global([data-theme="dark"]) .se-footer { background: rgba(30,30,30,0.40) !important; border-top-color: rgba(255,255,255,0.1) !important; }
      :global(.dark) .se-input, :global([data-theme="dark"]) .se-input,
      :global(.dark) .se-seg, :global([data-theme="dark"]) .se-seg,
      :global(.dark) .se-mini, :global([data-theme="dark"]) .se-mini,
      :global(.dark) .se-tag, :global([data-theme="dark"]) .se-tag{
        background: rgba(50,50,50,0.60);
        border-color: rgba(255,255,255,0.12);
      }
      :global(.dark) .se-color-swatch, :global([data-theme="dark"]) .se-color-swatch{
        border-color: rgba(255,255,255,0.12);
      }
      :global(.dark) .se-close:hover, :global([data-theme="dark"]) .se-close:hover{ background: rgba(255,255,255,0.06); }
    </style>
  `
}
>>>>>>> feature/ui-update
