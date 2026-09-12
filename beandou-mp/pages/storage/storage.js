// pages/storage/storage.js
const app = getApp()
const store = app.globalData.store
const helpers = require('../../utils/helpers')

// 头像底色池：按顾客名取色，同名顾客颜色固定
const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316', '#6366f1']

function avatarColor(name) {
  const key = String(name || '').trim()
  if (!key) return '#94a3b8'
  let sum = 0
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

Page({
  data: {
    navHeight: 0,
    filterOptions: ['全部', '储存中', '已取走'],
    filterIdx: 0,
    searchKey: '',
    stats: { storedCount: 0, overdueCount: 0, pickedCount: 0 },
    list: [],
    modalType: '',
    editIsNew: true,
    editForm: { id: '', customer: '', phone: '', workName: '', storeDate: '', pickupDate: '', notes: '' },
    confirmData: { title: '', msg: '' },
    confirmCallback: null,
  },

  onLoad() {
    this.setData({ navHeight: helpers.navPaddingTop() })
    this.refresh()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.refresh()
  },

  refresh() {
    const all = store.state.storage
    const today = new Date()

    // 顶部统计(全量，不受筛选影响)
    let storedCount = 0
    let overdueCount = 0
    let pickedCount = 0
    all.forEach(r => {
      if (r.status === 'picked') {
        pickedCount++
      } else {
        storedCount++
        if (r.pickupDate && helpers.parseDate(r.pickupDate) < today) overdueCount++
      }
    })

    const f = this.data.filterIdx
    let list = all.slice().sort((a, b) => b.storeTs - a.storeTs)
    if (f === 1) list = list.filter(r => r.status === 'stored')
    else if (f === 2) list = list.filter(r => r.status === 'picked')

    // 搜索：顾客 / 作品 / 电话
    const key = (this.data.searchKey || '').trim().toLowerCase()
    if (key) {
      list = list.filter(r =>
        (r.customer || '').toLowerCase().includes(key) ||
        (r.workName || '').toLowerCase().includes(key) ||
        (r.phone || '').includes(key)
      )
    }

    list = list.map(r => {
      const days = helpers.daysBetween(helpers.parseDate(r.storeDate), today)
      const overdue = r.status === 'stored' && r.pickupDate && helpers.parseDate(r.pickupDate) < today
      const badgeClass = r.status === 'picked' ? 'picked' : overdue ? 'overdue' : 'stored'
      const badgeText = r.status === 'picked'
        ? '已取走'
        : overdue ? `逾期 · ${days}天` : `储存中 · ${days}天`
      const customer = r.customer || ''
      return {
        ...r,
        days,
        badgeClass,
        badgeText,
        avatarChar: customer ? customer.trim().charAt(0).toUpperCase() : '？',
        avatarColor: avatarColor(customer),
      }
    })

    this.setData({ list, stats: { storedCount, overdueCount, pickedCount } })
  },

  onFilterTap(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    if (idx === this.data.filterIdx) return
    this.setData({ filterIdx: idx })
    this.refresh()
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
    this.refresh()
  },

  clearSearch() {
    this.setData({ searchKey: '' })
    this.refresh()
  },

  showAddDialog() {
    this.setData({
      modalType: 'edit',
      editIsNew: true,
      editForm: {
        id: '',
        customer: '',
        phone: '',
        workName: '',
        storeDate: helpers.todayStr(),
        pickupDate: '',
        notes: '',
      },
    })
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id
    const r = store.state.storage.find(r => r.id === id)
    if (!r) return
    this.setData({
      modalType: 'edit',
      editIsNew: false,
      editForm: {
        id: r.id,
        customer: r.customer || '',
        phone: r.phone || '',
        workName: r.workName || '',
        storeDate: r.storeDate || helpers.todayStr(),
        pickupDate: r.pickupDate || '',
        notes: r.notes || '',
      },
    })
  },

  onStoreDateChange(e) {
    this.setData({ 'editForm.storeDate': e.detail.value })
  },

  onPickDateChange(e) {
    this.setData({ 'editForm.pickupDate': e.detail.value })
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['editForm.' + field]: e.detail.value })
  },

  confirmSave() {
    const f = this.data.editForm
    if (this.data.editIsNew) {
      store.addStorage({
        customer: f.customer.trim(),
        phone: f.phone.trim(),
        workName: f.workName.trim(),
        storeDate: f.storeDate || helpers.todayStr(),
        pickupDate: f.pickupDate,
        notes: f.notes.trim(),
      })
    } else {
      store.updateStorage(f.id, {
        customer: f.customer.trim(),
        phone: f.phone.trim(),
        workName: f.workName.trim(),
        storeDate: f.storeDate || helpers.todayStr(),
        pickupDate: f.pickupDate,
        notes: f.notes.trim(),
      })
    }
    this.closeModal()
    this.refresh()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  onPick(e) {
    const id = e.currentTarget.dataset.id
    store.pickStorage(id)
    this.refresh()
    wx.showToast({ title: '已标记取走', icon: 'success' })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      modalType: 'confirm',
      confirmData: { title: '删除储存记录？', msg: '确认删除该条储存记录？此操作不可撤销。' },
      confirmCallback: () => {
        store.deleteStorage(id)
        this.closeModal()
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'success' })
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
