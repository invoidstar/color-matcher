(() => {
  'use strict';
  const body=document.body, stage=document.getElementById('imageStage'),canvas=document.getElementById('displayCanvas');
  if(!stage||!canvas)return;
  const $=id=>document.getElementById(id);
  const zoomLabel=$('v4ZoomLabel'),panBtn=$('v4PanModeBtn');
  const zoomButtons=[$('v4ZoomOutBtn'),$('v4ZoomInBtn'),$('v4ZoomFitBtn')];
  function showPane(next,scroll=true){
    if(!['canvas','regions','results'].includes(next))return;
    body.dataset.v4Pane=next;
    document.querySelectorAll('.v4-mobile-nav [data-v4-pane]').forEach(btn=>
      btn.setAttribute('aria-pressed',String(btn.dataset.v4Pane===next)));
    if(scroll&&window.matchMedia('(max-width:780px)').matches){
      const target=document.getElementById('v4Workspace');
      if(target)window.scrollTo({top:Math.max(0,target.getBoundingClientRect().top+window.scrollY-67),behavior:'smooth'});
    }
  }
  document.querySelectorAll('.v4-mobile-nav [data-v4-pane]').forEach(btn=>btn.addEventListener('click',()=>showPane(btn.dataset.v4Pane)));
  $('v4GoRegionsBtn')?.addEventListener('click',()=>showPane('regions'));
  $('v4BackCanvasBtn')?.addEventListener('click',()=>showPane('canvas'));
  $('v4GoResultsBtn')?.addEventListener('click',()=>showPane('results'));

  // Visual transforms do not change the underlying image data or region IDs.
  let scale=1,tx=0,ty=0,pan=false;
  const pointers=new Map();let gesture=null;
  const clamp=(x,low,high)=>Math.max(low,Math.min(high,x));
  function renderView(){
    canvas.style.transform='translate('+tx+'px, '+ty+'px) scale('+scale+')';
    if(zoomLabel)zoomLabel.textContent=Math.round(scale*100)+'%';
  }
  function resetView(){scale=1;tx=0;ty=0;renderView();}
  function zoomBy(factor){
    scale=clamp(scale*factor,.5,5);
    if(scale===1){tx=0;ty=0;}
    renderView();
  }
  $('v4ZoomOutBtn')?.addEventListener('click',()=>zoomBy(1/1.25));
  $('v4ZoomInBtn')?.addEventListener('click',()=>zoomBy(1.25));
  $('v4ZoomFitBtn')?.addEventListener('click',resetView);
  function setPan(value){
    const entering=Boolean(value);
    if(entering)$('selectModeBtn')?.click();
    pan=entering;
    panBtn?.classList.toggle('active',pan);
    panBtn?.setAttribute('aria-pressed',String(pan));
    stage.classList.toggle('v4-pan-active',pan);
    pointers.clear();gesture=null;
  }
  panBtn?.addEventListener('click',()=>setPan(!pan));
  ['selectModeBtn','addRegionBtn','brushModeBtn','eraseModeBtn','splitModeBtn'].forEach(id=>
    $(id)?.addEventListener('click',()=>{if(pan)setPan(false);}));
  const two=()=>[...pointers.values()];
  const midpoint=()=>{const a=two();return{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};};
  const separation=()=>{const a=two();return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);};
  function down(e){
    if(!pan||!stage.contains(e.target))return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();e.stopPropagation();
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    stage.setPointerCapture?.(e.pointerId);
    if(pointers.size===1)gesture={type:'drag',x:e.clientX,y:e.clientY,tx,ty};
    if(pointers.size===2){const mid=midpoint();gesture={type:'pinch',distance:Math.max(1,separation()),scale,tx,ty,x:mid.x,y:mid.y};}
  }
  function move(e){
    if(!pan||!pointers.has(e.pointerId))return;
    e.preventDefault();e.stopPropagation();
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){
      const mid=midpoint();
      if(gesture?.type!=='pinch')gesture={type:'pinch',distance:Math.max(1,separation()),scale,tx,ty,x:mid.x,y:mid.y};
      scale=clamp(gesture.scale*separation()/gesture.distance,.5,5);
      tx=gesture.tx+mid.x-gesture.x;ty=gesture.ty+mid.y-gesture.y;
    }else if(gesture?.type==='drag'){
      tx=gesture.tx+e.clientX-gesture.x;ty=gesture.ty+e.clientY-gesture.y;
    }
    renderView();
  }
  function up(e){
    if(!pointers.has(e.pointerId))return;
    e.preventDefault();e.stopPropagation();
    pointers.delete(e.pointerId);
    try{stage.releasePointerCapture?.(e.pointerId);}catch(_){}
    if(pointers.size===1){const a=two()[0];gesture={type:'drag',x:a.x,y:a.y,tx,ty};}
    else if(!pointers.size)gesture=null;
  }
  // Capture before the legacy editor handlers, so panning never paints pixels.
  stage.addEventListener('pointerdown',down,true);
  stage.addEventListener('pointermove',move,true);
  stage.addEventListener('pointerup',up,true);
  stage.addEventListener('pointercancel',up,true);
  stage.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);},true);
  stage.addEventListener('click',e=>{if(pan){e.preventDefault();e.stopPropagation();}},true);
  function updateZoomAvailability(){
    const ready=!stage.classList.contains('hidden')&&canvas.width>1&&canvas.height>1;
    zoomButtons.forEach(btn=>{if(btn)btn.disabled=!ready;});
    if(!ready&&pan)setPan(false);
  }
  new MutationObserver(()=>{
    if(stage.classList.contains('hidden'))resetView();
    updateZoomAvailability();
  }).observe(stage,{attributes:true,attributeFilter:['class']});
  updateZoomAvailability();renderView();
  document.querySelectorAll('.v4-more-content button').forEach(btn=>
    btn.addEventListener('click',()=>btn.closest('details')?.removeAttribute('open')));
})();
