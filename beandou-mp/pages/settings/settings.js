// pages/settings/settings.js
const app = getApp()
const store = app.globalData.store
const helpers = require('../../utils/helpers')

Page({
  data: {
    navHeight: 0,
    settings: {},
    colors: {},
    overtimeWarnNum: 5,
    previewTables: [],
    areaList: [],
    modalType: '',
    confirmData: { title: '', msg: '' },
    confirmCallback: null,
  },

  onLoad() {
    this.setData({ navHeight: helpers.navPaddingTop() })
    this.refresh()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    this.refresh()
  },

  refresh() {
    const s = store.state.settings
    const areaList = s.areas.map(a => ({
      id: a.id,
      name: a.name,
      tablesStr: a.tables.join(','),
      priceStr: a.pricePerHour ? String(a.pricePerHour) : '',
    }))
    this.setData({
      settings: {
        shopName: s.shopName,
        pricePerHour: String(s.pricePerHour),
        defaultDuration: String(s.defaultDuration),
        overtimeWarn: String(s.overtimeWarn),
        voiceAlert: s.voiceAlert,
      },
      colors: { ...s.colors },
      overtimeWarnNum: parseInt(s.overtimeWarn, 10) || 5,
      areaList,
      previewTables: this._buildPreview(s),
    })
  },

  // 配色预览样例：正常使用 / 即将超时 / 已超时 / 空闲
  _buildPreview(s) {
    const c = s.colors
    const min = 60000
    const mk = (id, label, table, rt) => ({ id, label, table, runtime: rt })
    return [
      mk('p1', '预览 1号桌', {
        id: 'p1', status: 'running', customer: '张小姐', people: 3,
        pricePerHour: s.pricePerHour, expectedMinutes: 60, items: [{ name: '饮料', price: 5, qty: 2 }],
      }, {
        elapsedMs: 30 * min, remainingMs: 30 * min, overtime: false,
        status: 'running', timeFee: (s.pricePerHour || 30) * 0.5, itemsTotal: 10,
      }),
      mk('p2', '预览 2号桌', {
        id: 'p2', status: 'running', customer: '李先生', people: 2,
        pricePerHour: s.pricePerHour, expectedMinutes: 60, items: [],
      }, {
        elapsedMs: 56 * min, remainingMs: 4 * min, overtime: false,
        status: 'running', timeFee: (s.pricePerHour || 30) * 56 / 60, itemsTotal: 0,
      }),
      mk('p3', '预览 3号桌', {
        id: 'p3', status: 'running', customer: '王先生', people: 4,
        pricePerHour: s.pricePerHour, expectedMinutes: 60, items: [{ name: '拼豆材料包', price: 25, qty: 1 }],
      }, {
        elapsedMs: 72 * min, remainingMs: -12 * min, overtime: true,
        status: 'overtime', timeFee: (s.pricePerHour || 30) * 1.2, itemsTotal: 25,
      }),
      mk('p4', '预览 4号桌', {
        id: 'p4', status: 'idle', customer: '', people: 0,
        pricePerHour: s.pricePerHour, expectedMinutes: 0, items: [],
      }, {
        elapsedMs: 0, remainingMs: null, overtime: false,
        status: 'idle', timeFee: 0, itemsTotal: 0,
      }),
    ]
  },

  // 店铺信息
  onShopName(e) {
    store.updateSetting('shopName', e.detail.value || '拼豆工坊')
  },
  onDurationChange(e) {
    store.updateSetting('defaultDuration', parseInt(e.detail.value) || 0)
  },
  onOvertimeWarn(e) {
    store.updateSetting('overtimeWarn', parseInt(e.detail.value) || 0)
  },
  onVoiceAlert(e) {
    store.updateSetting('voiceAlert', e.detail.value)
  },

  // 颜色
  onColorIdle(e) {
    store.updateColors({ idle: e.detail.value })
    this.refresh()
  },
  onColorRunning(e) {
    store.updateColors({ running: e.detail.value })
    this.refresh()
  },
  onColorPaused(e) {
    store.updateColors({ paused: e.detail.value })
    this.refresh()
  },
  onColorWarn(e) {
    store.updateColors({ warn: e.detail.value })
    this.refresh()
  },
  onColorOvertime(e) {
    store.updateColors({ overtime: e.detail.value })
    this.refresh()
  },
  resetColors() {
    const defaults = {
      idle: '#6b7280',
      running: '#22c55e',
      paused: '#3b82f6',
      warn: '#f59e0b',
      overtime: '#ef4444',
    }
    store.state.settings.colors = JSON.parse(JSON.stringify(defaults))
    store.saveState()
    this.refresh()
    wx.showToast({ title: '已恢复默认', icon: 'success' })
  },

  // 区域管理
  onAreaInput(e) {
    const idx = e.currentTarget.dataset.idx
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    store.updateArea(idx, field, value)
    // 更新本地数据但不需要完全刷新
    const key = `areaList[${idx}].${field === 'name' ? 'name' : 'tablesStr'}`
    this.setData({ [key]: value })
  },

  addArea() {
    store.addArea()
    this.refresh()
    wx.showToast({ title: '已添加区域', icon: 'success' })
  },

  deleteArea(e) {
    const idx = e.currentTarget.dataset.idx
    this.setData({
      modalType: 'confirm',
      confirmData: {
        title: '删除区域？',
        msg: `将删除「${store.state.settings.areas[idx].name}」及其桌台。`,
      },
      confirmCallback: () => {
        store.deleteArea(idx)
        this.closeModal()
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'success' })
      },
    })
  },

  // 数据管理
  exportData() {
    const data = store.exportData()
    const fs = wx.getFileSystemManager()
    const path = `${wx.env.USER_DATA_PATH}/拼豆系统备份_${helpers.todayStr()}.json`
    fs.writeFileSync(path, data, 'utf8')
    wx.shareFileMessage({
      filePath: path,
      fail: () => {
        wx.showToast({ title: '已导出备份', icon: 'success' })
      },
    })
  },

  importData() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const path = res.tempFiles[0].path
        const fs = wx.getFileSystemManager()
        try {
          const data = fs.readFileSync(path, 'utf8')
          store.importData(data)
          this.refresh()
          wx.showToast({ title: '导入成功', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '导入失败', icon: 'error' })
        }
      },
    })
  },

  clearToday() {
    this.setData({
      modalType: 'confirm',
      confirmData: {
        title: '清空今日数据？',
        msg: '将删除今日所有销售记录。储存记录不受影响。此操作不可撤销。',
      },
      confirmCallback: () => {
        store.clearToday()
        this.closeModal()
        wx.showToast({ title: '已清空今日', icon: 'success' })
      },
    })
  },

  clearAll() {
    this.setData({
      modalType: 'confirm',
      confirmData: {
        title: '清空全部数据？！',
        msg: '将删除所有销售记录、储存记录，并重置所有桌台。仅保留店铺设置。请确保已导出备份！',
      },
      confirmCallback: () => {
        store.clearAll()
        this.closeModal()
        this.refresh()
        wx.showToast({ title: '已清空全部', icon: 'success' })
      },
    })
  },

  confirmOk() {
    const cb = this.data.confirmCallback
    this.setData({ modalType: '', confirmCallback: null })
    if (cb) cb()
  },

  closeModal() {
    this.setData({ modalType: '' })
  },
})
