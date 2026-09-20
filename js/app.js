(() => {
  'use strict';
  const PCMColor = window.PCMColor;
  if(!PCMColor) throw new Error('PCMColor core module is missing');
  const { clamp, hex, rgbToLab, deltaE00, rgbToHsv } = PCMColor;
  const PALETTES = {
    'qqtq-480': { id:'qqtq-480', name:'QQ/TQ 480 色', source:'参考色卡图像', note:'原 QQ/TQ 480 色参考色卡。', entries:(window.PALETTE_RAW||[]).map(([code,rgb])=>({code,rgb,alias:'',hex:hex(rgb),lab:null})) },
    'natural-720': { id:'natural-720', name:'新 720 色（自然光）', source:'20 页自然光照片', note:'已从 20 张唯一色卡页的自然光区域自动提取 720 个参考色；001–004 分别对应黑色、大红、雪白、本白。照片/屏幕存在色差，仅作视觉匹配参考。', entries:(window.PALETTE_720_RAW||[]).map(([code,rgb,alias,page,row,col])=>({code,rgb,alias,page,row,col,hex:hex(rgb),lab:null})) }
  };
  let PALETTE = PALETTES['qqtq-480'];
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const els = {
    file: $('#fileInput'), demo: $('#demoBtn'), drop: $('#dropzone'), empty: $('#emptyState'), stage: $('#imageStage'), display: $('#displayCanvas'),
    minArea: $('#minArea'), minAreaValue: $('#minAreaValue'), bgTol: $('#bgTolerance'), bgTolValue: $('#bgToleranceValue'), merge: $('#mergeStrength'), detail: $('#detailSensitivity'), autoIgnore: $('#autoIgnore'), reanalyze: $('#reanalyzeBtn'),
    regionList: $('#regionList'), summary: $('#summaryPill'), tableBody: $('#resultTable tbody'), csv: $('#csvBtn'), annotated: $('#annotatedCanvas'), linked: $('#linkedCanvas'), annotatedBtn: $('#annotatedBtn'), linkedBtn: $('#linkedBtn'),
    modal: $('#paletteModal'), closeModal: $('#closeModal'), paletteSearch: $('#paletteSearch'), paletteGrid: $('#paletteGrid'), modalRegionName: $('#modalRegionName'), addBtn: $('#addRegionBtn'), undoAdd: $('#undoAddBtn'), clearAdded: $('#clearAddedBtn'), toolStatus: $('#toolStatus'), inspector: $('#selectionInspector'),
    paletteSelect: $('#paletteSelect'), paletteCount: $('#paletteCount'), paletteInfo: $('#paletteInfo'),
    preview: $('#previewCanvas'), previewBtn: $('#previewBtn'), bomBody: $('#bomTable tbody'), bomSummary: $('#bomSummary'), bomBtn: $('#bomBtn'),
    limitCount: $('#limitCount'), limitGenerate: $('#limitGenerateBtn'), limitApply: $('#limitApplyBtn'), limitRestore: $('#limitRestoreBtn'), limitSummary: $('#limitSummary'), limitBody: $('#limitTable tbody'),
    projectName: $('#projectNameInput'), autosaveStatus: $('#autosaveStatus'), saveProject: $('#saveProjectBtn'), openProject: $('#openProjectInput'), restoreAutosave: $('#restoreAutosaveBtn'), addPages: $('#addPagesInput'), pageStrip: $('#pageStrip'), printSheetBtn: $('#printSheetBtn'), installApp: $('#installAppBtn'),
    selectMode: $('#selectModeBtn'), brushMode: $('#brushModeBtn'), eraseMode: $('#eraseModeBtn'), splitMode: $('#splitModeBtn'), brushSize: $('#brushSize'), brushSizeValue: $('#brushSizeValue'), mergeSelected: $('#mergeSelectedBtn'), linkSelected: $('#linkSelectedBtn'), unlinkSelected: $('#unlinkSelectedBtn'), similarParts: $('#similarPartsBtn'), undoEdit: $('#undoEditBtn'), similarBox: $('#similarSuggestions'),
    paletteManagerBtn: $('#paletteManagerBtn'), paletteManagerModal: $('#paletteManagerModal'), closePaletteManager: $('#closePaletteManager'), paletteManagerList: $('#paletteManagerList'), paletteImages: $('#paletteImagesInput'), paletteJson: $('#paletteJsonInput'), buildCustomPalette: $('#buildCustomPaletteBtn'), paletteImportStatus: $('#paletteImportStatus'),
    customPaletteName: $('#customPaletteName'), customPalettePrefix: $('#customPalettePrefix'), customPaletteStart: $('#customPaletteStart'), customPaletteDigits: $('#customPaletteDigits'), customPaletteRows: $('#customPaletteRows'), customPaletteCols: $('#customPaletteCols'),
    compareHead: $('#compareHead'), compareBody: $('#compareBody'), schemeAName: $('#schemeAName'), schemeBName: $('#schemeBName'), saveSchemeA: $('#saveSchemeA'), saveSchemeB: $('#saveSchemeB'), applySchemeA: $('#applySchemeA'), applySchemeB: $('#applySchemeB'), schemeSummary: $('#schemeSummary'), schemeCanvasA: $('#schemeCanvasA'), schemeCanvasB: $('#schemeCanvasB'), schemeATitle: $('#schemeATitle'), schemeBTitle: $('#schemeBTitle'),
    totalGrams: $('#totalGrams'), spoolGrams: $('#spoolGrams'), defaultPrice: $('#defaultPrice'), costTolerance: $('#costTolerance'), costOptimize: $('#costOptimizeBtn'), costApply: $('#costApplyBtn'), costSummary: $('#costSummary')
  };

  let sourceImage = null;
  let sourceName = 'image';
  let analysis = null;
  let regions = [];
  let selectedRegion = null;
  let addMode = false;
  let manualHistory = [];
  let manualSeq = 1;
  let limitProposal = null;
  let limitBackup = null;
  updatePaletteUI();
  buildPaletteGrid('');

  function defaultIgnoreReason(rgb){
    const lab=rgbToLab(rgb), [h,s,v]=rgbToHsv(rgb), chroma=Math.hypot(lab[1],lab[2]);
    if(lab[0] < 18) return '黑色';
    if(lab[0] > 91 && chroma < 10) return '白色';
    if(v>0.70 && h>=5 && h<=48 && s>=0.035 && s<=0.38 && rgb[0]>rgb[1] && rgb[1]>=rgb[2]-5) return '肤色';
    return '';
  }

  function bestMatches(rgb, k=5){
    const lab=rgbToLab(rgb);
    const arr=PALETTE.entries.map(p => ({p, de:deltaE00(lab,p.lab||(p.lab=rgbToLab(p.rgb)))}));
    arr.sort((a,b)=>a.de-b.de);
    return arr.slice(0,k);
  }

  function paletteLabel(p){ return !p ? '—' : (p.alias ? `${p.code} · ${p.alias}` : p.code); }

  function updatePaletteUI(){
    if(els.paletteSelect) els.paletteSelect.value=PALETTE.id;
    if(els.paletteCount) els.paletteCount.textContent=`${PALETTE.entries.length} 色`;
    if(els.paletteInfo) els.paletteInfo.innerHTML=`<strong>${PALETTE.name}</strong> · ${PALETTE.entries.length} 色<br>${PALETTE.note}`;
    if(els.paletteSearch) els.paletteSearch.placeholder=PALETTE.id==='natural-720'?'搜索 001 / 黑色 / 720 ...':'搜索 QQ155 / TQ433 ...';
  }

  function rememberSelection(r){ r.paletteSelections=r.paletteSelections||{}; r.paletteSelections[PALETTE.id]=r.selected; }

  function setPalette(id){
    const next=PALETTES[id]; if(!next||next===PALETTE)return;
    regions.forEach(rememberSelection); PALETTE=next;
    for(const r of regions){
      r.candidates=bestMatches(r.rgb,5); r.paletteSelections=r.paletteSelections||{};
      r.selected=r.paletteSelections[PALETTE.id] || r.candidates[0]?.p.code || ''; r.paletteSelections[PALETTE.id]=r.selected;
    }
    limitProposal=null; limitBackup=null; updatePaletteUI(); buildPaletteGrid(''); renderAll();
  }

  function readFile(file){
    sourceName = (file.name || 'image').replace(/\.[^.]+$/,'');
    const url=URL.createObjectURL(file); const im=new Image();
    im.onload=()=>{ URL.revokeObjectURL(url); setSourceImage(im); }; im.src=url;
  }

  function loadUrl(url, name){
    const im=new Image(); im.onload=()=>{ sourceName=name; setSourceImage(im); }; im.src=url;
  }

  function loadDemo(){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <rect width="1200" height="900" fill="#777777"/>
      <path d="M80 90 Q180 20 280 90 L305 320 Q190 390 70 320Z" fill="#63A6D9"/><path d="M360 90 Q460 20 560 90 L585 320 Q470 390 350 320Z" fill="#63A6D9"/>
      <circle cx="760" cy="235" r="150" fill="#F7E8DF"/><path d="M610 190 Q760 55 910 190 L885 330 Q760 240 635 330Z" fill="#63A6D9"/>
      <path d="M670 175 Q760 115 850 175 Q835 120 790 95 Q845 85 875 130 Q900 175 895 245 Q875 185 840 170 Q805 150 760 150 Q715 150 680 170 Q645 185 625 245 Q620 175 645 130 Q675 85 730 95 Q685 120 670 175Z" fill="#63A6D9"/>
      <ellipse cx="705" cy="255" rx="28" ry="36" fill="#4D735D"/><ellipse cx="815" cy="255" rx="28" ry="36" fill="#4D735D"/>
      <path d="M650 450 Q760 380 870 450 L845 585 Q760 625 675 585Z" fill="#63A6D9"/>
      <rect x="65" y="445" width="260" height="210" rx="18" fill="#F7E8DF"/><circle cx="155" cy="525" r="28" fill="#F7E8DF"/><circle cx="230" cy="575" r="28" fill="#F7E8DF"/>
      <path d="M65 700 Q175 650 285 700 L300 845 L50 845Z" fill="#F9FAFB"/><rect x="50" y="800" width="250" height="45" fill="#202124"/>
      <path d="M915 520 Q1035 430 1150 520 L1110 820 Q1035 865 955 820Z" fill="#63A6D9"/>
    </svg>`;
    const im=new Image(); im.onload=()=>{sourceName='demo-flat';setSourceImage(im);}; im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }

  function setSourceImage(im){
    sourceImage=im; els.empty.classList.add('hidden'); els.stage.classList.remove('hidden'); els.reanalyze.disabled=false;
    els.summary.textContent='正在识别…';
    manualHistory=[]; manualSeq=1; addMode=false; limitProposal=null; limitBackup=null; updateToolUI();
    setTimeout(analyze, 40);
  }

  function updateToolUI(){
    if(els.addBtn) els.addBtn.classList.toggle('active', addMode);
    if(els.toolStatus){ els.toolStatus.textContent=addMode ? '当前模式：补充区域（点击图片漏检处）' : '当前模式：选择区域'; els.toolStatus.classList.toggle('add', addMode); }
    if(els.undoAdd) els.undoAdd.disabled = manualHistory.length===0;
    if(els.clearAdded) els.clearAdded.disabled = !regions.some(r=>r.manual);
  }

  function resetManualState(){ manualHistory=[]; manualSeq=1; addMode=false; limitProposal=null; limitBackup=null; updateToolUI(); }

  function isAutoName(name){ return /^主区域\s+\d+(?:\.\d+)?$/.test(name) || /^细节\s+\d+(?:\.\d+)?$/.test(name) || /^补充(主区域|细节)/.test(name); }

  function relabelRegions(){
    const mains=regions.filter(r=>r.type==='main').sort((a,b)=>a.cy-b.cy||a.cx-b.cx);
    let mi=0;
    for(const main of mains){
      mi++; const ml=String(mi).padStart(2,'0'); main.label=ml; if(isAutoName(main.name)) main.name=main.manual?`补充主区域 ${ml}`:`主区域 ${ml}`;
      const children=regions.filter(r=>r.type==='detail'&&r.mainKey===main.mainKey).sort((a,b)=>a.cy-b.cy||a.cx-b.cx);
      children.forEach((d,idx)=>{d.label=`${ml}.${idx+1}`; if(isAutoName(d.name)) d.name=d.manual?`补充细节 ${d.label}`:`细节 ${d.label}`;});
    }
  }

  function upsertInspector(){
    if(!els.inspector) return;
    const r=regions.find(x=>x.id===selectedRegion);
    if(!r){ els.inspector.className='selection-inspector empty'; els.inspector.innerHTML='选择左侧画面或下方列表中的区域后，这里会显示摘要与操作建议。'; return; }
    const p=getPalette(r.selected); const typeName=r.type==='detail'?'细节区域':'主区域';
    els.inspector.className='selection-inspector';
    els.inspector.innerHTML=`<div><strong>${r.label} · ${escapeHtml(r.name)}</strong><div class="muted" style="margin-top:6px;font-size:12px;color:#6b7280;line-height:1.6">${typeName} · ${r.manual?'手动补充':'自动识别'}${r.ignore?` · 当前忽略：${escapeHtml(r.ignoreReason||'手动设置')}`:''}</div></div><div class="inspector-grid"><div class="metric-box"><small>原图颜色</small><strong><span class="swatch-inline" style="background:${hex(r.rgb)}"></span>${hex(r.rgb)}</strong></div><div class="metric-box"><small>推荐色号</small><strong>${p?p.code:'—'}</strong></div><div class="metric-box"><small>色差 ΔE00</small><strong>${p?deltaFor(r,p).toFixed(2):'—'}</strong></div><div class="metric-box"><small>区域面积</small><strong>${Math.round(r.area||0)} px</strong></div></div>`;
  }

  function nextId(){ return regions.reduce((m,r)=>Math.max(m,r.id),0)+1; }

  function makeRegionFromStats(stats, kind='detail', parent=null){
    const rgb=stats.rgb.map(Math.round);
    const candidates=bestMatches(rgb,5);
    const reason=els.autoIgnore.checked?defaultIgnoreReason(rgb):'';
    const mainKey = kind==='main' ? `manual-main-${manualSeq++}` : (parent?parent.mainKey:`manual-main-${manualSeq++}`);
    const selected=candidates[0]?.p.code||''; return { id:nextId(), root:`manual-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, type:kind, mainKey, parentRoot:parent?parent.root:null, name:kind==='main'?'补充主区域':'补充细节', rgb, cx:stats.cx, cy:stats.cy, bbox:stats.bbox, area:stats.area, ignore:!!reason, ignoreReason:reason, candidates, selected, paletteSelections:{[PALETTE.id]:selected}, manualPixels:stats.pixels||[], manual:true, origin:'added', uid:(crypto.randomUUID?crypto.randomUUID():`u-${Date.now()}-${Math.random()}`), linkGroup:'' };
  }

  function guessParentMain(stats){
    const mains=regions.filter(r=>r.type==='main'); if(!mains.length) return null;
    const cx=stats.cx, cy=stats.cy;
    let inside=mains.filter(m=>cx>=m.bbox[0]-3&&cx<=m.bbox[2]+3&&cy>=m.bbox[1]-3&&cy<=m.bbox[3]+3);
    if(inside.length) inside.sort((a,b)=>(a.area||1)-(b.area||1));
    return inside[0] || mains.map(m=>({m,d:Math.hypot(m.cx-cx,m.cy-cy)})).sort((a,b)=>a.d-b.d)[0].m;
  }

  function regionGrowFromSeed(x,y){
    if(!analysis||!analysis.imageData) return null;
    const {w,h,imageData,bgRGB}=analysis; const data=imageData.data;
    x=Math.round(clamp(x,0,w-1)); y=Math.round(clamp(y,0,h-1));
    const idx=y*w+x, p=idx*4; const seed=[data[p],data[p+1],data[p+2]];
    if(data[p+3]<16) return null;
    if(Math.hypot(seed[0]-bgRGB[0],seed[1]-bgRGB[1],seed[2]-bgRGB[2]) < (+els.bgTol.value)+2) return null;
    const detailLevel=els.detail.value;
    const seedTol = detailLevel==='sensitive' ? 18 : detailLevel==='conservative' ? 12 : 15;
    const meanTol = detailLevel==='sensitive' ? 16 : detailLevel==='conservative' ? 11 : 13;
    const maxVisit = Math.min(w*h, 250000);
    const seedLab=rgbToLab(seed); const vis=new Uint8Array(w*h); const q=[idx]; vis[idx]=1; let head=0;
    let area=0,sr=0,sg=0,sb=0,sx=0,sy=0,minx=w,miny=h,maxx=0,maxy=0,pixels=[];
    while(head<q.length && q.length<maxVisit){
      const i=q[head++], yy=(i/w)|0, xx=i-yy*w, pp=i*4; const rgb=[data[pp],data[pp+1],data[pp+2]];
      const currentMean = area ? [sr/area, sg/area, sb/area] : seed;
      const accept = deltaE00(rgbToLab(rgb), seedLab)<=seedTol && deltaE00(rgbToLab(rgb), rgbToLab(currentMean))<=meanTol;
      if(!accept) continue;
      area++; pixels.push(i); sr+=rgb[0]; sg+=rgb[1]; sb+=rgb[2]; sx+=xx; sy+=yy; if(xx<minx)minx=xx; if(xx>maxx)maxx=xx; if(yy<miny)miny=yy; if(yy>maxy)maxy=yy;
      const nbr=[i-1,i+1,i-w,i+w,i-w-1,i-w+1,i+w-1,i+w+1];
      for(const ni of nbr){ if(ni<0||ni>=w*h||vis[ni]) continue; vis[ni]=1; q.push(ni); }
    }
    if(area<8) return null;
    const rgb=[sr/area,sg/area,sb/area];
    return {area,rgb,cx:sx/area,cy:sy/area,bbox:[minx,miny,maxx,maxy],bw:maxx-minx+1,bh:maxy-miny+1,pixels};
  }

  function addManualRegionAt(x,y){
    const stats=regionGrowFromSeed(x,y);
    if(!stats) return false;
    const dup=regions.find(r=>Math.abs(r.cx-stats.cx)<6 && Math.abs(r.cy-stats.cy)<6 && deltaE00(rgbToLab(r.rgb),rgbToLab(stats.rgb))<4.5);
    if(dup){ selectedRegion=dup.id; renderAll(); return true; }
    const parent=guessParentMain(stats);
    const kind=(parent && stats.area<=Math.max(140,parent.area*0.18)) ? 'detail' : 'main';
    const region=makeRegionFromStats(stats,kind,kind==='detail'?parent:null);
    if(kind==='detail' && parent) region.mainKey=parent.mainKey;
    regions.push(region); manualHistory.push(region.id); relabelRegions(); selectedRegion=region.id; renderAll();
    return true;
  }

  function undoManualRegion(){ const id=manualHistory.pop(); if(!id) return; regions=regions.filter(r=>r.id!==id); relabelRegions(); selectedRegion=regions[0]?.id||null; renderAll(); }

  function clearManualRegions(){ regions=regions.filter(r=>!r.manual); manualHistory=[]; relabelRegions(); selectedRegion=regions[0]?.id||null; renderAll(); }

  function analyze(){
    if(!sourceImage)return;
    const maxDim=900, scale=Math.min(1,maxDim/Math.max(sourceImage.naturalWidth||sourceImage.width,sourceImage.naturalHeight||sourceImage.height));
    const w=Math.max(1,Math.round((sourceImage.naturalWidth||sourceImage.width)*scale)), h=Math.max(1,Math.round((sourceImage.naturalHeight||sourceImage.height)*scale));
    const c=document.createElement('canvas'); c.width=w;c.height=h; const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(sourceImage,0,0,w,h);
    const id=ctx.getImageData(0,0,w,h), data=id.data, n=w*h;
    const bgTol=+els.bgTol.value, mergeTol=+els.merge.value, q=16, border=Math.max(3,Math.round(Math.min(w,h)*0.012));

    // 1) Robust background estimate from the dominant border color family.
    const hist=new Map(), borderIdx=[];
    const pushBorder=i=>{const p=i*4,r=data[p],g=data[p+1],b=data[p+2],qr=Math.round(r/24),qg=Math.round(g/24),qb=Math.round(b/24),key=(qr<<16)|(qg<<8)|qb;hist.set(key,(hist.get(key)||0)+1);borderIdx.push([i,key]);};
    for(let y=0;y<border;y++)for(let x=0;x<w;x++)pushBorder(y*w+x);
    for(let y=h-border;y<h;y++)for(let x=0;x<w;x++)pushBorder(y*w+x);
    for(let y=border;y<h-border;y++){for(let x=0;x<border;x++)pushBorder(y*w+x);for(let x=w-border;x<w;x++)pushBorder(y*w+x);}
    let bgKey=null,bgCount=-1;hist.forEach((v,k)=>{if(v>bgCount){bgCount=v;bgKey=k;}});
    let br=0,bg=0,bb=0,bc=0;for(const [i,k] of borderIdx){if(k!==bgKey)continue;const p=i*4;br+=data[p];bg+=data[p+1];bb+=data[p+2];bc++;}
    const bgRGB=bc?[br/bc,bg/bc,bb/bc]:[data[0],data[1],data[2]];

    // 2) Fine micro-regions: 8-connected components on a light color quantization.
    //    We deliberately keep this stage fine; semantic-looking merging happens in the region graph below.
    const keys=new Int32Array(n);keys.fill(-1);
    for(let i=0;i<n;i++){
      const p=i*4;if(data[p+3]<16)continue;const r=data[p],g=data[p+1],b=data[p+2];
      if(Math.hypot(r-bgRGB[0],g-bgRGB[1],b-bgRGB[2])<bgTol)continue;
      const qr=Math.round(r/q),qg=Math.round(g/q),qb=Math.round(b/q);keys[i]=(qr<<16)|(qg<<8)|qb;
    }
    const labels=new Int32Array(n);labels.fill(-1);const queue=new Int32Array(n),comps=[];let cid=0;
    const add=(j,key)=>{if(j>=0&&j<n&&labels[j]<0&&keys[j]===key){labels[j]=cid;queue[tail++]=j;}};
    let tail=0;
    for(let start=0;start<n;start++){
      if(keys[start]<0||labels[start]>=0)continue;const key=keys[start];let head=0;tail=0;queue[tail++]=start;labels[start]=cid;
      let area=0,sr=0,sg=0,sb=0,sr2=0,sg2=0,sb2=0,sx=0,sy=0,minx=w,maxx=0,miny=h,maxy=0;
      while(head<tail){
        const i=queue[head++],y=Math.floor(i/w),x=i-y*w,p=i*4,r=data[p],g=data[p+1],b=data[p+2];
        area++;sr+=r;sg+=g;sb+=b;sr2+=r*r;sg2+=g*g;sb2+=b*b;sx+=x;sy+=y;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;
        if(x>0)add(i-1,key);if(x<w-1)add(i+1,key);if(y>0)add(i-w,key);if(y<h-1)add(i+w,key);
        if(x>0&&y>0)add(i-w-1,key);if(x<w-1&&y>0)add(i-w+1,key);if(x>0&&y<h-1)add(i+w-1,key);if(x<w-1&&y<h-1)add(i+w+1,key);
      }
      comps.push({id:cid,area,sr,sg,sb,sr2,sg2,sb2,sx,sy,minx,maxx,miny,maxy,rgb:[sr/area,sg/area,sb/area]});cid++;
    }

    // 3) Region adjacency graph + perceptual merge (Lab / DeltaE00).
    //    Only touching components may merge, so disconnected same-color parts remain separate.
    const edgeMap=new Map();
    const touch=(a,b)=>{if(a<0||b<0||a===b)return;const lo=a<b?a:b,hi=a<b?b:a,k=lo*cid+hi;edgeMap.set(k,(edgeMap.get(k)||0)+1);};
    for(let y=0;y<h;y++)for(let x=0;x<w-1;x++)touch(labels[y*w+x],labels[y*w+x+1]);
    for(let y=0;y<h-1;y++)for(let x=0;x<w;x++)touch(labels[y*w+x],labels[(y+1)*w+x]);
    const edges=[];edgeMap.forEach((contact,k)=>{const a=Math.floor(k/cid),b=k-a*cid;edges.push({a,b,contact,de:deltaE00(rgbToLab(comps[a].rgb),rgbToLab(comps[b].rgb))});});edges.sort((a,b)=>a.de-b.de);

    const parent=new Int32Array(cid),ua=new Float64Array(cid),usr=new Float64Array(cid),usg=new Float64Array(cid),usb=new Float64Array(cid),usr2=new Float64Array(cid),usg2=new Float64Array(cid),usb2=new Float64Array(cid),usx=new Float64Array(cid),usy=new Float64Array(cid),uminx=new Int32Array(cid),umaxx=new Int32Array(cid),uminy=new Int32Array(cid),umaxy=new Int32Array(cid);
    for(let i=0;i<cid;i++){const z=comps[i];parent[i]=i;ua[i]=z.area;usr[i]=z.sr;usg[i]=z.sg;usb[i]=z.sb;usr2[i]=z.sr2;usg2[i]=z.sg2;usb2[i]=z.sb2;usx[i]=z.sx;usy[i]=z.sy;uminx[i]=z.minx;umaxx[i]=z.maxx;uminy[i]=z.miny;umaxy[i]=z.maxy;}
    const find=x=>{let r=x;while(parent[r]!==r)r=parent[r];while(parent[x]!==x){const q0=parent[x];parent[x]=r;x=q0;}return r;};
    const mean=r=>[usr[r]/ua[r],usg[r]/ua[r],usb[r]/ua[r]];
    const join=(ra,rb)=>{if(ra===rb)return ra;if(ua[ra]<ua[rb]){const t=ra;ra=rb;rb=t;}parent[rb]=ra;ua[ra]+=ua[rb];usr[ra]+=usr[rb];usg[ra]+=usg[rb];usb[ra]+=usb[rb];usr2[ra]+=usr2[rb];usg2[ra]+=usg2[rb];usb2[ra]+=usb2[rb];usx[ra]+=usx[rb];usy[ra]+=usy[rb];uminx[ra]=Math.min(uminx[ra],uminx[rb]);umaxx[ra]=Math.max(umaxx[ra],umaxx[rb]);uminy[ra]=Math.min(uminy[ra],uminy[rb]);umaxy[ra]=Math.max(umaxy[ra],umaxy[rb]);return ra;};
    for(let pass=0;pass<2;pass++)for(const e of edges){let a=find(e.a),b=find(e.b);if(a===b)continue;const d=deltaE00(rgbToLab(mean(a)),rgbToLab(mean(b))),small=Math.min(ua[a],ua[b])/Math.max(1,Math.max(ua[a],ua[b]));if(d<=mergeTol||(small<.035&&d<=mergeTol+1.5))join(a,b);}

    const roots=[];for(let i=0;i<cid;i++)if(find(i)===i&&ua[i]>0){const rgb=mean(i),bw=umaxx[i]-uminx[i]+1,bh=umaxy[i]-uminy[i]+1,vr=Math.max(0,usr2[i]/ua[i]-rgb[0]*rgb[0]),vg=Math.max(0,usg2[i]/ua[i]-rgb[1]*rgb[1]),vb=Math.max(0,usb2[i]/ua[i]-rgb[2]*rgb[2]);roots.push({root:i,area:ua[i],rgb,cx:usx[i]/ua[i],cy:usy[i]/ua[i],bbox:[uminx[i],uminy[i],umaxx[i],umaxy[i]],bw,bh,fill:ua[i]/Math.max(1,bw*bh),std:Math.sqrt((vr+vg+vb)/3)});}
    const rootById=new Int32Array(cid);for(let i=0;i<cid;i++)rootById[i]=find(i);
    const rootEdges=new Map();for(const e of edges){const a=rootById[e.a],b=rootById[e.b];if(a===b)continue;const lo=a<b?a:b,hi=a<b?b:a,k=lo*cid+hi;rootEdges.set(k,(rootEdges.get(k)||0)+e.contact);}
    const byRoot=new Map(roots.map(r=>[r.root,r]));const neigh=new Map();const addN=(a,b,cnt)=>{if(!neigh.has(a))neigh.set(a,[]);neigh.get(a).push({r:byRoot.get(b),contact:cnt});};
    rootEdges.forEach((contact,k)=>{const a=Math.floor(k/cid),b=k-a*cid;if(byRoot.has(a)&&byRoot.has(b)){addN(a,b,contact);addN(b,a,contact);}});

    // 4) Hierarchical classification: Main Region + Detail Region.
    const mainMin=n*(+els.minArea.value/100), detailCfg={
      conservative:{thinPct:.0035,thinAbs:28,regularPct:.030,regularAbs:160,contrast:18.0,maxFrac:.14,minLong:7,margin:.05,std:24},
      balanced:{thinPct:.0025,thinAbs:20,regularPct:.020,regularAbs:120,contrast:15.0,maxFrac:.16,minLong:5,margin:.04,std:26},
      sensitive:{thinPct:.0012,thinAbs:12,regularPct:.012,regularAbs:70,contrast:10.0,maxFrac:.20,minLong:4,margin:.025,std:30}
    }[els.detail.value]||{thinPct:.0025,thinAbs:20,regularPct:.020,regularAbs:120,contrast:15.0,maxFrac:.16,minLong:5,margin:.04,std:26};
    const detailMin=Math.max(detailCfg.thinAbs,n*(detailCfg.thinPct/100)), regularMin=Math.max(detailCfg.regularAbs,n*(detailCfg.regularPct/100));
    let mainRoots=roots.filter(r=>r.area>=mainMin&&r.bw>=4&&r.bh>=4);
    const mainSet=new Set(mainRoots.map(r=>r.root));
    const parentFor=r=>{
      const direct=(neigh.get(r.root)||[]).filter(x=>mainSet.has(x.r.root)&&x.r.area>r.area*2.5).sort((a,b)=>b.contact-a.contact);
      if(direct.length)return direct[0].r;
      let best=null,bestArea=Infinity;for(const m of mainRoots){if(m.area<=r.area*2.5)continue;const pad=2;if(r.cx>=m.bbox[0]-pad&&r.cx<=m.bbox[2]+pad&&r.cy>=m.bbox[1]-pad&&r.cy<=m.bbox[3]+pad&&m.area<bestArea){best=m;bestArea=m.area;}}return best;
    };

    // Reclassify small islands that technically pass the main threshold but clearly live inside a much larger neighboring region.
    const demote=new Map();for(const r of mainRoots){const p0=parentFor(r);if(!p0)continue;const contrast=deltaE00(rgbToLab(r.rgb),rgbToLab(p0.rgb));if(r.area/p0.area<=detailCfg.maxFrac&&contrast>=detailCfg.contrast&&r.area<mainMin*6)demote.set(r.root,p0.root);}
    if(demote.size){mainRoots=mainRoots.filter(r=>!demote.has(r.root));mainSet.clear();mainRoots.forEach(r=>mainSet.add(r.root));}

    const details=[];for(const r of roots){
      if(mainSet.has(r.root))continue;
      const p0=demote.has(r.root)?byRoot.get(demote.get(r.root)):parentFor(r);if(!p0||!mainSet.has(p0.root))continue;
      const contrast=deltaE00(rgbToLab(r.rgb),rgbToLab(p0.rgb)),longSide=Math.max(r.bw,r.bh),shortSide=Math.min(r.bw,r.bh),shapeOK=r.fill>=.055||(shortSide<=4&&longSide>=8),margin=Math.max(4,Math.min(p0.bw,p0.bh)*detailCfg.margin);
      const inside=r.bbox[0]>=p0.bbox[0]+margin&&r.bbox[1]>=p0.bbox[1]+margin&&r.bbox[2]<=p0.bbox[2]-margin&&r.bbox[3]<=p0.bbox[3]-margin;
      const regular=r.area>=regularMin,thinDetail=shortSide<=4&&r.area>=detailMin&&longSide>=8&&r.fill>=.25;
      if((regular||thinDetail)&&r.area<=p0.area*detailCfg.maxFrac&&contrast>=detailCfg.contrast&&longSide>=detailCfg.minLong&&shapeOK&&r.std<=detailCfg.std&&inside)details.push({...r,parentRoot:p0.root,contrast});
    }

    // Do not surface low-value black/white/skin detail fragments when auto-ignore is on.
    // Ignored main regions are kept only when they host a useful visible detail (e.g. a face that contains eyes/mouth).
    const visibleDetails=details.filter(d=>!(els.autoIgnore.checked&&defaultIgnoreReason(d.rgb.map(Math.round))));
    mainRoots.sort((a,b)=>a.cy-b.cy||a.cx-b.cx);const detailMap=new Map();visibleDetails.forEach(d=>{if(!detailMap.has(d.parentRoot))detailMap.set(d.parentRoot,[]);detailMap.get(d.parentRoot).push(d);});detailMap.forEach(v=>v.sort((a,b)=>a.cy-b.cy||a.cx-b.cx));
    const displayMain=mainRoots.filter(m=>{const reason=els.autoIgnore.checked?defaultIgnoreReason(m.rgb.map(Math.round)):'';return !reason||detailMap.has(m.root);});
    regions=[]; resetManualState(); let uid=1,mainIndex=0;for(const m of displayMain){
      mainIndex++;const ml=String(mainIndex).padStart(2,'0'),children=detailMap.get(m.root)||[],items=[{...m,type:'main',label:ml,parentRoot:null}].concat(children.map((d,j)=>({...d,type:'detail',label:ml+'.'+(j+1)})));
      for(const c0 of items){const rgb=c0.rgb.map(Math.round),reason=els.autoIgnore.checked?defaultIgnoreReason(rgb):'',candidates=bestMatches(rgb,5);const selected=candidates[0]?.p.code||'';regions.push({id:uid++,root:c0.root,type:c0.type,label:c0.label,mainKey:`auto-main-${m.root}`,parentRoot:c0.parentRoot,name:c0.type==='detail'?`细节 ${c0.label}`:`主区域 ${c0.label}`,rgb,cx:c0.cx,cy:c0.cy,bbox:c0.bbox,area:c0.area,ignore:!!reason,ignoreReason:reason,candidates,selected,paletteSelections:{[PALETTE.id]:selected},manual:false,origin:'auto',uid:(crypto.randomUUID?crypto.randomUUID():`u-${Date.now()}-${Math.random()}`),linkGroup:''});}
    }
    analysis={w,h,scale,canvas:c,imageData:id,labels,rootById,bgRGB,mainCount:displayMain.length,detailCount:visibleDetails.length};selectedRegion=regions[0]?.id||null;if(typeof v3AfterAnalyze==='function')v3AfterAnalyze();renderAll();
  }

  function getPalette(code){ return PALETTE.entries.find(x=>x.code===code); }
  function activeRegions(){ return regions.filter(r=>!r.ignore && r.selected); }

  function renderAll(){ renderDisplay(); renderRegionList(); renderTable(); renderPreview(); renderBOM(); renderLimitUI(); renderAnnotated(); renderLinked(); upsertInspector(); updateToolUI(); const active=activeRegions().length,main=regions.filter(r=>r.type==='main').length,detail=regions.filter(r=>r.type==='detail').length,manual=regions.filter(r=>r.manual).length; els.summary.textContent=`${main} 主区域 · ${detail} 细节 · ${active} 个匹配${manual?` · ${manual} 个补充`:''}`; const enabled=active>0; els.csv.disabled=!enabled;els.previewBtn.disabled=!enabled;els.bomBtn.disabled=!enabled;els.annotatedBtn.disabled=!enabled;els.linkedBtn.disabled=!enabled; }

  function renderDisplay(){
    if(!analysis)return; const c=els.display;c.width=analysis.w;c.height=analysis.h;const ctx=c.getContext('2d');ctx.drawImage(analysis.canvas,0,0);
    for(const r of regions){
      const x=r.cx,y=r.cy, sel=r.id===selectedRegion; ctx.beginPath();ctx.arc(x,y,sel?12:10,0,Math.PI*2);ctx.fillStyle=r.ignore?'rgba(107,114,128,.9)':sel?'rgba(17,24,39,.98)':'rgba(17,24,39,.82)';ctx.fill();ctx.lineWidth=r.manual?3:2;ctx.strokeStyle=r.manual?'#a855f7':'white';ctx.stroke();ctx.fillStyle='white';ctx.font='700 9px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=r.type==='detail'?'700 7px system-ui':'700 9px system-ui';ctx.fillText(r.label,x,y+.4);
    }
  }

  function renderRegionList(){
    if(!regions.length){els.regionList.innerHTML='<div class="placeholder-card">没有找到稳定区域。可降低“主区域最小面积”、调整背景容差，或提高“细节识别灵敏度”灵敏度后重新识别。</div>';return;}
    els.regionList.innerHTML='';
    for(const r of regions){
      const p=getPalette(r.selected), best=r.candidates[0]; const card=document.createElement('div'); card.className='region-card '+r.type+(r.ignore?' ignored':'')+(r.id===selectedRegion?' selected':''); card.dataset.id=r.id;
      card.innerHTML=`<div class="region-top"><div class="region-num">${r.label}</div><input class="region-name" value="${escapeHtml(r.name)}" aria-label="区域名称"><span class="type-badge ${r.type==='detail'?'detail':''}">${r.type==='detail'?'细节':'主区域'}</span>${r.manual?'<span class=\"type-badge\" style=\"background:#f3e8ff;color:#7c3aed\">补充</span>':''}<button class="toggle">${r.ignore?'加入匹配':'忽略'}</button></div>
      <div class="match-line"><div class="color-box"><span class="swatch" style="background:${hex(r.rgb)}"></span><div class="color-meta"><strong>原图颜色</strong><span>${hex(r.rgb)}</span></div></div><div class="arrow">→</div><div class="color-box"><span class="swatch" style="background:${p?p.hex:'#eee'}"></span><div class="color-meta"><strong>${r.ignore?'默认忽略':(p?p.code:'—')}</strong><span>${r.ignore?(r.ignoreReason||'手动忽略'):(p?`ΔE ${deltaFor(r,p).toFixed(2)}`:'')}</span></div></div></div>
      ${r.ignore?`<div class="ignore-note">当前按“${r.ignoreReason||'手动设置'}”忽略。点击“加入匹配”可恢复；补充区域也支持正常匹配。</div>`:`<div class="candidate-row">${r.candidates.slice(0,4).map(c=>`<button class="candidate ${c.p.code===r.selected?'active':''}" data-code="${c.p.code}"><span class="mini" style="background:${c.p.hex}"></span>${c.p.code} · ${c.de.toFixed(1)}</button>`).join('')}<button class="candidate more">全部 ${PALETTE.entries.length} 色</button></div>`}`;
      card.addEventListener('click',()=>{selectedRegion=r.id;renderDisplay(); $$('.region-card').forEach(x=>x.classList.toggle('selected',+x.dataset.id===r.id));});
      card.querySelector('.region-name').addEventListener('input',e=>{r.name=e.target.value;renderTable();renderAnnotated();renderLinked();});
      card.querySelector('.toggle').addEventListener('click',e=>{e.stopPropagation();r.ignore=!r.ignore;if(!r.ignore)r.ignoreReason='';else r.ignoreReason='手动设置';renderAll();});
      card.querySelectorAll('.candidate[data-code]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();r.selected=btn.dataset.code;rememberSelection(r);limitProposal=null;renderAll();}));
      const more=card.querySelector('.candidate.more'); if(more)more.addEventListener('click',e=>{e.stopPropagation();openPaletteModal(r.id);});
      els.regionList.appendChild(card);
    }
  }

  function deltaFor(r,p){ return deltaE00(rgbToLab(r.rgb),p.lab||(p.lab=rgbToLab(p.rgb))); }
  function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch])); }

  function renderTable(){
    const rows=activeRegions(); if(!rows.length){els.tableBody.innerHTML='<tr><td colspan="7" class="muted">暂无参与匹配的区域</td></tr>';return;}
    els.tableBody.innerHTML=rows.map(r=>{const p=getPalette(r.selected);return `<tr><td>${r.label}</td><td>${escapeHtml(r.name)}</td><td><span class="table-swatch" style="background:${hex(r.rgb)}"></span>${hex(r.rgb)}</td><td><strong>${p.code}</strong></td><td><span class="table-swatch" style="background:${p.hex}"></span>${p.hex}</td><td>${deltaFor(r,p).toFixed(2)}</td></tr>`;}).join('');
  }

  function renderPreview(){
    if(!sourceImage||!analysis||!els.preview){if(els.preview){els.preview.width=1;els.preview.height=1;}return;}
    const low=document.createElement('canvas'); low.width=analysis.w; low.height=analysis.h; const lctx=low.getContext('2d'); lctx.drawImage(analysis.canvas,0,0);
    const im=lctx.getImageData(0,0,analysis.w,analysis.h), data=im.data, rootColors=new Map();
    for(const r of activeRegions()){ if(!r.manual){const p=getPalette(r.selected); if(p)rootColors.set(r.root,p.rgb);} }
    const labels=analysis.labels, rootById=analysis.rootById;
    if(rootById){
      for(let i=0;i<labels.length;i++){const lab=labels[i]; if(lab<0)continue; const root=rootById[lab], rgb=rootColors.get(root); if(!rgb)continue; const p=i*4;data[p]=rgb[0];data[p+1]=rgb[1];data[p+2]=rgb[2];}
    }
    for(const r of activeRegions().filter(r=>r.manual&&r.manualPixels?.length)){const p=getPalette(r.selected);if(!p)continue;for(const i of r.manualPixels){const q=i*4;data[q]=p.rgb[0];data[q+1]=p.rgb[1];data[q+2]=p.rgb[2];}}
    lctx.putImageData(im,0,0);
    const iw=sourceImage.naturalWidth||sourceImage.width,ih=sourceImage.naturalHeight||sourceImage.height,s=Math.min(1,1800/Math.max(iw,ih));
    els.preview.width=Math.max(1,Math.round(iw*s));els.preview.height=Math.max(1,Math.round(ih*s));const ctx=els.preview.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(low,0,0,els.preview.width,els.preview.height);
  }

  function buildBOM(){
    const rows=activeRegions(), total=rows.reduce((s,r)=>s+(r.area||0),0), map=new Map();
    for(const r of rows){const p=getPalette(r.selected);if(!p)continue;let g=map.get(p.code);if(!g){g={p,area:0,regions:[]};map.set(p.code,g);}g.area+=r.area||0;g.regions.push(r);}
    return {rows:[...map.values()].sort((a,b)=>b.area-a.area),total};
  }

  function renderBOM(){
    if(!els.bomBody)return;const bom=buildBOM();
    if(!bom.rows.length){els.bomBody.innerHTML='<tr><td colspan="6" class="muted">暂无结果</td></tr>';els.bomSummary.innerHTML='暂无 BOM';return;}
    els.bomSummary.innerHTML=`<div class="bom-stat">当前色卡<strong>${PALETTE.name}</strong></div><div class="bom-stat">使用颜色<strong>${bom.rows.length}</strong></div><div class="bom-stat">参与区域<strong>${activeRegions().length}</strong></div><div class="bom-stat">匹配二维面积<strong>${Math.round(bom.total).toLocaleString()} px</strong></div>`;
    els.bomBody.innerHTML=bom.rows.map(g=>{const pct=bom.total?g.area/bom.total*100:0;return `<tr><td><strong>${paletteLabel(g.p)}</strong></td><td><span class="table-swatch" style="background:${g.p.hex}"></span>${g.p.hex}</td><td>${g.regions.length}</td><td>${Math.round(g.area).toLocaleString()} px</td><td>${pct.toFixed(1)}%</td><td>${g.regions.map(r=>`${r.label} ${escapeHtml(r.name)}`).join('、')}</td></tr>`;}).join('');
  }

  function weightedAssignmentCost(rows,assign){
    let sum=0,w=0;for(const r of rows){const p=getPalette(assign.get(r.id));if(!p)continue;const wt=Math.max(1,r.area||1);sum+=wt*deltaE00(rgbToLab(r.rgb),p.lab||(p.lab=rgbToLab(p.rgb)));w+=wt;}return w?sum/w:0;
  }

  function generateLimitProposal(){
    const rows=activeRegions(); if(!rows.length){limitProposal=null;renderLimitUI();return;}
    let k=Math.max(2,Math.min(30,parseInt(els.limitCount.value||'8',10)));els.limitCount.value=k;
    const beforeCodes=[...new Set(rows.map(r=>r.selected))];
    if(beforeCodes.length<=k){limitProposal={assignments:new Map(rows.map(r=>[r.id,r.selected])),before:weightedAssignmentCost(rows,new Map(rows.map(r=>[r.id,r.selected]))),after:null,fromCount:beforeCodes.length,toCount:beforeCodes.length,changes:[],k,message:`当前仅使用 ${beforeCodes.length} 个颜色，不需要压缩到 ${k} 个。`};renderLimitUI();return;}
    const assign=new Map(rows.map(r=>[r.id,r.selected])), baseCost=weightedAssignmentCost(rows,assign);
    while(new Set(assign.values()).size>k){
      const codes=[...new Set(assign.values())];let best=null;
      for(let i=0;i<codes.length;i++)for(let j=i+1;j<codes.length;j++){
        const a=codes[i],b=codes[j];
        for(const [from,to] of [[a,b],[b,a]]){
          let delta=0;for(const r of rows){if(assign.get(r.id)!==from)continue;const wt=Math.max(1,r.area||1),pf=getPalette(from),pt=getPalette(to);if(!pf||!pt)continue;const lr=rgbToLab(r.rgb);delta+=wt*(deltaE00(lr,pt.lab||(pt.lab=rgbToLab(pt.rgb)))-deltaE00(lr,pf.lab||(pf.lab=rgbToLab(pf.rgb))));}
          if(!best||delta<best.delta)best={from,to,delta};
        }
      }
      if(!best)break;for(const r of rows)if(assign.get(r.id)===best.from)assign.set(r.id,best.to);
    }
    const after=weightedAssignmentCost(rows,assign), trans=new Map();
    for(const r of rows){const to=assign.get(r.id),from=r.selected;if(to===from)continue;const key=from+'>'+to;if(!trans.has(key))trans.set(key,{from,to,regions:[]});trans.get(key).regions.push(r);}
    limitProposal={assignments:assign,before:baseCost,after,fromCount:beforeCodes.length,toCount:new Set(assign.values()).size,changes:[...trans.values()],k};renderLimitUI();
  }

  function renderLimitUI(){
    if(!els.limitSummary)return;
    const rows=activeRegions(),used=new Set(rows.map(r=>r.selected)).size;
    els.limitApply.disabled=!limitProposal||!limitProposal.changes?.length;els.limitRestore.disabled=!limitBackup;
    if(!rows.length){els.limitSummary.textContent='上传并识别图片后，可把当前用色压缩到指定数量。';els.limitBody.innerHTML='<tr><td colspan="4" class="muted">尚未生成方案</td></tr>';return;}
    if(!limitProposal){els.limitSummary.textContent=`当前使用 ${used} 个颜色。设置“最多颜色”后生成优化方案；算法按区域面积加权，尽量让感知色差增量最小。`;els.limitBody.innerHTML='<tr><td colspan="4" class="muted">尚未生成方案</td></tr>';return;}
    if(limitProposal.message){els.limitSummary.textContent=limitProposal.message;els.limitBody.innerHTML='<tr><td colspan="4" class="muted">无需合并</td></tr>';return;}
    const diff=limitProposal.after-limitProposal.before;els.limitSummary.innerHTML=`<strong>${limitProposal.fromCount} → ${limitProposal.toCount} 色</strong> · 面积加权平均 ΔE：${limitProposal.before.toFixed(2)} → ${limitProposal.after.toFixed(2)}（${diff>=0?'+':''}${diff.toFixed(2)}）。该指标用于比较方案，不代表真实材料色差。`;
    els.limitBody.innerHTML=limitProposal.changes.length?limitProposal.changes.map(ch=>{const a=getPalette(ch.from),b=getPalette(ch.to);return `<tr><td><span class="table-swatch" style="background:${a?.hex||'#eee'}"></span>${a?paletteLabel(a):ch.from}</td><td>→</td><td><span class="table-swatch" style="background:${b?.hex||'#eee'}"></span>${b?paletteLabel(b):ch.to}</td><td>${ch.regions.map(r=>r.label).join('、')}</td></tr>`;}).join(''):'<tr><td colspan="4" class="muted">没有需要修改的区域</td></tr>';
  }

  function applyLimitProposal(){
    if(!limitProposal?.assignments)return;if(!limitBackup)limitBackup=new Map(activeRegions().map(r=>[r.id,r.selected]));
    for(const r of activeRegions()){const code=limitProposal.assignments.get(r.id);if(code){r.selected=code;rememberSelection(r);}}
    limitProposal=null;renderAll();
  }

  function restoreLimitOptimization(){
    if(!limitBackup)return;for(const r of regions){const code=limitBackup.get(r.id);if(code){r.selected=code;rememberSelection(r);}}limitBackup=null;limitProposal=null;renderAll();
  }

  function downloadBOM(){
    const bom=buildBOM();const lines=[['色卡','色号','名称','HEX','区域数','二维面积px','面积占比','使用区域']];for(const g of bom.rows){lines.push([PALETTE.name,g.p.code,g.p.alias||'',g.p.hex,g.regions.length,Math.round(g.area),(bom.total?g.area/bom.total*100:0).toFixed(2)+'%',g.regions.map(r=>`${r.label} ${r.name}`).join(' / ')]);}const csv='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${sourceName}-${PALETTE.id}-BOM.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function drawLabel(ctx,x,y,text,scale=1){
    const rad=13*scale;ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fillStyle='#111827';ctx.fill();ctx.lineWidth=2*scale;ctx.strokeStyle='white';ctx.stroke();ctx.fillStyle='white';ctx.font=`700 ${10*scale}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y+.5*scale);
  }

  function renderAnnotated(){
    if(!sourceImage || !analysis){els.annotated.width=1;els.annotated.height=1;return;}
    const max=2200, iw=sourceImage.naturalWidth||sourceImage.width, ih=sourceImage.naturalHeight||sourceImage.height, s=Math.min(1,max/Math.max(iw,ih)); const w=Math.round(iw*s),h=Math.round(ih*s); const c=els.annotated;c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(sourceImage,0,0,w,h);
    const sx=w/analysis.w, sy=h/analysis.h, marker=Math.max(.8,Math.min(1.5,w/1100)); for(const r of activeRegions())drawLabel(ctx,r.cx*sx,r.cy*sy,r.label,marker);
  }

  function renderLinked(){
    if(!sourceImage || !analysis){return;}
    const cols=PALETTE.entries.length>600?15:10, cellW=PALETTE.entries.length>600?82:108, cellH=30, chartX=18, chartY=72;
    const chartW=cols*cellW, rows=Math.ceil(PALETTE.entries.length/cols), chartH=rows*cellH;
    const gap=72, rightW=900, W=chartW+gap+rightW+36, H=Math.max(chartY+chartH+28,1120);
    const c=els.linked;c.width=W;c.height=H;const ctx=c.getContext('2d');
    ctx.fillStyle='white';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#111827';ctx.font='700 22px system-ui';ctx.textAlign='left';ctx.fillText(`${PALETTE.name} · 色号定位`,18,30);
    ctx.fillStyle='#6b7280';ctx.font='13px system-ui';ctx.fillText('数字色卡 · 红框为选中色号 · 连线颜色为所选色',18,53);

    PALETTE.entries.forEach((p,i)=>{
      const col=i%cols,row=Math.floor(i/cols),x=chartX+col*cellW,y=chartY+row*cellH;
      ctx.fillStyle='#6b7280';ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillText(p.code,x,y+18);
      const swx=x+(PALETTE.entries.length>600?28:42), sww=PALETTE.entries.length>600?48:58;ctx.fillStyle=p.hex;ctx.fillRect(swx,y+4,sww,20);ctx.strokeStyle='rgba(0,0,0,.12)';ctx.lineWidth=1;ctx.strokeRect(swx+.5,y+4+.5,sww-1,19);
    });

    const ix=chartW+gap+18, areaW=rightW-36;
    const iw=sourceImage.naturalWidth||sourceImage.width, ih=sourceImage.naturalHeight||sourceImage.height;
    const fit=Math.min(areaW/iw,(H-180)/ih,1.5), dw=iw*fit,dh=ih*fit, imgX=ix+(areaW-dw)/2, imgY=(H-dh)/2;
    ctx.fillStyle='#f3f4f6';ctx.fillRect(imgX-16,imgY-16,dw+32,dh+32);ctx.drawImage(sourceImage,imgX,imgY,dw,dh);
    const sx=dw/analysis.w,sy=dh/analysis.h;
    activeRegions().forEach(r=>{
      const p=getPalette(r.selected), idx=PALETTE.entries.indexOf(p); if(idx<0)return;
      const col=idx%cols,row=Math.floor(idx/cols), tx=chartX+col*cellW+(PALETTE.entries.length>600?52:71),ty=chartY+row*cellH+14, ox=imgX+r.cx*sx,oy=imgY+r.cy*sy;
      ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(tx,ty);ctx.lineWidth=5;ctx.strokeStyle='rgba(255,255,255,.94)';ctx.stroke();
      ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(tx,ty);ctx.lineWidth=2.2;ctx.strokeStyle=p.hex;ctx.stroke();
      ctx.beginPath();ctx.roundRect(chartX+col*cellW+(PALETTE.entries.length>600?24:38),chartY+row*cellH,PALETTE.entries.length>600?56:66,28,6);ctx.lineWidth=3;ctx.strokeStyle='#ef4444';ctx.stroke();
      drawLabel(ctx,ox,oy,r.label,1);
    });
    ctx.fillStyle='#111827';ctx.font='700 17px system-ui';ctx.textAlign='left';ctx.fillText(`${activeRegions().length} 个参与匹配的独立区域`,ix,36);
    ctx.fillStyle='#6b7280';ctx.font='12px system-ui';ctx.fillText('同色但不相连的部件仍分别编号。',ix,57);
  }

  function openPaletteModal(id){selectedRegion=id;const r=regions.find(x=>x.id===id);els.modalRegionName.textContent=r?`· ${r.name}`:'';els.paletteSearch.value='';buildPaletteGrid('');els.modal.classList.remove('hidden');els.modal.setAttribute('aria-hidden','false');}
  function closePaletteModal(){els.modal.classList.add('hidden');els.modal.setAttribute('aria-hidden','true');}
  function buildPaletteGrid(query){
    const q=(query||'').trim().toUpperCase(); const list=PALETTE.entries.filter(p=>!q||p.code.toUpperCase().includes(q)||(p.alias||'').includes(query.trim())); els.paletteGrid.innerHTML='';
    for(const p of list){const b=document.createElement('button');b.className='palette-item';b.innerHTML=`<div class="wide-swatch" style="background:${p.hex}"></div><strong>${paletteLabel(p)}</strong><span>${p.hex}${p.page?` · 第${p.page}页`:''}</span>`;b.addEventListener('click',()=>{const r=regions.find(x=>x.id===selectedRegion);if(r){r.selected=p.code;r.ignore=false;r.ignoreReason='';rememberSelection(r);limitProposal=null;}closePaletteModal();renderAll();});els.paletteGrid.appendChild(b);}
  }

  function downloadCanvas(canvas,filename){ canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},'image/png'); }
  function downloadCSV(){const rows=activeRegions();const lines=[['色卡','编号','区域','原色HEX','推荐色号','色号名称','色卡HEX','DeltaE00']];rows.forEach(r=>{const p=getPalette(r.selected);lines.push([PALETTE.name,r.label,r.name,hex(r.rgb),p.code,p.alias||'',p.hex,deltaFor(r,p).toFixed(3)]);});const csv='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${sourceName}-color-match.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

  // ===== Plush Color Studio v3 extension =====
  let v3EditMode='select', v3MultiSelected=new Set(), v3EditHistory=[], v3PointerEditing=false, v3BrushTouched=false;
  let v3Pages=[], v3CurrentPageId=null, v3PageSeq=1, v3PendingPageSnapshot=null, v3LoadingProject=false;
  let v3Schemes={A:null,B:null}, v3PurchaseMeta={}, v3Usage={totalGrams:120,spoolGrams:50,defaultPrice:0,costTolerance:3};
  let v3CostProposal=null, v3InstallPrompt=null, v3AutosaveTimer=null, v3LinkSeq=1;
  const V3_PROJECT_VERSION=3;

  function v3Id(prefix='id'){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
  function v3DeepClone(v){return JSON.parse(JSON.stringify(v));}
  function v3DownloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);}
  function v3FileToDataURL(file){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file);});}
  function v3LoadImage(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url;});}
  function v3Escape(s){return escapeHtml(String(s??''));}
  function v3CurrentPage(){return v3Pages.find(p=>p.id===v3CurrentPageId)||null;}
  function v3EnsureUIDs(){for(const r of regions){if(!r.uid)r.uid=v3Id('r');if(r.linkGroup===undefined)r.linkGroup='';if(!r.origin)r.origin=r.manual?'added':'auto';}}
  function v3RegionKey(r){return r.uid||`${r.type}-${r.label}-${Math.round(r.cx)}-${Math.round(r.cy)}`;}
  function v3GetPalette(id){return PALETTES[id]||null;}
  function v3BestMatches(rgb,pal,k=5){if(!pal)return[];const l=rgbToLab(rgb);const a=pal.entries.map(p=>({p,de:deltaE00(l,p.lab||(p.lab=rgbToLab(p.rgb)))}));a.sort((x,y)=>x.de-y.de);return a.slice(0,k);}
  function v3SelectionForPalette(r,pal){const saved=r.paletteSelections?.[pal.id];if(saved&&pal.entries.some(p=>p.code===saved))return saved;return v3BestMatches(r.rgb,pal,1)[0]?.p.code||'';}
  function v3GetPurchaseMeta(code,paletteId=PALETTE.id){const key=`${paletteId}:${code}`;return v3PurchaseMeta[key]||(v3PurchaseMeta[key]={stock:0,price:'',purchased:false,note:''});}
  function v3Confidence(rgb,pal=PALETTE){const ms=v3BestMatches(rgb,pal,2);if(!ms.length)return{label:'无结果',cls:'low',d1:Infinity,gap:0,note:'无可用色号'};const d1=ms[0].de,d2=ms[1]?.de??99,gap=d2-d1;let label='低',cls='low';if(d1<2&&gap>=0.7){label='很高';cls='high';}else if(d1<4){label='较高';cls='good';}else if(d1<7){label='一般';cls='mid';}const ambiguous=gap<0.65;return{label:ambiguous?`${label} · 候选接近`:label,cls,d1,gap,note:ambiguous?'前两名很接近，建议人工确认':''};}

  // ---- Custom palettes ----
  function v3PaletteSerializable(p){return{id:p.id,name:p.name,source:p.source||'用户导入',note:p.note||'',custom:!!p.custom,entries:p.entries.map(e=>({code:e.code,rgb:e.rgb,alias:e.alias||'',page:e.page,row:e.row,col:e.col,baseRgb:e.baseRgb||e.rgb}))};}
  function v3PersistCustomPalettes(){try{const list=Object.values(PALETTES).filter(p=>p.custom).map(v3PaletteSerializable);localStorage.setItem('pcm-v3-custom-palettes',JSON.stringify(list));}catch(e){}}
  function v3LoadCustomPalettes(){try{const list=JSON.parse(localStorage.getItem('pcm-v3-custom-palettes')||'[]');for(const raw of list){raw.entries=(raw.entries||[]).map(e=>({...e,hex:hex(e.rgb),lab:null,baseRgb:e.baseRgb||e.rgb}));raw.custom=true;PALETTES[raw.id]=raw;}}catch(e){}}
  function v3RefreshPaletteSelect(){if(!els.paletteSelect)return;const cur=PALETTE.id;els.paletteSelect.innerHTML=Object.values(PALETTES).map(p=>`<option value="${v3Escape(p.id)}">${v3Escape(p.name)}</option>`).join('');els.paletteSelect.value=PALETTES[cur]?cur:Object.keys(PALETTES)[0];}
  function v3RenderPaletteManager(){if(!els.paletteManagerList)return;const list=Object.values(PALETTES);els.paletteManagerList.innerHTML=list.map(p=>`<div class="manager-card" data-pid="${v3Escape(p.id)}"><strong>${v3Escape(p.name)}</strong><p>${p.entries.length} 色 · ${v3Escape(p.source||'色卡')}<br>${v3Escape(p.note||'')}</p><div class="manager-actions"><button class="button small pm-use">使用</button><button class="button small pm-export">导出 JSON</button>${p.custom?'<button class="button small pm-calibrate">校准</button><button class="button small pm-delete">删除</button>':''}</div></div>`).join('');
    els.paletteManagerList.querySelectorAll('.manager-card').forEach(card=>{const id=card.dataset.pid,p=PALETTES[id];card.querySelector('.pm-use')?.addEventListener('click',()=>{setPalette(id);v3RefreshPaletteSelect();v3RenderPaletteManager();});card.querySelector('.pm-export')?.addEventListener('click',()=>{v3DownloadBlob(new Blob([JSON.stringify(v3PaletteSerializable(p),null,2)],{type:'application/json'}),`${p.id}.palette.json`);});card.querySelector('.pm-delete')?.addEventListener('click',()=>{if(!p.custom)return;if(PALETTE.id===id)setPalette('qqtq-480');delete PALETTES[id];v3PersistCustomPalettes();v3RefreshPaletteSelect();v3RenderPaletteManager();v3ScheduleAutosave();});card.querySelector('.pm-calibrate')?.addEventListener('click',()=>v3CalibratePalette(id));});
  }
  function v3CalibratePalette(id){const p=PALETTES[id];if(!p?.custom)return;const raw=prompt('输入校准百分比：亮度,R,G,B（例如 100,100,100,100）','100,100,100,100');if(!raw)return;const vals=raw.split(',').map(Number);if(vals.length<4||vals.some(x=>!isFinite(x)||x<=0))return alert('格式不正确。');const [v,rg,gg,bg]=vals.map(x=>x/100);for(const e of p.entries){const b=e.baseRgb||e.rgb;e.baseRgb=b.slice();e.rgb=[clamp(b[0]*v*rg,0,255),clamp(b[1]*v*gg,0,255),clamp(b[2]*v*bg,0,255)].map(Math.round);e.hex=hex(e.rgb);e.lab=null;}v3PersistCustomPalettes();if(PALETTE.id===id){for(const r of regions){r.candidates=bestMatches(r.rgb,5);if(!getPalette(r.selected))r.selected=r.candidates[0]?.p.code||'';}renderAll();}v3RenderPaletteManager();}
  async function v3SamplePaletteImages(files,rows,cols,start,prefix,digits){const sorted=[...files].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hans-CN',{numeric:true}));const entries=[];let number=start;for(let pi=0;pi<sorted.length;pi++){const url=await v3FileToDataURL(sorted[pi]);const im=await v3LoadImage(url);const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ct=c.getContext('2d',{willReadFrequently:true});ct.drawImage(im,0,0);const data=ct.getImageData(0,0,c.width,c.height).data;for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){
      const x0=(col+.30)*c.width/cols,x1=(col+.70)*c.width/cols,y0=(r+.30)*c.height/rows,y1=(r+.70)*c.height/rows;let rs=[],gs=[],bs=[];const sx=Math.max(1,Math.floor((x1-x0)/12)),sy=Math.max(1,Math.floor((y1-y0)/12));for(let y=Math.floor(y0);y<y1;y+=sy)for(let x=Math.floor(x0);x<x1;x+=sx){const q=(y*c.width+x)*4;rs.push(data[q]);gs.push(data[q+1]);bs.push(data[q+2]);}const trimmed=a=>{a.sort((x,y)=>x-y);const k=Math.floor(a.length*.12),b=a.slice(k,a.length-k||undefined);return Math.round(b.reduce((s,x)=>s+x,0)/Math.max(1,b.length));};const rgb=[trimmed(rs),trimmed(gs),trimmed(bs)];const code=prefix+String(number++).padStart(digits,'0');entries.push({code,rgb,baseRgb:rgb.slice(),alias:'',page:pi+1,row:r+1,col:col+1,hex:hex(rgb),lab:null});}}
    return entries;
  }
  async function v3BuildCustomPalette(){const files=els.paletteImages.files;if(!files?.length)return alert('请先选择色卡图片。');const name=(els.customPaletteName.value||'我的色卡').trim(),prefix=(els.customPalettePrefix.value||'').trim(),start=parseInt(els.customPaletteStart.value||'1',10),digits=parseInt(els.customPaletteDigits.value||'3',10),rows=parseInt(els.customPaletteRows.value||'6',10),cols=parseInt(els.customPaletteCols.value||'6',10);els.paletteImportStatus.textContent='正在提取色块…';try{const entries=await v3SamplePaletteImages(files,rows,cols,start,prefix,digits);const id='custom-'+name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g,'-')+'-'+Date.now().toString(36);PALETTES[id]={id,name,source:`${files.length} 张图片 · ${rows}×${cols}`,note:'用户通过网格图片导入；取每个格子中央区域的截尾均值。',custom:true,entries};v3PersistCustomPalettes();v3RefreshPaletteSelect();v3RenderPaletteManager();els.paletteImportStatus.textContent=`已建立 ${entries.length} 色：${name}`;v3ScheduleAutosave();}catch(e){console.error(e);els.paletteImportStatus.textContent='导入失败，请检查图片与网格设置。';}}
  function v3ImportPaletteJSON(file){const fr=new FileReader();fr.onload=()=>{try{const raw=JSON.parse(fr.result);if(!raw.entries?.length)throw new Error('无 entries');const id=raw.id&& !PALETTES[raw.id]?raw.id:`custom-${Date.now().toString(36)}`;PALETTES[id]={...raw,id,custom:true,entries:raw.entries.map(e=>({...e,baseRgb:e.baseRgb||e.rgb,hex:hex(e.rgb),lab:null}))};v3PersistCustomPalettes();v3RefreshPaletteSelect();v3RenderPaletteManager();}catch(e){alert('色卡 JSON 无法读取。');}};fr.readAsText(file);}

  // ---- Project pages & serialization ----
  function v3SerializeRegion(r){return{uid:r.uid||v3Id('r'),root:r.root,type:r.type,mainKey:r.mainKey,parentRoot:r.parentRoot,label:r.label,name:r.name,rgb:r.rgb,cx:r.cx,cy:r.cy,bbox:r.bbox,area:r.area,ignore:r.ignore,ignoreReason:r.ignoreReason,selected:r.selected,paletteSelections:r.paletteSelections||{},manualPixels:r.manualPixels||[],manual:!!r.manual,origin:r.origin|| (r.manual?'added':'auto'),linkGroup:r.linkGroup||''};}
  function v3SaveCurrentPageState(){const p=v3CurrentPage();if(!p||!analysis)return;v3EnsureUIDs();p.snapshot={analysisW:analysis.w,analysisH:analysis.h,regions:regions.map(v3SerializeRegion),settings:{minArea:els.minArea.value,bgTol:els.bgTol.value,merge:els.merge.value,detail:els.detail.value,autoIgnore:els.autoIgnore.checked}};p.regionCount=regions.length;p.updatedAt=Date.now();}
  function v3ScalePixels(pixels,ow,oh,nw,nh){if(ow===nw&&oh===nh)return pixels.slice();const set=new Set();for(const i of pixels||[]){const y=Math.floor(i/ow),x=i-y*ow,nx=Math.round(x*nw/ow),ny=Math.round(y*nh/oh);if(nx>=0&&nx<nw&&ny>=0&&ny<nh)set.add(ny*nw+nx);}return [...set];}
  function v3ApplyPageSnapshot(snap){if(!snap||!analysis)return;const saved=snap.regions||[],used=new Set();v3EnsureUIDs();const autoSaved=saved.filter(r=>!(r.manualPixels&&r.manualPixels.length));for(const s of autoSaved){let best=null,bscore=Infinity;for(const r of regions){if(used.has(r.id)||r.type!==s.type)continue;const dc=Math.hypot(r.cx-s.cx,r.cy-s.cy)/Math.max(1,Math.hypot(analysis.w,analysis.h)),de=deltaE00(rgbToLab(r.rgb),rgbToLab(s.rgb)),ar=Math.abs(Math.log(Math.max(1,r.area)/Math.max(1,s.area)));const score=dc*120+de+ar*5;if(score<bscore){bscore=score;best=r;}}if(best&&bscore<25){used.add(best.id);Object.assign(best,{uid:s.uid||best.uid,name:s.name,ignore:s.ignore,ignoreReason:s.ignoreReason,paletteSelections:s.paletteSelections||{},linkGroup:s.linkGroup||'',origin:s.origin||'auto'});best.selected=v3SelectionForPalette({...best,paletteSelections:s.paletteSelections||{}},PALETTE);}}
    const manuals=saved.filter(r=>r.manualPixels&&r.manualPixels.length);for(const s of manuals){const pixels=v3ScalePixels(s.manualPixels,snap.analysisW||analysis.w,snap.analysisH||analysis.h,analysis.w,analysis.h);const stats=v3StatsFromPixels(pixels);if(!stats)continue;let near=regions.find(r=>!r.manual&&Math.hypot(r.cx-stats.cx,r.cy-stats.cy)<14&&deltaE00(rgbToLab(r.rgb),rgbToLab(stats.rgb))<8);if(near&&s.origin==='edited')regions=regions.filter(r=>r!==near);const rr={...s,id:nextId(),rgb:stats.rgb,cx:stats.cx,cy:stats.cy,bbox:stats.bbox,area:stats.area,manualPixels:pixels,manual:true,candidates:bestMatches(stats.rgb,5),uid:s.uid||v3Id('r')};rr.selected=v3SelectionForPalette(rr,PALETTE);regions.push(rr);}v3EnsureUIDs();selectedRegion=regions[0]?.id||null;relabelRegions();}
  function v3AfterAnalyze(){v3EnsureUIDs();if(v3PendingPageSnapshot){const s=v3PendingPageSnapshot;v3PendingPageSnapshot=null;v3ApplyPageSnapshot(s);}v3RenderPages();v3ScheduleAutosave();}
  async function v3AddPageFromDataURL(dataUrl,name){v3SaveCurrentPageState();const page={id:v3Id('page'),name:name||`设计图 ${v3PageSeq++}`,dataUrl,snapshot:null,regionCount:0};v3Pages.push(page);await v3SwitchPage(page.id,false);}
  async function v3AddFiles(files){for(const f of files){const url=await v3FileToDataURL(f);await v3AddPageFromDataURL(url,(f.name||'image').replace(/\.[^.]+$/,''));}}
  function v3ApplyPageSettings(s){if(!s)return;if(s.minArea!=null){els.minArea.value=s.minArea;els.minAreaValue.textContent=(+s.minArea).toFixed(2)+'%';}if(s.bgTol!=null){els.bgTol.value=s.bgTol;els.bgTolValue.textContent=s.bgTol;}if(s.merge!=null)els.merge.value=s.merge;if(s.detail!=null)els.detail.value=s.detail;if(s.autoIgnore!=null)els.autoIgnore.checked=!!s.autoIgnore;}
  async function v3SwitchPage(id,saveCurrent=true){if(saveCurrent)v3SaveCurrentPageState();const page=v3Pages.find(p=>p.id===id);if(!page)return;v3CurrentPageId=id;v3PendingPageSnapshot=page.snapshot;v3ApplyPageSettings(page.snapshot?.settings);sourceName=page.name;const im=await v3LoadImage(page.dataUrl);setSourceImage(im);v3RenderPages();}
  function v3RemovePage(id){if(v3Pages.length<=1)return alert('项目至少保留一张设计图。');const i=v3Pages.findIndex(p=>p.id===id);if(i<0)return;v3Pages.splice(i,1);if(v3CurrentPageId===id){const next=v3Pages[Math.max(0,i-1)];v3SwitchPage(next.id,false);}v3RenderPages();v3ScheduleAutosave();}
  function v3RenderPages(){if(!els.pageStrip)return;if(!v3Pages.length){els.pageStrip.innerHTML='<span class="page-empty">尚未添加设计图</span>';return;}els.pageStrip.innerHTML=v3Pages.map(p=>`<button class="page-tab ${p.id===v3CurrentPageId?'active':''}" data-page="${p.id}"><span>${v3Escape(p.name)}</span><small>${p.id===v3CurrentPageId?regions.length:(p.snapshot?.regions?.length||p.regionCount||0)} 区域</small><span class="page-remove" title="移除">×</span></button>`).join('');els.pageStrip.querySelectorAll('.page-tab').forEach(b=>{b.addEventListener('click',e=>{if(e.target.classList.contains('page-remove')){e.stopPropagation();v3RemovePage(b.dataset.page);return;}v3SwitchPage(b.dataset.page);});});}
  function v3ProjectObject(){v3SaveCurrentPageState();return{format:'plush-color-project',version:V3_PROJECT_VERSION,name:els.projectName?.value||'我的毛绒娃娃',currentPageId:v3CurrentPageId,paletteId:PALETTE.id,pages:v3Pages,schemes:v3Schemes,purchaseMeta:v3PurchaseMeta,usage:v3Usage,customPalettes:Object.values(PALETTES).filter(p=>p.custom).map(v3PaletteSerializable),savedAt:new Date().toISOString()};}
  function v3DownloadProject(){const obj=v3ProjectObject(),name=(obj.name||'plush-project').replace(/[\\/:*?"<>|]/g,'-');v3DownloadBlob(new Blob([JSON.stringify(obj)],{type:'application/json'}),`${name}.plushcolor.json`);}
  async function v3ImportProjectObject(obj){if(!obj||obj.format!=='plush-color-project'||!Array.isArray(obj.pages))throw new Error('invalid project');v3LoadingProject=true;for(const raw of obj.customPalettes||[]){raw.entries=(raw.entries||[]).map(e=>({...e,baseRgb:e.baseRgb||e.rgb,hex:hex(e.rgb),lab:null}));raw.custom=true;PALETTES[raw.id]=raw;}v3PersistCustomPalettes();v3RefreshPaletteSelect();v3Pages=obj.pages;v3CurrentPageId=null;v3Schemes=obj.schemes||{A:null,B:null};v3PurchaseMeta=obj.purchaseMeta||{};v3Usage={...v3Usage,...(obj.usage||{})};if(els.projectName)els.projectName.value=obj.name||'我的毛绒娃娃';updateUsageInputs();const pid=PALETTES[obj.paletteId]?obj.paletteId:'qqtq-480';if(PALETTE.id!==pid){PALETTE=PALETTES[pid];updatePaletteUI();v3RefreshPaletteSelect();}v3RenderPages();const target=obj.currentPageId&&v3Pages.some(p=>p.id===obj.currentPageId)?obj.currentPageId:v3Pages[0]?.id;if(target)await v3SwitchPage(target,false);v3LoadingProject=false;v3RenderSchemes();v3RenderPaletteManager();v3ScheduleAutosave();}
  function v3OpenProjectFile(file){const fr=new FileReader();fr.onload=async()=>{try{await v3ImportProjectObject(JSON.parse(fr.result));}catch(e){console.error(e);alert('项目文件无法读取。');}};fr.readAsText(file);}

  // IndexedDB autosave
  function v3OpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('plush-color-studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('kv');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function v3AutosaveNow(){if(v3LoadingProject||!v3Pages.length)return;try{const obj=v3ProjectObject(),db=await v3OpenDB(),tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(obj,'last-project');await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();if(els.autosaveStatus)els.autosaveStatus.textContent='已自动保存';if(els.restoreAutosave)els.restoreAutosave.classList.remove('hidden');}catch(e){if(els.autosaveStatus)els.autosaveStatus.textContent='自动保存受浏览器容量限制';}}
  function v3ScheduleAutosave(){clearTimeout(v3AutosaveTimer);if(els.autosaveStatus)els.autosaveStatus.textContent='保存中…';v3AutosaveTimer=setTimeout(v3AutosaveNow,900);}
  async function v3LoadAutosave(){try{const db=await v3OpenDB(),tx=db.transaction('kv','readonly'),req=tx.objectStore('kv').get('last-project'),obj=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});db.close();if(obj){els.restoreAutosave?.classList.remove('hidden');return obj;}}catch(e){}return null;}

  // Override regular file upload into multi-page project.
  readFile=async function(file){const url=await v3FileToDataURL(file);await v3AddPageFromDataURL(url,(file.name||'image').replace(/\.[^.]+$/,''));};
  const v3BaseLoadDemo=loadDemo;
  loadDemo=function(){v3BaseLoadDemo();setTimeout(()=>{if(sourceImage&&!v3Pages.length){const c=document.createElement('canvas');c.width=sourceImage.naturalWidth||sourceImage.width;c.height=sourceImage.naturalHeight||sourceImage.height;c.getContext('2d').drawImage(sourceImage,0,0);v3Pages=[{id:v3Id('page'),name:'demo-flat',dataUrl:c.toDataURL('image/png'),snapshot:null,regionCount:regions.length}];v3CurrentPageId=v3Pages[0].id;v3RenderPages();v3ScheduleAutosave();}},300);};

  // ---- Region masks / brush / erase / split / merge ----
  function v3GetRegionPixels(r){if(r.manualPixels?.length)return r.manualPixels.slice();if(!analysis?.labels||!analysis?.rootById||r.root===undefined||r.root===null)return[];const out=[],labels=analysis.labels,roots=analysis.rootById;for(let i=0;i<labels.length;i++){const l=labels[i];if(l>=0&&roots[l]===r.root)out.push(i);}return out;}
  function v3StatsFromPixels(pixels){if(!analysis?.imageData||!pixels?.length)return null;const d=analysis.imageData.data,w=analysis.w,h=analysis.h;let sr=0,sg=0,sb=0,sx=0,sy=0,minx=w,miny=h,maxx=0,maxy=0,n=0;for(const i of pixels){if(i<0||i>=w*h)continue;const y=Math.floor(i/w),x=i-y*w,p=i*4;sr+=d[p];sg+=d[p+1];sb+=d[p+2];sx+=x;sy+=y;minx=Math.min(minx,x);miny=Math.min(miny,y);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);n++;}if(!n)return null;return{area:n,rgb:[Math.round(sr/n),Math.round(sg/n),Math.round(sb/n)],cx:sx/n,cy:sy/n,bbox:[minx,miny,maxx,maxy]};}
  function v3Manualize(r){if(!r)return null;if(!r.manualPixels?.length)r.manualPixels=v3GetRegionPixels(r);r.manual=true;if(r.origin==='auto')r.origin='edited';return r;}
  function v3RefreshRegionStats(r,preserveSelection=true){const stats=v3StatsFromPixels(r.manualPixels||[]);if(!stats)return false;const old=r.selected;Object.assign(r,stats);r.candidates=bestMatches(r.rgb,5);if(!preserveSelection||!getPalette(old))r.selected=r.candidates[0]?.p.code||'';rememberSelection(r);return true;}
  function v3PushEditHistory(){v3EnsureUIDs();v3EditHistory.push(regions.map(v3SerializeRegion));if(v3EditHistory.length>20)v3EditHistory.shift();if(els.undoEdit)els.undoEdit.disabled=false;}
  function v3RestoreRegionListSnapshot(snap){let nid=1;regions=(snap||[]).map(s=>{const r={...s,id:nid++,candidates:bestMatches(s.rgb,5)};r.selected=v3SelectionForPalette(r,PALETTE);return r;});v3MultiSelected.clear();selectedRegion=regions[0]?.id||null;renderAll();}
  function v3UndoEdit(){const s=v3EditHistory.pop();if(s)v3RestoreRegionListSnapshot(s);if(els.undoEdit)els.undoEdit.disabled=!v3EditHistory.length;}
  function v3SetMode(mode){v3EditMode=mode;addMode=mode==='add';for(const [el,m] of [[els.selectMode,'select'],[els.addBtn,'add'],[els.brushMode,'brush'],[els.eraseMode,'erase'],[els.splitMode,'split']])el?.classList.toggle('active',mode===m);if(els.toolStatus){const names={select:'选择区域',add:'补充区域：点击漏检位置',brush:'画笔＋：给当前区域补边',erase:'橡皮：从当前区域擦除',split:'画线拆分：在当前区域画切割线'};els.toolStatus.textContent=`当前模式：${names[mode]||mode}`;els.toolStatus.classList.toggle('add',mode!=='select');}renderDisplay();}
  updateToolUI=function(){for(const [el,m] of [[els.selectMode,'select'],[els.addBtn,'add'],[els.brushMode,'brush'],[els.eraseMode,'erase'],[els.splitMode,'split']])el?.classList.toggle('active',v3EditMode===m);if(els.toolStatus){const names={select:'选择区域',add:'补充区域：点击漏检位置',brush:'画笔＋：给当前区域补边',erase:'橡皮：从当前区域擦除',split:'画线拆分：在当前区域画切割线'};els.toolStatus.textContent=`当前模式：${names[v3EditMode]||v3EditMode}`;els.toolStatus.classList.toggle('add',v3EditMode!=='select');}if(els.undoAdd)els.undoAdd.disabled=manualHistory.length===0;if(els.clearAdded)els.clearAdded.disabled=!regions.some(r=>r.origin==='added');if(els.undoEdit)els.undoEdit.disabled=!v3EditHistory.length;};
  clearManualRegions=function(){regions=regions.filter(r=>r.origin!=='added');manualHistory=[];relabelRegions();selectedRegion=regions[0]?.id||null;renderAll();};
  function v3CanvasXY(e){const r=els.display.getBoundingClientRect();return{x:(e.clientX-r.left)*analysis.w/r.width,y:(e.clientY-r.top)*analysis.h/r.height};}
  function v3BrushPixels(cx,cy,rad){const out=[],w=analysis.w,h=analysis.h,r2=rad*rad;for(let y=Math.max(0,Math.floor(cy-rad));y<=Math.min(h-1,Math.ceil(cy+rad));y++)for(let x=Math.max(0,Math.floor(cx-rad));x<=Math.min(w-1,Math.ceil(cx+rad));x++){const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy<=r2)out.push(y*w+x);}return out;}
  function v3ApplyBrush(e,remove=false){const r=regions.find(x=>x.id===selectedRegion);if(!r)return;v3Manualize(r);if(!r._pixelSet)r._pixelSet=new Set(r.manualPixels);const {x,y}=v3CanvasXY(e),rad=+els.brushSize.value||7;for(const i of v3BrushPixels(x,y,rad)){if(remove)r._pixelSet.delete(i);else r._pixelSet.add(i);}r.manualPixels=[...r._pixelSet];v3RefreshRegionStats(r,true);v3BrushTouched=true;renderDisplay();upsertInspector();}
  function v3ConnectedComponents(pixels){if(!pixels.length)return[];const set=new Set(pixels),seen=new Set(),w=analysis.w,out=[];for(const start of pixels){if(seen.has(start))continue;const q=[start],comp=[];seen.add(start);for(let h=0;h<q.length;h++){const i=q[h],y=Math.floor(i/w),x=i-y*w;comp.push(i);for(const n of [i-1,i+1,i-w,i+w,i-w-1,i-w+1,i+w-1,i+w+1]){if(!set.has(n)||seen.has(n))continue;const ny=Math.floor(n/w),nx=n-ny*w;if(Math.abs(nx-x)>1||Math.abs(ny-y)>1)continue;seen.add(n);q.push(n);}}out.push(comp);}return out.sort((a,b)=>b.length-a.length);}
  function v3SplitSelectedRegion(){const r=regions.find(x=>x.id===selectedRegion);if(!r?.manualPixels?.length)return;const comps=v3ConnectedComponents(r.manualPixels).filter(c=>c.length>=6);if(comps.length<2){v3RefreshRegionStats(r,true);renderAll();return;}const baseCode=r.selected,baseGroup=r.linkGroup,idx=regions.indexOf(r);regions.splice(idx,1);for(let i=0;i<comps.length;i++){const st=v3StatsFromPixels(comps[i]);if(!st)continue;const nr={...r,id:nextId(),uid:v3Id('r'),label:r.label,name:`${r.name} ${i+1}`,manualPixels:comps[i],manual:true,origin:'split',_pixelSet:null,area:st.area,rgb:st.rgb,cx:st.cx,cy:st.cy,bbox:st.bbox,candidates:bestMatches(st.rgb,5),selected:baseCode,linkGroup:baseGroup};regions.push(nr);}relabelRegions();selectedRegion=regions[regions.length-comps.length]?.id||regions[0]?.id;renderAll();}
  function v3MergeSelected(){const selected=regions.filter(r=>v3MultiSelected.has(r.uid));if(selected.length<2)return alert('请先勾选至少两个区域。');v3PushEditHistory();const pix=new Set();for(const r of selected)for(const i of v3GetRegionPixels(r))pix.add(i);const st=v3StatsFromPixels([...pix]);if(!st)return;const base=selected.slice().sort((a,b)=>(b.area||0)-(a.area||0))[0],anyMain=selected.some(r=>r.type==='main');regions=regions.filter(r=>!v3MultiSelected.has(r.uid));const nr={...base,id:nextId(),uid:v3Id('r'),type:anyMain?'main':'detail',name:selected.map(r=>r.name).join(' + '),manualPixels:[...pix],manual:true,origin:'merged',area:st.area,rgb:st.rgb,cx:st.cx,cy:st.cy,bbox:st.bbox,candidates:bestMatches(st.rgb,5),_pixelSet:null};regions.push(nr);v3MultiSelected.clear();relabelRegions();selectedRegion=nr.id;renderAll();}

  // ---- Link/repeat groups ----
  function v3SetSelection(r,code,propagate=true){if(!r||!getPalette(code))return;r.selected=code;rememberSelection(r);if(propagate&&r.linkGroup){for(const o of regions){if(o!==r&&o.linkGroup===r.linkGroup&&getPalette(code)){o.selected=code;rememberSelection(o);}}}limitProposal=null;v3ScheduleAutosave();}
  const v3BaseRememberSelection=rememberSelection;
  rememberSelection=function(r){v3BaseRememberSelection(r);if(r?.linkGroup){for(const o of regions){if(o!==r&&o.linkGroup===r.linkGroup&&getPalette(r.selected)){o.selected=r.selected;v3BaseRememberSelection(o);}}}v3ScheduleAutosave();};
  function v3LinkSelected(){const list=regions.filter(r=>v3MultiSelected.has(r.uid));if(list.length<2)return alert('请勾选至少两个区域。');const gid=`G${v3LinkSeq++}`;for(const r of list)r.linkGroup=gid;const code=list[0].selected;for(const r of list){if(getPalette(code)){r.selected=code;rememberSelection(r);}}v3MultiSelected.clear();renderAll();}
  function v3UnlinkSelected(){const list=regions.filter(r=>v3MultiSelected.has(r.uid));for(const r of list)r.linkGroup='';v3MultiSelected.clear();renderAll();}
  function v3SimilarPairs(){const rs=regions.filter(r=>!r.ignore),pairs=[];for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i],b=rs[j],ar=Math.min(a.area,b.area)/Math.max(a.area,b.area),aa=(a.bbox[2]-a.bbox[0]+1)/(a.bbox[3]-a.bbox[1]+1),ab=(b.bbox[2]-b.bbox[0]+1)/(b.bbox[3]-b.bbox[1]+1),shape=Math.min(aa,ab)/Math.max(aa,ab),de=deltaE00(rgbToLab(a.rgb),rgbToLab(b.rgb));const score=ar*shape*Math.max(0,1-de/10);if(ar>.7&&shape>.72&&de<6)pairs.push({a,b,score,de});}return pairs.sort((x,y)=>y.score-x.score).slice(0,8);}
  function v3RenderSimilar(){const ps=v3SimilarPairs();if(!els.similarBox)return;els.similarBox.classList.remove('hidden');els.similarBox.innerHTML=`<h4>疑似重复 / 对称部件</h4>${ps.length?ps.map((p,i)=>`<div class="similar-item"><span>${p.a.label} ${v3Escape(p.a.name)} ↔ ${p.b.label} ${v3Escape(p.b.name)} · ΔE ${p.de.toFixed(1)}</span><button class="button small" data-sim="${i}">建立联动</button></div>`).join(''):'<div class="tool-hint">没有发现高置信度的重复部件。</div>'}`;els.similarBox.querySelectorAll('[data-sim]').forEach(b=>b.addEventListener('click',()=>{const p=ps[+b.dataset.sim],gid=`G${v3LinkSeq++}`;p.a.linkGroup=p.b.linkGroup=gid;p.b.selected=p.a.selected;rememberSelection(p.b);renderAll();v3RenderSimilar();}));}

  // Pointer editing
  els.display.addEventListener('pointerdown',e=>{if(!analysis||!['brush','erase','split'].includes(v3EditMode))return;const r=regions.find(x=>x.id===selectedRegion);if(!r)return alert('请先选择一个区域。');e.preventDefault();els.display.setPointerCapture?.(e.pointerId);v3PushEditHistory();v3PointerEditing=true;v3BrushTouched=false;v3ApplyBrush(e,v3EditMode!=='brush');});
  els.display.addEventListener('pointermove',e=>{if(v3PointerEditing&&['brush','erase','split'].includes(v3EditMode))v3ApplyBrush(e,v3EditMode!=='brush');});
  els.display.addEventListener('pointerup',e=>{if(!v3PointerEditing)return;v3PointerEditing=false;const r=regions.find(x=>x.id===selectedRegion);if(r){r._pixelSet=null;if(v3EditMode==='split')v3SplitSelectedRegion();else{v3RefreshRegionStats(r,true);renderAll();}}});

  // ---- Multi-page aggregate BOM ----
  function v3SnapshotRegionRows(page){if(page.id===v3CurrentPageId)return regions.map(r=>({...r,pageId:page.id,pageName:page.name,selected:v3SelectionForPalette(r,PALETTE)}));const arr=page.snapshot?.regions||[];return arr.map(r=>({...r,pageId:page.id,pageName:page.name,selected:v3SelectionForPalette(r,PALETTE)}));}
  function v3AllProjectRegions(){const pages=v3Pages.length?v3Pages:[{id:'current',name:sourceName,snapshot:null}];return pages.flatMap(v3SnapshotRegionRows).filter(r=>!r.ignore&&r.selected&&PALETTE.entries.some(p=>p.code===r.selected));}
  buildBOM=function(){const rows=v3AllProjectRegions(),total=rows.reduce((s,r)=>s+(r.area||0),0),map=new Map();for(const r of rows){const p=PALETTE.entries.find(x=>x.code===r.selected);if(!p)continue;let g=map.get(p.code);if(!g){g={p,area:0,regions:[]};map.set(p.code,g);}g.area+=r.area||0;g.regions.push(r);}return{rows:[...map.values()].sort((a,b)=>b.area-a.area),total};};
  function updateUsageInputs(){if(els.totalGrams)els.totalGrams.value=v3Usage.totalGrams;if(els.spoolGrams)els.spoolGrams.value=v3Usage.spoolGrams;if(els.defaultPrice)els.defaultPrice.value=v3Usage.defaultPrice;if(els.costTolerance)els.costTolerance.value=v3Usage.costTolerance;}
  renderBOM=function(){if(!els.bomBody)return;const bom=buildBOM();if(!bom.rows.length){els.bomBody.innerHTML='<tr><td colspan="12" class="muted">暂无结果</td></tr>';els.bomSummary.innerHTML='暂无 BOM';return;}let totalCost=0,totalNeed=0;const html=bom.rows.map(g=>{const pct=bom.total?g.area/bom.total:0,grams=pct*v3Usage.totalGrams,balls=Math.max(1,Math.ceil(grams/Math.max(1,v3Usage.spoolGrams))),m=v3GetPurchaseMeta(g.p.code),stock=Math.max(0,+m.stock||0),need=Math.max(0,balls-stock),price=m.price===''?v3Usage.defaultPrice:+m.price||0,subtotal=need*price;totalCost+=subtotal;totalNeed+=need;return `<tr data-bom-code="${v3Escape(g.p.code)}"><td><strong>${v3Escape(paletteLabel(g.p))}</strong></td><td><span class="table-swatch" style="background:${g.p.hex}"></span>${g.p.hex}</td><td>${g.regions.map(r=>`${v3Escape(r.pageName)} / ${r.label} ${v3Escape(r.name)}`).join('<br>')}</td><td>${(pct*100).toFixed(1)}%</td><td>${grams.toFixed(1)} g</td><td>${balls}</td><td><input class="bom-edit" data-field="stock" type="number" min="0" value="${stock}"></td><td>${need}</td><td><input class="bom-edit" data-field="price" type="number" min="0" step="0.01" value="${m.price}"></td><td>${subtotal.toFixed(2)}</td><td><input data-field="purchased" type="checkbox" ${m.purchased?'checked':''}></td><td><input class="bom-edit bom-note" data-field="note" value="${v3Escape(m.note||'')}"></td></tr>`;}).join('');els.bomBody.innerHTML=html;els.bomSummary.innerHTML=`<div class="bom-stat">项目页面<strong>${v3Pages.length||1}</strong></div><div class="bom-stat">使用颜色<strong>${bom.rows.length}</strong></div><div class="bom-stat">估算总用量<strong>${v3Usage.totalGrams} g</strong></div><div class="bom-stat">预计需购<strong>${totalNeed} 团</strong></div><div class="bom-stat">预计金额<strong>${totalCost.toFixed(2)}</strong></div>`;els.bomBody.querySelectorAll('input[data-field]').forEach(inp=>inp.addEventListener('change',()=>{const tr=inp.closest('tr'),m=v3GetPurchaseMeta(tr.dataset.bomCode),f=inp.dataset.field;m[f]=f==='purchased'?inp.checked:(f==='stock'?Math.max(0,+inp.value||0):f==='price'?(inp.value===''?'':Math.max(0,+inp.value||0)):inp.value);v3ScheduleAutosave();renderBOM();}));};
  downloadBOM=function(){const bom=buildBOM(),lines=[['色卡','色号','HEX','页面/区域','面积占比','估算克重g','估算团数','库存','需购','单价','小计','已购','备注']];for(const g of bom.rows){const pct=bom.total?g.area/bom.total:0,grams=pct*v3Usage.totalGrams,balls=Math.max(1,Math.ceil(grams/Math.max(1,v3Usage.spoolGrams))),m=v3GetPurchaseMeta(g.p.code),stock=Math.max(0,+m.stock||0),need=Math.max(0,balls-stock),price=m.price===''?v3Usage.defaultPrice:+m.price||0;lines.push([PALETTE.name,paletteLabel(g.p),g.p.hex,g.regions.map(r=>`${r.pageName}/${r.label} ${r.name}`).join(' / '),(pct*100).toFixed(2)+'%',grams.toFixed(1),balls,stock,need,price,(need*price).toFixed(2),m.purchased?'是':'否',m.note||'']);}const csv='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');v3DownloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`${(els.projectName?.value||'project')}-${PALETTE.id}-purchase.csv`);};

  // ---- Cost optimization ----
  function v3WeightedGroupRGB(regs){let sr=0,sg=0,sb=0,w=0;for(const r of regs){const wt=Math.max(1,r.area||1);sr+=r.rgb[0]*wt;sg+=r.rgb[1]*wt;sb+=r.rgb[2]*wt;w+=wt;}return w?[sr/w,sg/w,sb/w]:[0,0,0];}
  function v3GenerateCostProposal(){const bom=buildBOM();if(!bom.rows.length)return;const tol=Math.max(0,+els.costTolerance.value||0);let before=0,after=0,changes=[];for(const g of bom.rows){const pct=bom.total?g.area/bom.total:0,balls=Math.max(1,Math.ceil(pct*v3Usage.totalGrams/Math.max(1,v3Usage.spoolGrams))),curMeta=v3GetPurchaseMeta(g.p.code),curPrice=curMeta.price===''?v3Usage.defaultPrice:+curMeta.price||0,curCost=Math.max(0,balls-(+curMeta.stock||0))*curPrice,avg=v3WeightedGroupRGB(g.regions),curErr=deltaE00(rgbToLab(avg),g.p.lab||(g.p.lab=rgbToLab(g.p.rgb)));before+=curCost;let best={p:g.p,cost:curCost,err:curErr};for(const cand of v3BestMatches(avg,PALETTE,12)){if(cand.de>curErr+tol)continue;const m=v3GetPurchaseMeta(cand.p.code),price=m.price===''?v3Usage.defaultPrice:+m.price||0,cost=Math.max(0,balls-(+m.stock||0))*price;if(cost<best.cost-.001||(Math.abs(cost-best.cost)<.001&&cand.de<best.err))best={p:cand.p,cost,err:cand.de};}after+=best.cost;if(best.p.code!==g.p.code)changes.push({from:g.p.code,to:best.p.code,regions:g.regions,costBefore:curCost,costAfter:best.cost,errBefore:curErr,errAfter:best.err});}v3CostProposal={before,after,changes};v3RenderCostProposal();}
  function v3RenderCostProposal(){if(!els.costSummary)return;if(!v3CostProposal){els.costSummary.textContent='填写库存 / 单价后，可在可接受色差范围内寻找更省的替代色。';els.costApply.disabled=true;return;}els.costApply.disabled=!v3CostProposal.changes.length;els.costSummary.innerHTML=`当前估算 ${v3CostProposal.before.toFixed(2)} → 优化后 ${v3CostProposal.after.toFixed(2)}，预计节省 <strong>${Math.max(0,v3CostProposal.before-v3CostProposal.after).toFixed(2)}</strong>。${v3CostProposal.changes.length?'<br>'+v3CostProposal.changes.map(c=>`${c.from} → ${c.to}（${c.regions.length} 区域，ΔE ${c.errBefore.toFixed(1)} → ${c.errAfter.toFixed(1)}）`).join('；'):' 当前没有更省且满足色差容差的替代。'}`;}
  function v3ApplyCostProposal(){if(!v3CostProposal)return;for(const ch of v3CostProposal.changes){for(const ref of ch.regions)v3ApplyCodeToRef(ref,ch.to);}v3CostProposal=null;renderAll();v3SaveCurrentPageState();}
  function v3ApplyCodeToRef(ref,code){if(ref.pageId===v3CurrentPageId){const r=regions.find(x=>x.uid===ref.uid)||regions.find(x=>x.label===ref.label);if(r)v3SetSelection(r,code,false);}else{const p=v3Pages.find(x=>x.id===ref.pageId),r=p?.snapshot?.regions?.find(x=>x.uid===ref.uid)||p?.snapshot?.regions?.find(x=>x.label===ref.label);if(r){r.paletteSelections=r.paletteSelections||{};r.paletteSelections[PALETTE.id]=code;r.selected=code;}}}

  // ---- Cross-palette comparison ----
  function v3RenderCompare(){if(!els.compareHead||!els.compareBody)return;const pals=Object.values(PALETTES),rows=activeRegions();els.compareHead.innerHTML=`<tr><th>区域</th><th>原色</th>${pals.map(p=>`<th>${v3Escape(p.name)}</th>`).join('')}</tr>`;if(!rows.length){els.compareBody.innerHTML=`<tr><td colspan="${pals.length+2}" class="muted">暂无结果</td></tr>`;return;}els.compareBody.innerHTML=rows.map(r=>`<tr><td>${r.label} ${v3Escape(r.name)}</td><td><span class="table-swatch" style="background:${hex(r.rgb)}"></span>${hex(r.rgb)}</td>${pals.map(p=>{const ms=v3BestMatches(r.rgb,p,2),c=v3Confidence(r.rgb,p),m=ms[0];return `<td><strong>${m?v3Escape(paletteLabel(m.p)):'—'}</strong><br><span class="meta">ΔE ${m?m.de.toFixed(2):'—'} · <span class="conf-badge conf-${c.cls}">${v3Escape(c.label)}</span></span></td>`;}).join('')}</tr>`).join('');}

  // ---- Schemes A/B ----
  function v3CaptureScheme(name){v3SaveCurrentPageState();const assignments={};for(const p of v3Pages){const rs=p.id===v3CurrentPageId?regions:(p.snapshot?.regions||[]);assignments[p.id]={};for(const r of rs)assignments[p.id][v3RegionKey(r)]=v3SelectionForPalette(r,PALETTE);}return{name:name||'方案',paletteId:PALETTE.id,assignments,createdAt:Date.now()};}
  function v3SchemeCode(scheme,r){return scheme?.assignments?.[v3CurrentPageId]?.[v3RegionKey(r)]||r.selected;}
  function v3DrawScheme(canvas,scheme){if(!sourceImage||!analysis||!canvas){return;}if(!scheme){canvas.width=1;canvas.height=1;return;}const pal=v3GetPalette(scheme.paletteId)||PALETTE,low=document.createElement('canvas');low.width=analysis.w;low.height=analysis.h;const ct=low.getContext('2d');ct.drawImage(analysis.canvas,0,0);const im=ct.getImageData(0,0,analysis.w,analysis.h),data=im.data,rootColors=new Map();for(const r of regions.filter(x=>!x.ignore)){const code=v3SchemeCode(scheme,r),p=pal.entries.find(x=>x.code===code);if(!p)continue;if(!r.manual)rootColors.set(r.root,p.rgb);else for(const i of r.manualPixels||[]){const q=i*4;data[q]=p.rgb[0];data[q+1]=p.rgb[1];data[q+2]=p.rgb[2];}}if(analysis.rootById){for(let i=0;i<analysis.labels.length;i++){const l=analysis.labels[i];if(l<0)continue;const rgb=rootColors.get(analysis.rootById[l]);if(!rgb)continue;const q=i*4;data[q]=rgb[0];data[q+1]=rgb[1];data[q+2]=rgb[2];}}ct.putImageData(im,0,0);const iw=sourceImage.naturalWidth||sourceImage.width,ih=sourceImage.naturalHeight||sourceImage.height,s=Math.min(1,1200/Math.max(iw,ih));canvas.width=Math.round(iw*s);canvas.height=Math.round(ih*s);canvas.getContext('2d').drawImage(low,0,0,canvas.width,canvas.height);}
  function v3RenderSchemes(){if(!els.schemeSummary)return;els.schemeATitle.textContent=v3Schemes.A?.name||'方案 A';els.schemeBTitle.textContent=v3Schemes.B?.name||'方案 B';v3DrawScheme(els.schemeCanvasA,v3Schemes.A);v3DrawScheme(els.schemeCanvasB,v3Schemes.B);if(v3Schemes.A&&v3Schemes.B){const a=v3Schemes.A.assignments?.[v3CurrentPageId]||{},b=v3Schemes.B.assignments?.[v3CurrentPageId]||{},keys=new Set([...Object.keys(a),...Object.keys(b)]),diff=[...keys].filter(k=>a[k]!==b[k]).length;els.schemeSummary.innerHTML=`当前页面有 <strong>${diff}</strong> 个区域的色号不同。A 使用 ${v3Escape(v3GetPalette(v3Schemes.A.paletteId)?.name||v3Schemes.A.paletteId)}；B 使用 ${v3Escape(v3GetPalette(v3Schemes.B.paletteId)?.name||v3Schemes.B.paletteId)}。`;}else els.schemeSummary.textContent='保存两套配色后，可以并排比较当前页面并一键切换。';}
  async function v3ApplyScheme(s){if(!s)return;if(PALETTES[s.paletteId]&&PALETTE.id!==s.paletteId)setPalette(s.paletteId);for(const p of v3Pages){const amap=s.assignments?.[p.id]||{};if(p.id===v3CurrentPageId){for(const r of regions){const c=amap[v3RegionKey(r)];if(c&&getPalette(c))v3SetSelection(r,c,false);}}else for(const r of p.snapshot?.regions||[]){const c=amap[v3RegionKey(r)];if(c){r.paletteSelections=r.paletteSelections||{};r.paletteSelections[PALETTE.id]=c;r.selected=c;}}}renderAll();v3ScheduleAutosave();}

  // ---- Printable manufacturing sheet ----
  function v3Print(){v3SaveCurrentPageState();const bom=buildBOM(),name=els.projectName?.value||'毛绒娃娃项目';els.printSheet.innerHTML=`<h1>${v3Escape(name)} · 制作配色单</h1><p>色卡：${v3Escape(PALETTE.name)} · 页面：${v3Pages.length||1} · 生成时间：${new Date().toLocaleString()}</p><h2>页面</h2><ul>${(v3Pages.length?v3Pages:[{name:sourceName,snapshot:{regions:regions}}]).map(p=>`<li>${v3Escape(p.name)}：${p.id===v3CurrentPageId?regions.length:(p.snapshot?.regions?.length||0)} 个区域</li>`).join('')}</ul><h2>BOM / 采购</h2><table><thead><tr><th>色号</th><th>颜色</th><th>占比</th><th>估算克重</th><th>团数</th><th>库存</th><th>需购</th><th>备注</th></tr></thead><tbody>${bom.rows.map(g=>{const pct=bom.total?g.area/bom.total:0,grams=pct*v3Usage.totalGrams,balls=Math.max(1,Math.ceil(grams/Math.max(1,v3Usage.spoolGrams))),m=v3GetPurchaseMeta(g.p.code),stock=+m.stock||0;return `<tr><td>${v3Escape(paletteLabel(g.p))}</td><td><span class="print-swatch" style="background:${g.p.hex}"></span>${g.p.hex}</td><td>${(pct*100).toFixed(1)}%</td><td>${grams.toFixed(1)}g</td><td>${balls}</td><td>${stock}</td><td>${Math.max(0,balls-stock)}</td><td>${v3Escape(m.note||'')}</td></tr>`;}).join('')}</tbody></table><h2>当前页面区域</h2><table><thead><tr><th>#</th><th>区域</th><th>原色</th><th>色号</th><th>可信度</th></tr></thead><tbody>${activeRegions().map(r=>{const p=getPalette(r.selected),c=v3Confidence(r.rgb);return `<tr><td>${r.label}</td><td>${v3Escape(r.name)}</td><td>${hex(r.rgb)}</td><td>${v3Escape(paletteLabel(p))}</td><td>${v3Escape(c.label)} / ΔE ${c.d1.toFixed(2)}</td></tr>`;}).join('')}</tbody></table>`;window.print();}

  // ---- Render wrappers ----
  const v3BaseRenderAll=renderAll;
  renderAll=function(){v3EnsureUIDs();v3BaseRenderAll();v3EnhanceRegionCards();v3EnhanceResultTable();v3RenderPages();v3RenderCompare();v3RenderSchemes();v3ScheduleAutosave();};
  const v3BaseRenderDisplay=renderDisplay;
  renderDisplay=function(){v3BaseRenderDisplay();if(!analysis||!['brush','erase','split'].includes(v3EditMode))return;const r=regions.find(x=>x.id===selectedRegion);if(!r)return;const pix=v3GetRegionPixels(r),ct=els.display.getContext('2d'),w=analysis.w;ct.fillStyle='rgba(124,58,237,.22)';for(const i of pix){const y=Math.floor(i/w),x=i-y*w;ct.fillRect(x,y,1,1);} };
  function v3EnhanceRegionCards(){els.regionList?.querySelectorAll('.region-card').forEach(card=>{const id=+card.dataset.id,r=regions.find(x=>x.id===id);if(!r)return;if(!card.querySelector('.multi-check')){const ck=document.createElement('input');ck.type='checkbox';ck.className='multi-check';ck.checked=v3MultiSelected.has(r.uid);ck.title='多选区域';ck.addEventListener('click',e=>{e.stopPropagation();ck.checked?v3MultiSelected.add(r.uid):v3MultiSelected.delete(r.uid);});card.appendChild(ck);}if(!card.querySelector('.confidence-row')){const c=v3Confidence(r.rgb),row=document.createElement('div');row.className='confidence-row';row.innerHTML=`<span class="conf-badge conf-${c.cls}">${v3Escape(c.label)}</span><span>ΔE ${c.d1.toFixed(2)} · Top2 间距 ${c.gap.toFixed(2)}</span>${r.linkGroup?`<span class="link-badge">联动 ${v3Escape(r.linkGroup)}</span>`:''}`;card.appendChild(row);}});}
  function v3EnhanceResultTable(){const rows=activeRegions(),trs=[...(els.tableBody?.querySelectorAll('tr')||[])];if(!rows.length)return;trs.forEach((tr,i)=>{if(tr.children.length>=7)return;const r=rows[i],c=v3Confidence(r.rgb),td=document.createElement('td');td.innerHTML=`<span class="conf-badge conf-${c.cls}">${v3Escape(c.label)}</span>`;tr.appendChild(td);});}

  // ---- Autosave + project-aware render hooking ----
  const v3BaseSetPalette=setPalette;
  setPalette=function(id){v3BaseSetPalette(id);v3RefreshPaletteSelect();v3RenderPaletteManager();v3RenderCompare();v3RenderSchemes();v3ScheduleAutosave();};

  // ---- UI events ----
  els.selectMode?.addEventListener('click',()=>v3SetMode('select'));
  els.addBtn?.addEventListener('click',()=>v3SetMode(v3EditMode==='add'?'select':'add'));
  els.brushMode?.addEventListener('click',()=>v3SetMode(v3EditMode==='brush'?'select':'brush'));
  els.eraseMode?.addEventListener('click',()=>v3SetMode(v3EditMode==='erase'?'select':'erase'));
  els.splitMode?.addEventListener('click',()=>v3SetMode(v3EditMode==='split'?'select':'split'));
  els.brushSize?.addEventListener('input',()=>{els.brushSizeValue.textContent=els.brushSize.value;});
  els.mergeSelected?.addEventListener('click',v3MergeSelected);els.linkSelected?.addEventListener('click',v3LinkSelected);els.unlinkSelected?.addEventListener('click',v3UnlinkSelected);els.similarParts?.addEventListener('click',v3RenderSimilar);els.undoEdit?.addEventListener('click',v3UndoEdit);
  els.addPages?.addEventListener('change',e=>{if(e.target.files?.length)v3AddFiles(e.target.files);e.target.value='';});
  els.projectName?.addEventListener('input',v3ScheduleAutosave);els.saveProject?.addEventListener('click',v3DownloadProject);els.openProject?.addEventListener('change',e=>{if(e.target.files[0])v3OpenProjectFile(e.target.files[0]);e.target.value='';});
  els.restoreAutosave?.addEventListener('click',async()=>{const o=await v3LoadAutosave();if(o)v3ImportProjectObject(o);});els.printSheetBtn?.addEventListener('click',v3Print);
  els.paletteManagerBtn?.addEventListener('click',()=>{v3RenderPaletteManager();els.paletteManagerModal.classList.remove('hidden');});els.closePaletteManager?.addEventListener('click',()=>els.paletteManagerModal.classList.add('hidden'));els.paletteManagerModal?.addEventListener('click',e=>{if(e.target===els.paletteManagerModal)els.paletteManagerModal.classList.add('hidden');});els.buildCustomPalette?.addEventListener('click',v3BuildCustomPalette);els.paletteJson?.addEventListener('change',e=>{if(e.target.files[0])v3ImportPaletteJSON(e.target.files[0]);e.target.value='';});
  for(const el of [els.totalGrams,els.spoolGrams,els.defaultPrice,els.costTolerance])el?.addEventListener('change',()=>{v3Usage.totalGrams=Math.max(1,+els.totalGrams.value||120);v3Usage.spoolGrams=Math.max(1,+els.spoolGrams.value||50);v3Usage.defaultPrice=Math.max(0,+els.defaultPrice.value||0);v3Usage.costTolerance=Math.max(0,+els.costTolerance.value||0);v3CostProposal=null;renderBOM();v3RenderCostProposal();v3ScheduleAutosave();});els.costOptimize?.addEventListener('click',v3GenerateCostProposal);els.costApply?.addEventListener('click',v3ApplyCostProposal);
  els.saveSchemeA?.addEventListener('click',()=>{v3Schemes.A=v3CaptureScheme(els.schemeAName.value||'方案 A');v3RenderSchemes();v3ScheduleAutosave();});els.saveSchemeB?.addEventListener('click',()=>{v3Schemes.B=v3CaptureScheme(els.schemeBName.value||'方案 B');v3RenderSchemes();v3ScheduleAutosave();});els.applySchemeA?.addEventListener('click',()=>v3ApplyScheme(v3Schemes.A));els.applySchemeB?.addEventListener('click',()=>v3ApplyScheme(v3Schemes.B));els.schemeAName?.addEventListener('change',()=>{if(v3Schemes.A)v3Schemes.A.name=els.schemeAName.value;v3RenderSchemes();v3ScheduleAutosave();});els.schemeBName?.addEventListener('change',()=>{if(v3Schemes.B)v3Schemes.B.name=els.schemeBName.value;v3RenderSchemes();v3ScheduleAutosave();});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();v3InstallPrompt=e;els.installApp?.classList.remove('hidden');});els.installApp?.addEventListener('click',async()=>{if(!v3InstallPrompt)return;v3InstallPrompt.prompt();await v3InstallPrompt.userChoice;v3InstallPrompt=null;els.installApp.classList.add('hidden');});

  // Ensure candidate/palette manual picks honor linkage by observing render cycle through rememberSelection override.
  v3LoadCustomPalettes();v3RefreshPaletteSelect();v3RenderPaletteManager();updateUsageInputs();v3SetMode('select');v3LoadAutosave();
  // ===== end v3 extension =====


  els.file.addEventListener('change',e=>{if(e.target.files[0])readFile(e.target.files[0]);}); els.demo.addEventListener('click',loadDemo);
  ['dragenter','dragover'].forEach(ev=>els.drop.addEventListener(ev,e=>{e.preventDefault();els.drop.classList.add('drag');})); ['dragleave','drop'].forEach(ev=>els.drop.addEventListener(ev,e=>{e.preventDefault();els.drop.classList.remove('drag');})); els.drop.addEventListener('drop',e=>{const f=[...e.dataTransfer.files].find(x=>x.type.startsWith('image/'));if(f)readFile(f);});
  els.minArea.addEventListener('input',()=>els.minAreaValue.textContent=(+els.minArea.value).toFixed(2)+'%'); els.bgTol.addEventListener('input',()=>els.bgTolValue.textContent=els.bgTol.value); els.reanalyze.addEventListener('click',()=>{els.summary.textContent='正在识别…';setTimeout(analyze,30);});
  els.display.addEventListener('click',e=>{if(!analysis)return;if(typeof v3EditMode!=='undefined' && !['select','add'].includes(v3EditMode))return;const rct=els.display.getBoundingClientRect(),x=(e.clientX-rct.left)*analysis.w/rct.width,y=(e.clientY-rct.top)*analysis.h/rct.height;if(addMode){const ok=addManualRegionAt(x,y);if(ok){const card=els.regionList.querySelector(`[data-id="${selectedRegion}"]`);card?.scrollIntoView({behavior:'smooth',block:'nearest'});}return;}let best=null,d=Infinity;for(const r of regions){const dd=Math.hypot(r.cx-x,r.cy-y);if(dd<d){d=dd;best=r;}}if(best&&d<45){selectedRegion=best.id;renderAll();const card=els.regionList.querySelector(`[data-id="${best.id}"]`);card?.scrollIntoView({behavior:'smooth',block:'nearest'});}});
  $$('.tab').forEach(t=>t.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.remove('active'));$$('.tabpane').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#tab-'+t.dataset.tab).classList.add('active');if(t.dataset.tab==='preview')renderPreview();if(t.dataset.tab==='bom')renderBOM();if(t.dataset.tab==='limit')renderLimitUI();if(t.dataset.tab==='compare'&&typeof v3RenderCompare==='function')v3RenderCompare();if(t.dataset.tab==='schemes'&&typeof v3RenderSchemes==='function')v3RenderSchemes();if(t.dataset.tab==='annotated')renderAnnotated();if(t.dataset.tab==='linked')renderLinked();}));
  els.undoAdd?.addEventListener('click',undoManualRegion); els.clearAdded?.addEventListener('click',clearManualRegions); els.paletteSelect?.addEventListener('change',e=>setPalette(e.target.value));
  els.limitGenerate?.addEventListener('click',generateLimitProposal);els.limitApply?.addEventListener('click',applyLimitProposal);els.limitRestore?.addEventListener('click',restoreLimitOptimization);
  els.csv.addEventListener('click',downloadCSV);els.previewBtn.addEventListener('click',()=>downloadCanvas(els.preview,`${sourceName}-${PALETTE.id}-preview.png`));els.bomBtn.addEventListener('click',downloadBOM);els.annotatedBtn.addEventListener('click',()=>downloadCanvas(els.annotated,`${sourceName}-annotated.png`));els.linkedBtn.addEventListener('click',()=>downloadCanvas(els.linked,`${sourceName}-${PALETTE.id}-palette-linked.png`));
  els.closeModal.addEventListener('click',closePaletteModal);els.modal.addEventListener('click',e=>{if(e.target===els.modal)closePaletteModal();});els.paletteSearch.addEventListener('input',e=>buildPaletteGrid(e.target.value));

  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
})();
