// custom-tab-bar/index.js - 自定义底部导航
Component({
  data: {
    selected: 0,
    list: [
      { path: '/pages/dashboard/dashboard', icon: '📊', text: '桌台看板' },
      { path: '/pages/sales/sales', icon: '🧾', text: '使用记录' },
      { path: '/pages/storage/storage', icon: '📦', text: '储存管理' },
      { path: '/pages/settings/settings', icon: '⚙️', text: '系统设置' },
    ],
  },
  methods: {
    switchTab(e) {
      const path = e.currentTarget.dataset.path
      const index = e.currentTarget.dataset.index
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
    },
  },
})
