(() => {
  'use strict';
  const apiBase = String(window.COLOR_MATCHER_GUESTBOOK_API || '').replace(/\/+$/, '');
  const $ = id => document.getElementById(id);
  const els = {
    form: $('guestbookForm'), nick: $('nickname'), cat: $('category'),
    content: $('content'), counter: $('contentCounter'), captcha: $('turnstileMount'),
    submit: $('submitBtn'), status: $('submitStatus'), notice: $('serviceNotice'),
    list: $('messageList'), empty: $('emptyMessages'), listStatus: $('listStatus'),
    reload: $('reloadBtn'), prev: $('prevPageBtn'), next: $('nextPageBtn'),
    pageStatus: $('pageStatus')
  };
  const names = {experience:'使用体验',bug:'问题反馈',feature:'功能建议',other:'其他'};
  let pageNumber = 1, hasMore = false, canPost = false, sending = false, widgetId = null;
  let turnstileToken = '';

  function element(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text != null) result.textContent = String(text);
    return result;
  }
  function dateLabel(ts) {
    return Number.isFinite(Number(ts)) ? new Date(Number(ts) * 1000).toLocaleString('zh-CN') : '—';
  }
  function refreshSubmit() {
    els.submit.disabled = !canPost || sending || !turnstileToken ||
      !els.nick.value.trim() || !els.content.value.trim();
  }
  function showNotice(text, live = false) {
    els.notice.textContent = text;
    els.notice.classList.toggle('live',live);
  }
  async function request(path, options) {
    const response = await fetch(apiBase + path, {
      mode: 'cors', cache: 'no-store', ...options,
      headers: {...(options && options.headers ? options.headers : {})}
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || '请求失败，请稍后重试');
    }
    return data;
  }
  function appendMessage(item, fragment) {
    const card = element('article','message-card');
    const header = element('div','message-head');
    const alias = (item.nickname || '访客').trim();
    header.appendChild(element('span','avatar',Array.from(alias)[0] || '访'));
    header.appendChild(element('strong','message-nickname',alias));
    header.appendChild(element('span','message-category',names[item.category] || '其他'));
    header.appendChild(element('time','message-date',dateLabel(item.created_at)));
    card.appendChild(header);
    card.appendChild(element('p','message-content',item.content));
    if (item.admin_reply) {
      const box = element('div','admin-reply');
      box.appendChild(element('strong','', '站长回复'));
      box.appendChild(element('p','',item.admin_reply));
      card.appendChild(box);
    }
    fragment.appendChild(card);
  }
  async function loadMessages() {
    els.reload.disabled = true;
    els.listStatus.textContent = '正在加载留言…';
    try {
      const result = await request('/api/messages?page=' + pageNumber + '&limit=10');
      const items = Array.isArray(result.items) ? result.items : [];
      const fragment = document.createDocumentFragment();
      items.forEach(item => appendMessage(item,fragment));
      els.list.replaceChildren(fragment);
      els.empty.hidden = items.length !== 0;
      hasMore = Boolean(result.hasMore);
      els.prev.disabled = pageNumber <= 1;
      els.next.disabled = !hasMore;
      els.pageStatus.textContent = '第 ' + pageNumber + ' 页';
      els.listStatus.textContent = '';
    } catch (error) {
      els.listStatus.textContent = error.message;
      els.list.replaceChildren();
      els.empty.hidden = true;
      hasMore = false;
      els.next.disabled = true;
    } finally { els.reload.disabled = false; }
  }
  function initTurnstile(siteKey) {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.addEventListener('load', () => {
      if (!window.turnstile) {
        els.status.textContent = '验证组件无法加载，请刷新后重试。';
        return;
      }
      try {
        widgetId = window.turnstile.render(els.captcha, {
          sitekey: siteKey,
          action: 'guestbook_post',
          callback: token => { turnstileToken = token; refreshSubmit(); },
          'expired-callback': () => { turnstileToken = ''; refreshSubmit(); },
          'error-callback': () => { turnstileToken = ''; refreshSubmit(); }
        });
      } catch {
        els.status.textContent = '无法初始化人机验证，请稍后重试。';
      }
    });
    script.addEventListener('error', () => {
      els.status.textContent = '无法访问人机验证服务。';
    });
    document.head.appendChild(script);
  }
  async function init() {
    if (!apiBase.startsWith('https://')) {
      showNotice('留言服务地址未配置，暂不可用。');
      return;
    }
    try {
      const result = await request('/api/config');
      if (!result.enabled || !result.siteKey) {
        showNotice('留言板仍在准备中，暂未开放。配色工作台可以正常使用。');
        return;
      }
      canPost = true;
      els.nick.disabled = false;
      els.cat.disabled = false;
      els.content.disabled = false;
      showNotice('留言板已开放 · 验证通过后即可立即发布',true);
      initTurnstile(result.siteKey);
      await loadMessages();
    } catch {
      showNotice('留言服务暂时不可用，请稍后再试。');
    }
  }
  els.content.addEventListener('input', () => {
    els.counter.textContent = Array.from(els.content.value).length + ' / 500';
    refreshSubmit();
  });
  els.nick.addEventListener('input',refreshSubmit);
  els.reload.addEventListener('click',loadMessages);
  els.prev.addEventListener('click', () => { if(pageNumber>1){pageNumber--;loadMessages();} });
  els.next.addEventListener('click', () => { if(hasMore){pageNumber++;loadMessages();} });
  els.form.addEventListener('submit', async event => {
    event.preventDefault();
    if(!canPost || sending || !turnstileToken)return;
    sending = true;
    refreshSubmit();
    els.status.textContent = '正在提交留言…';
    try {
      await request('/api/messages', {
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          nickname:els.nick.value.trim(),category:els.cat.value,
          content:els.content.value.trim(),turnstileToken
        })
      });
      els.content.value = '';
      els.counter.textContent = '0 / 500';
      els.status.textContent = '留言发布成功，谢谢你的反馈！';
      pageNumber = 1;
      await loadMessages();
    } catch (error) {
      els.status.textContent = error.message;
    } finally {
      sending = false;
      turnstileToken = '';
      if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
      refreshSubmit();
    }
  });
  init();
})();