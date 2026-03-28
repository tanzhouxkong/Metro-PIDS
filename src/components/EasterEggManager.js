/**
 * 彩蛋配置管理组件
 * 独立于其他功能，用于从云端获取和应用彩蛋配置
 */

import { ref, computed, watch } from 'vue'
import { useCloudConfig, CLOUD_API_BASE } from '../composables/useCloudConfig.js'
import dialogService from '../utils/dialogService.js'

export default {
  name: 'EasterEggManager',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const showDialog = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    })

    const loading = ref(false)
    const config = ref({
      stations: [],
      messages: [],
      enabled: false
    })
    const cloudConfig = useCloudConfig(CLOUD_API_BASE)

    // 加载彩蛋配置
    async function loadEasterEggs() {
      loading.value = true
      try {
        const result = await cloudConfig.getEasterEggs()
        if (result.ok && result.data) {
          const data = result.data.config || result.data
          config.value = {
            stations: data.stations || [],
            messages: data.messages || [],
            enabled: data.enabled !== undefined ? data.enabled : true
          }
        } else {
          await dialogService.alert('获取彩蛋配置失败：' + (result.error || '未知错误'), '错误')
        }
      } catch (e) {
        console.error('加载彩蛋配置失败:', e)
        await dialogService.alert('加载彩蛋配置失败：' + e.message, '错误')
      } finally {
        loading.value = false
      }
    }

    // 保存彩蛋配置
    async function saveEasterEggs() {
      loading.value = true
      try {
        const result = await cloudConfig.updateEasterEggs(config.value)
        if (result.ok) {
          await dialogService.alert('彩蛋配置已成功保存到云端', '成功')
          showDialog.value = false
        } else {
          await dialogService.alert('保存彩蛋配置失败：' + (result.error || '未知错误'), '错误')
        }
      } catch (e) {
        console.error('保存彩蛋配置失败:', e)
        await dialogService.alert('保存彩蛋配置失败：' + e.message, '错误')
      } finally {
        loading.value = false
      }
    }

    // 添加站点
    function addStation() {
      const station = prompt('请输入站点名称：')
      if (station && station.trim()) {
        if (!config.value.stations) config.value.stations = []
        config.value.stations.push(station.trim())
      }
    }

    // 删除站点
    function removeStation(index) {
      if (confirm(`确定要删除站点"${config.value.stations[index]}"吗？`)) {
        config.value.stations.splice(index, 1)
      }
    }

    // 添加消息
    function addMessage() {
      const message = prompt('请输入消息内容：')
      if (message && message.trim()) {
        if (!config.value.messages) config.value.messages = []
        config.value.messages.push(message.trim())
      }
    }

    // 删除消息
    function removeMessage(index) {
      if (confirm(`确定要删除消息"${config.value.messages[index]}"吗？`)) {
        config.value.messages.splice(index, 1)
      }
    }

    // 当对话框显示时自动加载配置
    watch(showDialog, (val) => {
      if (val) {
        loadEasterEggs()
      }
    })

    return {
      showDialog,
      loading,
      config,
      loadEasterEggs,
      saveEasterEggs,
      addStation,
      removeStation,
      addMessage,
      removeMessage
    }
  }}
