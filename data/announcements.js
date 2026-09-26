/* Add a new object at the top for every major release. A new id makes the announcement appear again. */
window.PCM_ANNOUNCEMENTS=[
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
