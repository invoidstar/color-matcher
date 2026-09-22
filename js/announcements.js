(() => {
  'use strict';
  const list=window.PCM_ANNOUNCEMENTS||[];
  if(!list.length)return;
  const ann=list[0];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key='pcm-announcement-seen:'+ann.id, dismissKey='pcm-announcement-dismissed:'+ann.id;

  const modal=document.createElement('div');
  modal.className='announcement-modal';modal.hidden=true;
  modal.innerHTML='<div class="announcement-card" role="dialog" aria-modal="true"><button class="announcement-close" aria-label="关闭">×</button><div class="ann-version">'+esc(ann.version)+' · '+esc(ann.date)+'</div><h2>'+esc(ann.title)+'</h2><p>'+esc(ann.summary)+'</p><ul>'+((ann.details||[]).map(x=>'<li>'+esc(x)+'</li>').join(''))+'</ul><div class="ann-footer"><button class="ann-ok">知道了</button>'+(ann.link?'<a class="primary" href="'+esc(ann.link)+'">'+esc(ann.linkText||'查看更新')+'</a>':'')+'</div></div>';
  document.body.appendChild(modal);

  function open(){modal.hidden=false;document.body.style.overflow='hidden';}
  function close(markSeen=true){modal.hidden=true;document.body.style.overflow='';if(markSeen)try{localStorage.setItem(key,'1');}catch(e){}}
  modal.querySelector('.announcement-close').addEventListener('click',()=>close());
  modal.querySelector('.ann-ok').addEventListener('click',()=>close());
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close();});
  document.querySelector('#announcementBtn')?.addEventListener('click',open);

  let dismissed=false,seen=false;
  try{dismissed=localStorage.getItem(dismissKey)==='1';seen=localStorage.getItem(key)==='1';}catch(e){}
  if(!dismissed){
    const wrap=document.createElement('div');wrap.className='announcement-banner';
    wrap.innerHTML='<div class="announcement-inner"><span class="announcement-tag">NEW '+esc(ann.version)+'</span><div class="announcement-copy"><strong>'+esc(ann.title)+'</strong>'+esc(ann.summary)+'</div><div class="announcement-actions"><button class="announcement-open">查看公告</button>'+(ann.link?'<a href="'+esc(ann.link)+'">'+esc(ann.linkText||'查看更新')+'</a>':'')+'<button class="announcement-dismiss" aria-label="关闭公告">×</button></div></div>';
    const header=document.querySelector('.topbar,.gallery-header');
    if(header)header.insertAdjacentElement('afterend',wrap);else document.body.prepend(wrap);
    wrap.querySelector('.announcement-open').addEventListener('click',open);
    wrap.querySelector('.announcement-dismiss').addEventListener('click',()=>{wrap.remove();try{localStorage.setItem(dismissKey,'1');}catch(e){}});
  }
  if(!seen)setTimeout(open,350);
})();
