/* Add a new object at the top for every major release. A new id makes the announcement appear again. */
window.PCM_ANNOUNCEMENTS=[
  {
    id:'guestbook-v1-launch',
    version:'v4.1',
    date:'2026-10-09',
    title:'留言反馈正式开放 💌',
    summary:'使用时遇到问题或有新的配色建议？现在可直接留下反馈，无需注册或登录。',
    details:[
      '支持使用体验、问题反馈、功能建议和其他四类留言。',
      '填写昵称和留言内容，通过人机验证后即可公开展示。',
      '可以查看大家的留言和站长回复；内容以纯文本显示，不支持上传附件。',
      '留言不是私信，请勿填写个人敏感信息；站长可隐藏或删除不合适的内容。'
    ],
    link:'./guestbook.html',
    linkText:'去留言'
  },
  {
    id:'v4.0-workspace-redesign',
    version:'v4.0',
    date:'2026-10-09',
    title:'Color Matcher 工作台焕新',
    summary:'全新桌面与手机操作布局、画布移动缩放，以及更简洁的功能结构。',
    details:[
      '桌面端让画布更突出，右侧集中查看区域及色号，结果区整合预览和导出。',
      '手机端新增「画布 / 区域 / 结果」底部导航，减少长页面反复滚动。',
      '新增画布放大、缩小和适应功能；移动模式支持单指拖动与双指缩放。',
      '移除 BOM、库存、用量与采购成本功能，保留限色优化与现有配色导出。',
      '后续较大的功能更新也将继续通过站内公告提醒。'
    ],
    link:'./',
    linkText:'体验新版工作台'
  },
  {
    id:'v3.8-palette-refresh',
    version:'v3.8',
    date:'2026-09-26',
    title:'樱花色卡重新采样',
    summary:'樱花 600 色已使用最新 5 张实拍色卡整体重做，同时校准亚丽丝 101 / 102 / 1786。',
    details:[
      '樱花旧版 RGB 提取数据已全部替换，QQ001–QQ360 / TQ361–TQ600 均来自本次最新上传色卡。',
      '樱花色号体系保持不变，因此原有项目仍可按同一色号继续使用。',
      '亚丽丝厂家色号 101、102、1786 已根据新增近照重新校准颜色，AL 内部编号保持不变。',
      '色卡浏览页会直接展示本次更新后的最新提取色块。'
    ],
    link:'./palette.html?palette=qqtq-480',
    linkText:'查看最新色卡'
  },
  {
    id:'v3.7-palette-gallery',
    version:'v3.7',
    date:'2026-09-22',
    title:'色卡浏览页上线啦',
    summary:'现在可以把樱花、涵特、亚丽丝的提取色块完整铺开浏览。',
    details:[
      '新增独立「色卡浏览」页面，可查看每一个颜色的色块与色号。',
      '支持色号搜索、编号区间搜索、原始顺序 / 色相 / 明度 / 饱和度排序。',
      '点击色块可查看 HEX、RGB、Lab、来源位置以及同色卡中的相近颜色。',
      '后续每次较大的功能更新，都会通过网站公告进行提醒。'
    ],
    link:'./palette.html',
    linkText:'打开色卡浏览'
  }
];
