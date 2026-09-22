(() => {
  'use strict';
  const C=window.PCMColor;
  if(!C) throw new Error('PCMColor is required');
  const {hex,rgbToLab,deltaE00,rgbToHsv}=C;

  const aliceLabel=p=>{
    if(!p.alias) return p.code;
    const q=p.quality;
    if(['verified','high','v','h'].includes(q)) return p.alias;
    if(['medium','m'].includes(q)) return p.alias+' ?';
    return p.code;
  };

  const palettes={
    'qqtq-480':{
      id:'qqtq-480',name:'樱花',
      note:'共 600 色：QQ001–QQ360 / TQ361–TQ600。原 001–480 保持不变，TQ481–TQ600 来自补充色卡。',
      entries:(window.PALETTE_RAW||[]).map((x,i)=>({code:x[0],rgb:x[1],alias:'',index:i}))
    },
    'hanter-620':{
      id:'hanter-620',name:'涵特',
      note:'HANTE 120D/2 高速绣花线色卡，001–720 已完整录入。',
      entries:(window.PALETTE_HANTER_RAW||[]).map((x,i)=>({code:x[0],rgb:x[1],alias:x[2]||'',page:x[3],row:x[4],col:x[5],index:i}))
    },
    'alice-1680':{
      id:'alice-1680',name:'亚丽丝',
      note:'共 1680 个提取色位。高置信厂家色号优先展示；无法可靠确认的位置使用 AL 内部编号。',
      entries:(window.PALETTE_ALICE_RAW||[]).map((x,i)=>({code:x[0],rgb:x[1],alias:x[2]||'',page:x[3],row:x[4],col:x[5],quality:x[6],index:i}))
    }
  };
  Object.values(palettes).forEach(p=>p.entries.forEach(e=>{e.hex=hex(e.rgb);e.lab=rgbToLab(e.rgb);e.hsv=rgbToHsv(e.rgb);e.paletteId=p.id;}));

  const $=s=>document.querySelector(s);
  const els={
    palette:$('#galleryPalette'),search:$('#gallerySearch'),sort:$('#gallerySort'),
    grid:$('#paletteGrid'),empty:$('#emptyPalette'),title:$('#galleryTitle'),
    count:$('#galleryCount'),shown:$('#galleryShown'),note:$('#galleryNote'),
    modal:$('#colorDetailModal'),close:$('#detailClose'),swatch:$('#detailSwatch'),
    detailPalette:$('#detailPalette'),detailTitle:$('#detailTitle'),alias:$('#detailAlias'),
    hex:$('#detailHex'),rgb:$('#detailRgb'),lab:$('#detailLab'),position:$('#detailPosition'),
    copyCode:$('#copyCodeBtn'),copyHex:$('#copyHexBtn'),nearby:$('#nearbyColors')
  };
  let current=palettes['qqtq-480'],selected=null;

  function displayLabel(e){
    if(e.paletteId==='alice-1680') return aliceLabel(e);
    return e.alias?e.code+' · '+e.alias:e.code;
  }
  function suffixNumber(code){
    const m=String(code).match(/(\d+)$/);return m?Number(m[1]):NaN;
  }
  function matchesSearch(e,q){
    q=q.trim();
    if(!q)return true;
    const range=q.match(/^\D*(\d+)\s*[-~—]\s*\D*(\d+)$/);
    if(range){
      const n=suffixNumber(e.code),a=+range[1],b=+range[2];
      return Number.isFinite(n)&&n>=Math.min(a,b)&&n<=Math.max(a,b);
    }
    const hay=(e.code+' '+(e.alias||'')+' '+displayLabel(e)).toUpperCase();
    return hay.includes(q.toUpperCase());
  }
  function sortedEntries(){
    const q=els.search.value;
    const a=current.entries.filter(e=>matchesSearch(e,q)).slice();
    const mode=els.sort.value;
    if(mode==='hue') a.sort((x,y)=>{
      const xs=x.hsv?.[1]??0,ys=y.hsv?.[1]??0;
      if(xs<.04&&ys>=.04)return 1;if(ys<.04&&xs>=.04)return-1;
      return (x.hsv?.[0]??0)-(y.hsv?.[0]??0)||(y.hsv?.[1]??0)-(x.hsv?.[1]??0);
    });
    else if(mode==='lightness') a.sort((x,y)=>x.lab[0]-y.lab[0]);
    else if(mode==='saturation') a.sort((x,y)=>(y.hsv?.[1]??0)-(x.hsv?.[1]??0));
    else a.sort((x,y)=>x.index-y.index);
    return a;
  }
  function render(){
    const list=sortedEntries();
    els.title.textContent=current.name;
    els.count.textContent=current.entries.length+' 色';
    els.shown.textContent='显示 '+list.length;
    els.note.textContent=current.note;
    els.grid.innerHTML='';
    els.empty.hidden=list.length!==0;
    const frag=document.createDocumentFragment();
    for(const e of list){
      const b=document.createElement('button');
      b.type='button';b.className='color-card';
      b.innerHTML='<div class="color-chip" style="background:'+e.hex+'"></div><div class="color-info"><strong>'+escapeHtml(displayLabel(e))+'</strong><span>'+e.hex+'</span></div>';
      b.addEventListener('click',()=>openDetail(e));
      frag.appendChild(b);
    }
    els.grid.appendChild(frag);
    const url=new URL(location.href);url.searchParams.set('palette',current.id);history.replaceState(null,'',url);
  }
  function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function positionText(e){
    if(e.paletteId==='qqtq-480')return '按色号顺序';
    const parts=[];
    if(e.page!=null)parts.push('页/段 '+e.page);
    if(e.row!=null)parts.push('行 '+e.row);
    if(e.col!=null)parts.push('列 '+e.col);
    return parts.join(' · ')||'—';
  }
  function openDetail(e){
    selected=e;
    els.swatch.style.background=e.hex;
    els.detailPalette.textContent=current.name+' · 色块详情';
    els.detailTitle.textContent=displayLabel(e);
    els.alias.textContent=e.alias&&displayLabel(e)!==e.alias?'厂家色号候选：'+e.alias:(e.alias?'厂家色号：'+e.alias:'');
    els.hex.textContent=e.hex;
    els.rgb.textContent=e.rgb.join(', ');
    els.lab.textContent=e.lab.map(x=>Number(x).toFixed(1)).join(', ');
    els.position.textContent=positionText(e);
    const near=current.entries.filter(x=>x!==e).map(x=>({e:x,d:deltaE00(e.lab,x.lab)})).sort((a,b)=>a.d-b.d).slice(0,6);
    els.nearby.innerHTML='';
    near.forEach(n=>{
      const b=document.createElement('button');b.type='button';b.className='nearby';
      b.innerHTML='<i style="background:'+n.e.hex+'"></i><span>'+escapeHtml(displayLabel(n.e))+'</span>';
      b.title='ΔE '+n.d.toFixed(2);
      b.addEventListener('click',()=>openDetail(n.e));
      els.nearby.appendChild(b);
    });
    els.modal.hidden=false;document.body.style.overflow='hidden';
  }
  function closeDetail(){els.modal.hidden=true;document.body.style.overflow='';}
  async function copy(v){try{await navigator.clipboard.writeText(v);}catch(e){const t=document.createElement('textarea');t.value=v;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();}}

  els.palette.addEventListener('change',()=>{current=palettes[els.palette.value]||current;render();});
  els.search.addEventListener('input',render);els.sort.addEventListener('change',render);
  els.close.addEventListener('click',closeDetail);els.modal.addEventListener('click',e=>{if(e.target===els.modal)closeDetail();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
  els.copyCode.addEventListener('click',()=>selected&&copy(displayLabel(selected).replace(/ \?$/,'')));
  els.copyHex.addEventListener('click',()=>selected&&copy(selected.hex));

  const initial=new URL(location.href).searchParams.get('palette');
  if(initial&&palettes[initial]){current=palettes[initial];els.palette.value=initial;}
  render();
})();
