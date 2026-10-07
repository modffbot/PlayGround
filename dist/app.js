/* MODYX AI - Frontend app (vanilla, fast, offline-aware) */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const store={get:(k,d)=>{try{const v=localStorage.getItem('modyx_'+k);return v??d}catch{return d}},set:(k,v)=>localStorage.setItem('modyx_'+k,v)};
let token=store.get('token',''), user=null, convId='', caps=null, sending=false, lastAnswer='', fileCtx='', saved=[];
let isLogin=true;

function toast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;$('#toasts').appendChild(t);setTimeout(()=>t.remove(),3200)}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function md(src){
  let h=esc(src);
  h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(m,l,c)=>`<pre><code>${c}</code></pre>`);
  h=h.replace(/^### (.*)$/gm,'<b style="color:var(--neon)">$1</b>');
  h=h.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  h=h.replace(/`([^`]+)`/g,'<code style="background:rgba(0,207,255,.15);padding:1px 6px;border-radius:6px">$1</code>');
  h=h.replace(/^(\d+)\. (.*)$/gm,'<div>$1. $2</div>').replace(/^- (.*)$/gm,'<div>• $1</div>');
  h=h.replace(/\n/g,'<br>');
  return h;
}
async function api(p,o={}){
  o.headers={...(o.headers||{}),'Content-Type':'application/json'};
  if(token)o.headers.Authorization='Bearer '+token;
  const r=await fetch(p,o);
  const j=await r.json().catch(()=>({}));
  if(r.status===401&&/مسجل|منتهية|الجلسة|session/i.test(j.error||'')){
    token='';try{store.set('token','')}catch{}
    if(document.getElementById('app')?.classList.contains('on')){
      try{typeof openAuth==='function'&&openAuth()}catch{}
      toast('انتهت جلستك — سجل الدخول مجددًا 🔑');
    }
  }
  if(!r.ok)throw new Error(j.error||('خطأ '+r.status));
  return j;
}
function setOnline(){const off=!navigator.onLine;$('#offbar').classList.toggle('on',off)}
addEventListener('online',setOnline);addEventListener('offline',setOnline);setOnline();

/* splash + boot */
setTimeout(()=>{$('#splash').classList.add('hide');boot()},1400);
const I18N={
 en:{newchat:'✎ New chat',ask:'Ask MODYX AI',search:'🔍 Search...'},
 fr:{newchat:'✎ Nouveau chat',ask:'Demandez à MODYX AI',search:'🔍 Rechercher...'},
 ar:{newchat:'✎ دردشة جديدة',ask:'اسأل MODYX AI',search:'🔍 بحث...'}
};
async function bootShared(){
  $('#splash').classList.add('hide');
  try{
    const j=await fetch('/api/shared/'+location.hash.slice(3)).then(r=>r.json());
    if(j.error)throw new Error(j.error);
    $('#landing').style.display='none';$('#guestTop').style.display='none';
    document.body.innerHTML=`<main class="wrap"><div class="card"><h3>🔗 ${esc(j.title||'محادثة مشاركة')}</h3><div id="msgs">${(j.messages||[]).map(m=>`<div class="msg ${m.role==='assistant'?'ai':'user'}">${md(m.content)}</div>`).join('')}</div><p style="color:var(--muted)">MODYX AI — رابط مشاركة للقراءة فقط</p></div></main>`;
  }catch{document.body.innerHTML='<main class="wrap"><div class="empty">رابط المشاركة غير صالح</div></main>'}
}
async function boot(){
  if(location.hash.startsWith('#token=')){store.set('token',decodeURIComponent(location.hash.slice(7)));token=store.get('token','');history.replaceState(null,'',location.pathname);toast('تم الدخول عبر Google ✅')}
  if(location.hash.startsWith('#s='))return bootShared();
  try{const cfg=await fetch('/api/auth/config').then(r=>r.json());const gb=$('#googleBtn');if(gb&&cfg.google){gb.hidden=false;gb.onclick=()=>location.href='/api/auth/google'}}catch{}
  try{const b=await fetch('/api/brand').then(r=>r.json());
    document.title=b.name+' — منصة الذكاء الاصطناعي';
    $$('.brandname').forEach(x=>x.textContent=b.emoji+' '+b.name);
    if(b.accent)document.documentElement.style.setProperty('--neon',b.accent);
  }catch{}
  try{const r=await fetch('/api/provider-status').then(r=>r.json());caps=r;
    $('#provBadge').textContent=r.configured?`● ${r.provider} · ${r.model}`:`● محلي ذكي`;
    $('#modeDot').className='dot'+(r.configured?'':' local');
    $('#modeTxt').textContent=r.configured?'متصل — '+r.model:'وضع محلي — اربط AI_API_KEY للقوة الكاملة';
    $('#capNote').textContent=(r.visionNote||'')+' '+(r.webSearchNote||'');
    $('#visCap').textContent=r.visionNote||'';$('#searchCap').textContent=r.webSearchNote||'';
    try{
      await loadModeLists();
    }catch{}
  }catch{$('#provBadge').textContent='● محلي'}
  applyPrefs();
  if(token){try{const m=await api('/api/auth/me');user=m.user;enterApp();return}catch{token='';store.set('token','')}}
  $('#landing').style.display='block';
  try{const j=await (await fetch('/api/ads?placement=landing')).json();const box=$('#landingAd');
    if(j.ads?.length){const a=j.ads[0];box.innerHTML=`<div class="card" style="text-align:center">📢 <b>${esc(a.title)}</b> <small>${esc(a.body||'')}</small> ${a.link?`<a href="${esc(a.link)}" target="_blank" class="btn">عرض</a>`:''}</div>`}}catch{}
}
function applyPrefs(){
  const lang=store.get('lang',user?.lang||'ar');
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  const theme=store.get('theme',user?.theme||'dark');
  document.documentElement.dataset.theme=(theme==='purple'||theme==='green')?'dark':theme;
  document.documentElement.dataset.accent=(theme==='purple'||theme==='green')?theme:'blue';
  document.documentElement.style.setProperty('--font',store.get('font','15px'));
  const acc=store.get('accent','');if(acc)document.documentElement.style.setProperty('--neon',acc);
  const t=I18N[lang]||I18N.ar;
  const nb=$('#newChatBtn');if(nb)nb.textContent=t.newchat;
  const pr=$('#prompt');if(pr)pr.placeholder=t.ask;
  const sc=$('#searchChats');if(sc)sc.placeholder=t.search;
  const tb=$('#themeBtn');if(tb)tb.textContent=document.documentElement.dataset.theme==='dark'?'🌙':'☀️';
  const tb2=$('#themeBtn2');if(tb2)tb2.textContent=document.documentElement.dataset.theme==='dark'?'🌙':'☀️';
  $('#setLang').value=lang;$('#setTheme').value=theme;$('#setFont').value=store.get('font','15px');
  const sa=$('#setAccent');if(sa&&acc)sa.value=acc;
  applyBg();
}
function applyBg(){
  const url=user?.bg_url||store.get('bg',''), op=user?.bg_opacity||store.get('bgop','25');
  if(url){document.body.style.backgroundImage=`url("${url}")`;document.body.style.backgroundSize='cover';document.body.style.backgroundAttachment='fixed';document.body.style.backgroundPosition='center';
    document.documentElement.style.setProperty('--glass',`rgba(10,16,30,${Math.max(.15,1-op/100)})`)}
  else{document.body.style.backgroundImage=''}
}

/* navigation */
function showTab(t){
  if(t==='admin'&&!sessionStorage.getItem('modyx_admin')){$('#adminModal').classList.add('on');return}
  $$('.navbtn[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  $$('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==t);
  closeDrawer();
  if(t==='files')loadFiles();if(t==='notif')loadNotif();if(t==='admin')loadAdmin();if(t==='plans')loadPlans();if(t==='settings'){loadMem();loadSec()}if(t==='pro'&&window.ProUI)ProUI.show('research');
  if(t==='chat'&&token)loadAd('chat','#adSlot');
}
/* drawer + topbar (ChatGPT style) */
function openDrawer(){$('#drawer').classList.add('open');$('#scrim').classList.add('on')}
function closeDrawer(){$('#drawer')?.classList.remove('open');$('#scrim')?.classList.remove('on')}
function updateEmpty(){const has=!!$('#msgs .msg');$('#emptyState').style.display=has?'none':'flex'}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});

/* auth */
let reg=false;
function openAuth(){isLogin=!reg;$('#authTitle').textContent=isLogin?'تسجيل الدخول':'إنشاء حساب';$('#regNameWrap').hidden=isLogin;$('#regPhoneWrap').hidden=isLogin;$('#authGo').textContent=isLogin?'دخول':'إنشاء';$('#authIdLabel').textContent=isLogin?'البريد الإلكتروني أو الهاتف':'البريد الإلكتروني';$('#authModal').classList.add('on')}
$('#loginBtn').onclick=openAuth;$('#startBtn').onclick=()=>token?enterApp():openAuth();
$('#ctaStart').onclick=()=>token?enterApp():openAuth();
$('#ctaTry').onclick=()=>token?enterApp():(openAuth());
$('#authClose').onclick=()=>$('#authModal').classList.remove('on');
$('#authSwitch').onclick=e=>{e.preventDefault();reg=!reg;openAuth()};
$('#authGo').onclick=async()=>{
  const ident=$('#authEmail').value.trim(),pass=$('#authPass').value;
  const doLogin=async(extra={})=>{
    const url=isLogin?'/api/auth/register'.replace('register','login'):'/api/auth/register';
    const body=isLogin?{identifier:ident,password:pass,...extra}:{name:$('#authName').value||'مستخدم',email:ident,password:pass,phone:$('#authPhone').value||''};
    return api(url,{method:'POST',body:JSON.stringify(body)});
  };
  try{
    const j=await doLogin();
    token=j.token;store.set('token',token);user=j.user;$('#authModal').classList.remove('on');enterApp();toast('أهلًا '+user.name+' ⚡');
  }catch(e){
    if(e.message==='2FA'){const code=prompt('حسابك محمي بـ 2FA — أدخل رمز الـ 6 أرقام:');if(!code)return;
      try{const j=await doLogin({code});token=j.token;store.set('token',token);user=j.user;$('#authModal').classList.remove('on');enterApp();toast('أهلًا '+user.name+' ⚡')}catch(e2){toast(e2.message)}
    }else toast(e.message);
  }
};
async function loadModeLists(){
  const md=await api('/api/modes');
  $('#modeSel').innerHTML=md.modes.map(m=>`<option value="${m.id}" ${m.ok?'':'disabled'}>${esc(m.name)}${m.ok?'':' 🔒'}</option>`).join('');
  if(![...$('#modeSel').options].some(o=>o.selected))$('#modeSel').value='smart';
  const as=await api('/api/assistants');
  const cur=$('#assistantSel').value;
  $('#assistantSel').innerHTML='<option value="">🤖 عام</option>'+as.assistants.map(a=>`<option value="${a.id}">🤖 ${esc(a.name)}</option>`).join('');
  if(cur)$('#assistantSel').value=cur;
}
async function enterApp(){
  $('#landing').style.display='none';$('#app').classList.add('on');$('#loginBtn').style.display='none';$('#startBtn').textContent='لوحتي';
  $('#guestTop').style.display='none';$('#cgtop').style.display='flex';
  $('#setName').value=user.name||'';$('#setAvatar').value=user.avatar||'';
  mountChips();
  mountPromptsBtn();
  loadMem();
  try{await loadModeLists()}catch{}
  await newConv();loadChats();loadUsage();
}
/* static UI wiring */
$('#menuBtn').onclick=openDrawer;
$('#scrim').onclick=closeDrawer;
$('#newTopBtn').onclick=()=>{showTab('chat');newConv()};
$('#proBtn').onclick=()=>showTab('plans');
$('#setBtn').onclick=()=>showTab('settings');
$('#voiceBtn2').onclick=()=>showTab('voice');
$('#voiceGoBtn').onclick=()=>showTab('voice');
$('#langBtn2').onclick=()=>{store.set('lang',document.documentElement.lang==='ar'?'en':'ar');applyPrefs()};
$('#themeBtn2').onclick=()=>{store.set('theme',document.documentElement.dataset.theme==='dark'?'light':'dark');applyPrefs()};
$$('#emptyState .sug').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.sug;showTab('chat');$('#prompt').focus()});
$('#logoutBtn').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});token='';store.set('token','');location.reload()};

/* chats */
async function newConv(){try{const j=await api('/api/conversations',{method:'POST',body:JSON.stringify({})});convId=j.id;$('#msgs').innerHTML='';updateEmpty();$('#convTitle').textContent='محادثة جديدة';fileCtx='';$('#attachBar').innerHTML='';$('#prompt').value=store.get('draft_new','');loadChats()}catch(e){toast(e.message)}}
$('#newChatBtn').onclick=newConv;
let chatFilter='all';
async function loadChats(q=''){
  try{const j=await api('/api/conversations?filter='+chatFilter+(q?`&q=${encodeURIComponent(q)}`:'')); 
    $('#chatList').innerHTML=j.conversations.length?j.conversations.map(c=>`<div class="chatitem ${c.id===convId?'active':''}" data-id="${c.id}"><span>${c.pinned?'📌 ':''}${esc(c.title)}</span><button data-pin="${c.id}" data-p="${c.pinned?1:0}" title="تثبيت/إلغاء">📌</button><button data-arch="${c.id}" title="أرشفة">📦</button><button data-del="${c.id}" title="حذف">✕</button></div>`).join(''):'<div class="empty">لا محادثات بعد</div>';
  }catch{}
}
$('#searchChats').oninput=e=>loadChats(e.target.value);
document.addEventListener('click',async e=>{
  const f=e.target.closest('[data-f]');if(f){chatFilter=f.dataset.f;$$('.dchips .chip').forEach(x=>x.style.borderColor=x===f?'var(--neon)':'');loadChats($('#searchChats').value);return}
  const pin=e.target.closest('[data-pin]');
  if(pin){e.stopPropagation();await api('/api/conversations/'+pin.dataset.pin,{method:'PUT',body:JSON.stringify({pinned:pin.dataset.p?0:1})});loadChats();return}
  const arch=e.target.closest('[data-arch]');
  if(arch){e.stopPropagation();await api('/api/conversations/'+arch.dataset.arch,{method:'PUT',body:JSON.stringify({archived:1})});if(arch.dataset.arch===convId)newConv();else loadChats();return}
  const del=e.target.closest('[data-del]');
  if(del){e.stopPropagation();if(!confirm('حذف هذه المحادثة؟'))return;await api('/api/conversations/'+del.dataset.del,{method:'DELETE'});if(del.dataset.del===convId)newConv();else loadChats();return}
  const it=e.target.closest('.chatitem');
  if(it){convId=it.dataset.id;showTab('chat');openConv()}
});
/* openConv defined below (with draft restore) */
function renderMsgs(ms){
  if(!ms.length){$('#msgs').innerHTML='';updateEmpty();return}
  $('#msgs').innerHTML=ms.map(m=>msgHtml(m)).join('');
  updateEmpty();
  $('#msgs').scrollIntoView({block:'end'});
  bindMsgBtns();
}
function msgHtml(m){
  const ai=m.role==='assistant';
  const meta=parseMeta(m.meta);
  const metaLine=ai?`<div class="meta"><span>${esc(meta.mode||'')}</span></div>`:'';
  const acts=ai?`<div class="mactions"><button data-copy>📋 نسخ</button><button data-regen>🔄 إعادة توليد</button><button data-share>🔗 مشاركة</button><button data-img>🖼️ صورة</button><button data-save>⭐ حفظ</button><button data-speak>🔊 استماع</button><button data-fb="1" data-mid="${m.id||''}">👍</button><button data-fb="-1" data-mid="${m.id||''}">👎</button></div>`:`<div class="mactions"><button data-edit data-mid="${m.id||''}">✏️ تعديل</button><button data-branch data-mid="${m.id||''}">🌿 فرع</button></div>`;
  let extra='';
  if(ai&&meta.widget){const id='w'+(++widSeq);widgets[id]=meta.widget;extra=widgetHtml(id,meta.widget)}
  return `<div class="msg ${ai?'ai':'user'}" data-c="${esc(m.content).slice(0,50)}"><div class="body">${md(m.content)}</div>${extra}${metaLine}${acts}</div>`;
}
function bindMsgBtns(){
  $$('#msgs [data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard.writeText(b.closest('.msg').querySelector('.body').innerText);toast('تم النسخ 📋')});
  $$('#msgs [data-regen]').forEach(b=>b.onclick=regen);
  $$('#msgs [data-share]').forEach(b=>b.onclick=()=>{const t=b.closest('.msg').querySelector('.body').innerText;navigator.clipboard.writeText(t);toast('نُسخ للمشاركة — الصقه في أي مكان 🔗')});
  $$('#msgs [data-save]').forEach(b=>b.onclick=()=>{saved.push(b.closest('.msg').querySelector('.body').innerText);store.set('saved',JSON.stringify(saved));toast('تم الحفظ ⭐ ('+saved.length+')')});
  $$('#msgs [data-speak]').forEach(b=>b.onclick=()=>speak(b.closest('.msg').querySelector('.body').innerText));
  $$('#msgs [data-fb]').forEach(b=>b.onclick=async()=>{if(!b.dataset.mid){toast('أعد فتح المحادثة للتقييم');return}try{await api('/api/feedback',{method:'POST',body:JSON.stringify({message_id:b.dataset.mid,rating:Number(b.dataset.fb)})});toast(b.dataset.fb==='1'?'شكرًا! 👍':'تم استلام ملاحظتك 👎')}catch(e){toast(e.message)}});
  $$('#msgs [data-branch]').forEach(b=>b.onclick=async()=>{if(!b.dataset.mid){toast('أعد فتح المحادثة أولًا');return}try{const j=await api('/api/conversations/'+convId+'/branch',{method:'POST',body:JSON.stringify({message_id:b.dataset.mid})});convId=j.id;openConv();toast('تم إنشاء فرع 🌿')}catch(e){toast(e.message)}});
  $$('#msgs [data-edit]').forEach(b=>b.onclick=async()=>{if(!b.dataset.mid){toast('أعد فتح المحادثة أولًا');return}const cur=b.closest('.msg').querySelector('.body').innerText;const v=prompt('تعديل رسالتك:',cur);if(!v||v===cur)return;try{await api('/api/messages/'+b.dataset.mid,{method:'PUT',body:JSON.stringify({content:v})});openConv();toast('تم التعديل ✏️ — أعد الإرسال للمتابعة')}catch(e){toast(e.message)}});
  $$('#msgs [data-img]').forEach(b=>b.onclick=()=>shareAsImage(b.closest('.msg')));
}
function appendFollowups(el,list){
  if(!list?.length)return;
  const d=document.createElement('div');d.className='mactions';
  d.innerHTML=list.map(q=>`<button data-fq="${esc(q)}">➡️ ${esc(q.slice(0,40))}</button>`).join('');
  d.querySelectorAll('[data-fq]').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.fq;showTab('chat');send()});
  el.appendChild(d);
}
/* share answer as social image card */
function shareAsImage(msgEl){
  const text=msgEl.querySelector('.body').innerText.slice(0,600);
  const c=document.createElement('canvas');c.width=1080;c.height=900;
  const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,1080,900);g.addColorStop(0,'#040914');g.addColorStop(1,'#0a2540');
  x.fillStyle=g;x.fillRect(0,0,1080,900);
  x.strokeStyle='#00cfff';x.lineWidth=6;x.strokeRect(20,20,1040,860);
  x.fillStyle='#00cfff';x.font='bold 54px sans-serif';x.textAlign='center';x.fillText('⚡ MODYX AI',540,110);
  x.fillStyle='#eaf7ff';x.font='30px sans-serif';x.textAlign='right';
  const words=text.split(/\s+/);let line='',y=200;
  for(const w of words){const t=line+' '+w;if(x.measureText(t).width>880||y>740){x.fillText(line,1000,y);y+=48;line=w;if(y>740)break}else line=t}
  if(line&&y<=760)x.fillText(line,1000,y);
  x.fillStyle='#8fb3c9';x.font='24px sans-serif';x.textAlign='center';x.fillText('t.me/MODYXBOT1',540,830);
  const a=document.createElement('a');a.download='modyx-answer.png';a.href=c.toDataURL('image/png');a.click();
  toast('تم تنزيل البطاقة 🖼️');
}
async function refreshMsgIds(){
  try{const j=await api('/api/conversations/'+convId);const els=$$('#msgs .msg');j.messages.forEach((m,i)=>{if(els[i]){els[i].querySelectorAll('[data-mid]').forEach(b=>b.dataset.mid=m.id)}})}catch{}
}
try{saved=JSON.parse(store.get('saved','[]'))}catch{}

/* ---- ChatGPT-style: quick suggestion chips + inline tool widgets ---- */
const widgets={};let widSeq=0;
const CHIPS=['🌐 اعملي موقع مطعم بألوان داكنة','💻 اكتب كود Python يقرأ ملف CSV','🔍 ابحث عن آخر أخبار الذكاء الاصطناعي','📝 لخص: الذكاء الاصطناعي يغير التعليم والصحة والعمل'];
function mountChips(){
  if($('#chips')||!document.querySelector('.composer'))return;
  document.querySelector('.composer').insertAdjacentHTML('afterbegin',
    `<div id="chips" style="display:flex;gap:6px;overflow-x:auto;padding:2px">${CHIPS.map(c=>`<button class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>`);
  $('#chips').onclick=e=>{const b=e.target.closest('[data-chip]');if(!b)return;$('#prompt').value=b.dataset.chip;showTab('chat');send()};
}
function widgetHtml(id,w){
  if(w.type==='website'){
    return `<div class="wcard"><b>🌐 الموقع جاهز — معاينة حية</b>
      <iframe class="prev" sandbox="allow-scripts" srcdoc="${esc(w.files['index.html'])}"></iframe>
      <div class="mactions"><button onclick="wDownload('${id}')">⬇️ تنزيل</button><button onclick="wBuilder('${id}')">🛠 فتح في Website Builder</button><button onclick="wRegen('${id}')">🔄 إعادة توليد</button></div></div>`;
  }
  if(w.type==='search'&&w.results?.length){
    return `<div class="wcard">${w.results.map(r=>`<div class="card" style="margin:6px 0;padding:10px"><b>${esc(r.title)}</b><br><small style="color:var(--muted)">${esc(r.source||'')} · ${esc(w.engine||'')}</small><p style="margin:6px 0">${esc((r.snippet||'').slice(0,220))}</p>${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener">🔗 فتح المصدر</a>`:''}</div>`).join('')}</div>`;
  }
  if(w.type==='sources'&&w.results?.length){
    return `<div class="wcard"><b>📚 المصادر المستخدمة (${w.results.length})</b>${w.results.map((r,i)=>`<div style="font-size:13px;margin:6px 0"><b>Source ${i+1}:</b> ${esc(r.title)} <small style="color:var(--muted)">(${esc(r.source||'')})</small><br>${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener">🔗 ${esc(r.url.slice(0,70))}</a>`:''}</div>`).join('')}</div>`;
  }
  if(w.type==='code'&&w.code){
    const ext={Python:'py',JavaScript:'js',PHP:'php',Java:'java','C++':'cpp',SQL:'sql'}[w.language]||'txt';
    return `<div class="wcard"><b>💻 الكود جاهز (${esc(w.language||'code')})</b><pre dir="ltr">${esc(w.code)}</pre><div class="mactions"><button onclick="wCopy('${id}')">📋 نسخ الكود</button><button onclick="wDlCode('${id}','${ext}')">⬇️ تنزيل</button></div></div>`;
  }
  if(w.type==='image'&&w.url){
    return `<div class="wcard"><b>🎨 الصورة المولّدة</b><br><small style="color:var(--muted)">${esc(w.prompt||'')}</small><img src="${esc(w.url)}" alt="generated" style="width:100%;border-radius:12px;margin-top:8px" loading="lazy"><div class="mactions"><a href="${esc(w.url)}" target="_blank" rel="noopener" download="modyx-image.png"><button>🔗 فتح بالحجم الكامل</button></a></div></div>`;
  }
  return '';
}
window.wCopy=id=>{const w=widgets[id];if(w?.code){navigator.clipboard.writeText(w.code);toast('تم نسخ الكود 📋')}};
window.wDlCode=(id,ext)=>{const w=widgets[id];if(w?.code)dl('modyx-code.'+(ext||'txt'),w.code)};
window.wDownload=id=>{const w=widgets[id];if(w)dl('index.html',w.files['index.html'])};
window.wBuilder=id=>{const w=widgets[id];if(!w)return;$('#siteDesc').value=w.desc;$('#siteHtml').value=w.files['index.html'];updSitePrev();showTab('website');toast('اكمل التعديل في Website Builder 🛠')};
window.wRegen=id=>{const w=widgets[id];if(!w)return;$('#prompt').value=w.desc;showTab('chat');send()};
function parseMeta(m){try{return JSON.parse(m||'{}')}catch{return{}}}

/* send with streaming (progressive SSE rendering, fallback to JSON) */
$('#sendBtn').onclick=send;$('#prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
function userMsgHtml(content){
  return `<div class="msg user"><div class="body">${esc(content)}</div><div class="mactions"><button data-edit data-mid="">✏️ تعديل</button><button data-branch data-mid="">🌿 فرع</button></div></div>`;
}
function appendAiShell(){
  const d=document.createElement('div');d.className='msg ai';d.innerHTML='<div class="body"></div>';
  $('#msgs').appendChild(d);return d;
}
let aborter=null;
$('#stopBtn').onclick=()=>{try{aborter?.abort()}catch{}toast('تم الإيقاف ⏹️')};
async function send(){
  if(sending)return;const v=$('#prompt').value.trim();if(!v){toast('اكتب رسالتك أولًا ✍️');return}
  sending=true;$('#sendBtn').disabled=true;$('#stopBtn').hidden=false;
  $('#slashHint').hidden=true;
  aborter=new AbortController();
  $('#msgs').insertAdjacentHTML('beforeend',userMsgHtml(v));updateEmpty();bindMsgBtns();
  const shell=appendAiShell();shell.querySelector('.body').innerHTML='<div class="skel"></div>';
  $('#prompt').value='';store.set('draft_'+convId,'');
  const payload={content:v,mode:$('#modeSel').value||'smart',assistant:$('#assistantSel').value||'',fileContext:fileCtx};
  const finish=()=>{sending=false;$('#sendBtn').disabled=false;$('#stopBtn').hidden=true;refreshMsgIds()};
  let full='',meta={mode:''},gotStream=false;
  try{
    const r=await fetch('/api/conversations/'+convId+'/stream',{method:'POST',signal:aborter.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)});
    if(!r.ok||!r.body)throw new Error('STREAM_FAIL');
    const reader=r.body.getReader(),dec=new TextDecoder();let buf='';
    const bodyEl=shell.querySelector('.body');bodyEl.innerHTML='';
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      const parts=buf.split('\n\n');buf=parts.pop();
      for(const p of parts){
        const line=p.trim().split('\n').find(l=>l.startsWith('data:'));
        if(!line)continue;
        const ev=JSON.parse(line.slice(5));
        if(ev.token){full+=ev.token;gotStream=true;bodyEl.innerHTML=md(full)}
        if(ev.error)throw new Error(ev.error);
        if(ev.done){meta={mode:ev.mode,widget:ev.widget||null};lastAnswer=full;
          shell.outerHTML=msgHtml({role:'assistant',content:full,meta:JSON.stringify(meta)});bindMsgBtns();appendFollowups($('#msgs .msg.ai:last-child'),ev.followups);updateEmpty();loadChats();loadUsage();finish();return}
      }
    }
    throw new Error('STREAM_CUT');
  }catch(e){
    if(e.name==='AbortError'){shell.outerHTML=msgHtml({role:'assistant',content:full||'(توقف التوليد ⏹️)',meta:JSON.stringify(meta)});bindMsgBtns();updateEmpty()}
    else if(!gotStream){
      try{
        const j=await api('/api/conversations/'+convId+'/messages',{method:'POST',body:JSON.stringify(payload)});
        lastAnswer=j.reply;shell.outerHTML=msgHtml({role:'assistant',content:j.reply,meta:JSON.stringify({mode:j.mode,widget:j.widget||null})});bindMsgBtns();appendFollowups($('#msgs .msg.ai:last-child'),j.followups);updateEmpty();loadChats();loadUsage();
      }catch(e2){shell.outerHTML=`<div class="empty">❌ ${esc(e2.message)} <button class="btn" onclick="document.querySelector('#sendBtn').click()">🔄 إعادة المحاولة</button></div>`}
    }else{shell.outerHTML=msgHtml({role:'assistant',content:full||'⚠️ انقطع البث',meta:JSON.stringify(meta)});bindMsgBtns()}
  }
  finish();
}
async function regen(){try{toast('جاري إعادة التوليد...');const j=await api('/api/conversations/'+convId+'/regenerate',{method:'POST'});lastAnswer=j.reply;$('#msgs').insertAdjacentHTML('beforeend',msgHtml({role:'assistant',content:j.reply,meta:'{}'}));bindMsgBtns()}catch(e){toast(e.message)}}
$('#delConv').onclick=async()=>{if(!confirm('حذف المحادثة الحالية؟'))return;await api('/api/conversations/'+convId,{method:'DELETE'});newConv()};
$('#shareBtn').onclick=async()=>{try{const j=await api('/api/conversations/'+convId+'/share',{method:'POST'});const url=location.origin+location.pathname+'#s='+j.token;navigator.clipboard.writeText(url);toast('تم نسخ رابط المشاركة 🔗')}catch(e){toast(e.message)}};
/* offline drafts: autosave + restore */
$('#prompt').addEventListener('input',e=>{try{store.set('draft_'+convId,e.target.value)}catch{}slashHint()});
const SLASHES=[['/لخص','تلخيص النصوص'],['/ترجم','ترجمة احترافية'],['/صياغة','إعادة صياغة'],['/كود','كود + شرح'],['/صورة','توليد صورة'],['/بحث','بحث إنترنت'],['/موقع','بناء موقع'],['/بريف','البريف الصباحي'],['/فكرة','توليد أفكار'],['/مساعدة','كل الأوامر']];
function slashHint(){
  const v=$('#prompt').value,h=$('#slashHint');
  if(!v.startsWith('/')){h.hidden=true;return}
  const q=v.slice(1).split(' ')[0];
  const list=SLASHES.filter(([c])=>c.slice(1).startsWith(q)).slice(0,6);
  if(!list.length){h.hidden=true;return}
  h.hidden=false;
  h.innerHTML=list.map(([c,d])=>`<button data-sl="${c}"><b dir="ltr">${c}</b> — ${d}</button>`).join('');
  h.querySelectorAll('[data-sl]').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.sl+' ';$('#prompt').focus();h.hidden=true});
}
$('#sumBtn').onclick=async()=>{try{toast('يلخص المحادثة...');const j=await api('/api/conversations/'+convId+'/summarize',{method:'POST'});$('#msgs').insertAdjacentHTML('beforeend',msgHtml({role:'assistant',content:j.reply,meta:'{}'}));bindMsgBtns()}catch(e){toast(e.message)}};
$('#styleLearn').onclick=async()=>{try{toast('أحلل أسلوبك...');const j=await api('/api/style/learn',{method:'POST'});toast('تم حفظ أسلوبك 🎨');loadMem()}catch(e){toast(e.message)}};
$('#tgLink').onclick=async()=>{try{const j=await api('/api/telegram/code',{method:'POST'});prompt('انسخ الكود وأرسله للبوت بأمر /link:',j.code);toast('أرسل /link + الكود للبوت ✈️')}catch(e){toast(e.message)}};
/* live camera → vision */
let camStream=null;
$('#camStart').onclick=async()=>{
  try{camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const v=$('#camVideo');v.srcObject=camStream;v.style.display='block';v.play();$('#camShot').hidden=false;toast('الكاميرا تعمل 📷');
  }catch{toast('تعذر فتح الكاميرا — تحقق من الأذونات')}
};
$('#camShot').onclick=async()=>{
  const v=$('#camVideo');const c=document.createElement('canvas');c.width=v.videoWidth||640;c.height=v.videoHeight||480;
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));
  try{camStream?.getTracks().forEach(t=>t.stop())}catch{}
  v.style.display='none';$('#camShot').hidden=true;
  const fd=new FormData();fd.append('image',blob,'camera.jpg');fd.append('question',$('#visQ').value||'صِف ما تراه الكاميرا');
  $('#visOut').innerHTML='<div class="skel"></div>';
  try{const r=await fetch('/api/vision/analyze',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});const j=await r.json();$('#visOut').innerHTML=md(j.analysis||j.error)}catch(e){$('#visOut').textContent='❌ '+e.message}
};
async function openConv(){
  try{const j=await api('/api/conversations/'+convId);
    $('#convTitle').textContent=j.conversation.title;if($('#modeSel').value&&j.conversation.mode)$('#modeSel').value=j.conversation.mode;renderMsgs(j.messages);loadChats();
    const d=store.get('draft_'+convId,'');if(d)$('#prompt').value=d;
  }catch(e){toast(e.message)}
}
/* hidden admin ••• */
$('#admDots').onclick=()=>$('#adminModal').classList.add('on');
$('#adminClose').onclick=()=>$('#adminModal').classList.remove('on');
$('#adminGo').onclick=async()=>{
  try{await api('/api/admin/unlock',{method:'POST',body:JSON.stringify({password:$('#adminPass').value})});$('#adminPass').value='';$('#adminModal').classList.remove('on');sessionStorage.setItem('modyx_admin','1');showTab('admin');toast('أهلًا أيها المدير 🛡️')}catch(e){toast('فشل التحقق')}
};

/* files (attach via + menu) */
$('#fileInput').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  $('#attachBar').innerHTML=`<div class="filechip">⏳ جاري رفع ${esc(f.name)} (${(f.size/1024).toFixed(1)} KB)...</div>`;
  const fd=new FormData();fd.append('file',f);fd.append('conversation_id',convId);
  try{
    const r=await fetch('/api/files/upload',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});
    const j=await r.json();if(!r.ok)throw new Error(j.error);
    fileCtx=j.file.text_preview||'';
    $('#attachBar').innerHTML=`<div class="filechip">📎 ${esc(j.file.name)} (${(j.file.size/1024).toFixed(1)} KB) — تم ✅ <button onclick="clearAttach()">✕</button></div>`;
    toast('تم رفع الملف ✅');loadUsage();
  }catch(err){$('#attachBar').innerHTML=`<div class="filechip">❌ ${esc(err.message)}</div>`}
  e.target.value='';
}
window.clearAttach=()=>{fileCtx='';$('#attachBar').innerHTML=''};
async function loadFiles(){
  try{const j=await api('/api/files');
    $('#fileList').innerHTML=j.files.length?j.files.map(f=>`<div class="filechip">📄 ${esc(f.original_name)} (${(f.size/1024).toFixed(1)} KB) <button data-df="${f.id}">🗑️ حذف</button></div>`).join(''):'<div class="empty">لا ملفات بعد — استخدم 📎 في المحادثة للرفع.</div>';
    $$('#fileList [data-df]').forEach(b=>b.onclick=async()=>{await api('/api/files/'+b.dataset.df,{method:'DELETE'});loadFiles();toast('حُذف الملف')});
  }catch{}
}

/* code expert */
const TASKS=[['generate','✨ توليد'],['debug','🐞 تصحيح'],['explain','📖 شرح'],['optimize','🚀 تحسين'],['convert','🔄 تحويل'],['sql','🗄️ SQL'],['web','🌐 ويب'],['api','🔌 API'],['bot','🤖 بوت']];
let curTask='generate';
$('#codeTasks').innerHTML=TASKS.map(([k,l])=>`<button class="btn ${k===curTask?'primary':''}" data-task="${k}">${l}</button>`).join('');
$('#codeTasks').onclick=e=>{const b=e.target.closest('[data-task]');if(!b)return;curTask=b.dataset.task;$$('#codeTasks .btn').forEach(x=>x.classList.remove('primary'));b.classList.add('primary')};
$('#codeRun').onclick=async()=>{
  const prompt=$('#codeInput').value.trim();if(!prompt){toast('أدخل الوصف أو الكود');return}
  $('#codeOut').innerHTML='<div class="skel"></div>';
  try{const j=await api('/api/code/'+curTask,{method:'POST',body:JSON.stringify({prompt,language:$('#codeLang').value})});
    $('#codeOut').innerHTML=md(j.result);
    const m=j.result.match(/```(?:html)?\n([\s\S]*?)```/);
    if(curTask==='web'||$('#codeLang').value.includes('HTML')){$('#codePrevWrap').hidden=false;$('#codePrev').srcdoc=(m?m[1]:'<p>لا معاينة</p>')}
    loadUsage();
  }catch(e){$('#codeOut').textContent='❌ '+e.message}
};
$('#codeCopy').onclick=()=>{navigator.clipboard.writeText($('#codeOut').innerText);toast('تم نسخ الكود 📋')};
$('#codeDl').onclick=()=>{const ext={Python:'py',JavaScript:'js',PHP:'php',Java:'java','C++':'cpp',SQL:'sql'}[$('#codeLang').value]||'txt';dl('modyx-code.'+ext,$('#codeOut').innerText)};
function dl(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=name;a.click()}

/* website builder */
async function genSite(){
  const d=$('#siteDesc').value.trim();if(!d){toast('اكتب وصف الموقع أولًا');return}
  $('#sitePlan').textContent='⏳ جاري التوليد...';
  try{const j=await api('/api/website/generate',{method:'POST',body:JSON.stringify({description:d})});
    $('#sitePlan').innerHTML=md(j.plan);
    $('#siteHtml').value=j.files['index.html'];
    updSitePrev();toast('تم توليد الموقع ✨');
  }catch(e){$('#sitePlan').textContent='❌ '+e.message}
}
function updSitePrev(){const css='body{font-family:system-ui}';$('#sitePrev').srcdoc=$('#siteHtml').value}
$('#siteGen').onclick=genSite;$('#siteRegen').onclick=genSite;$('#siteHtml').oninput=updSitePrev;
$('#siteDl').onclick=()=>dl('index.html',$('#siteHtml').value);

/* vision */
$('#visGo').onclick=async()=>{
  const f=$('#visFile').files[0];if(!f){toast('اختر صورة');return}
  $('#visOut').innerHTML='<div class="skel"></div>';
  const fd=new FormData();fd.append('image',f);fd.append('question',$('#visQ').value);
  try{const r=await fetch('/api/vision/analyze',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});const j=await r.json();if(!r.ok)throw new Error(j.error);$('#visOut').innerHTML=md(j.analysis)}catch(e){$('#visOut').textContent='❌ '+e.message}
};
$('#visTranslate').onclick=async()=>{
  const f=$('#visFile').files[0];if(!f){toast('اختر صورة أولًا');return}
  $('#visOut').innerHTML='<div class="skel"></div>';
  const fd=new FormData();fd.append('image',f);fd.append('target',$('#visTarget').value);
  try{const r=await fetch('/api/vision/translate',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});const j=await r.json();
    $('#visOut').innerHTML=j.translation?md(j.translation)+`<br><small>عبر ${esc(j.via)}</small>`:'<div class="empty">ℹ️ '+esc(j.note||'لا ترجمة')+'</div>';
  }catch(e){$('#visOut').textContent='❌ '+e.message}
};

/* search */
$('#searchGo').onclick=async()=>{
  const q=$('#searchQ').value.trim();if(!q)return;
  $('#searchOut').innerHTML='<div class="skel"></div><div class="skel"></div>';
  try{const j=await api('/api/search?q='+encodeURIComponent(q));
    $('#searchOut').innerHTML=j.results.length?j.results.map(r=>`<div class="card" style="margin:8px 0"><b>${esc(r.title)}</b><br><small style="color:var(--muted)">${esc(r.source||'')}</small><p>${esc(r.snippet)}</p>${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener">🔗 ${esc(r.url.slice(0,60))}</a>`:''}</div>`).join(''):'<div class="empty">لا نتائج حقيقية — جرّب صياغة أخرى.</div>';
  }catch(e){$('#searchOut').innerHTML=`<div class="empty">❌ ${esc(e.message)}</div>`}
};

/* voice */
let rec=null;
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
$('#recStart').onclick=()=>{
  if(!SR){toast('متصفحك لا يدعم التعرف الصوتي — استخدم Chrome');return}
  rec=new SR();rec.lang=$('#voiceLang').value;rec.interimResults=false;
  rec.onresult=e=>{$('#voiceText').value+=e[0][0].transcript+' '};
  rec.onerror=()=>toast('تعذر التسجيل');rec.start();toast('🎙️ يتكلم... تحدث الآن');
};
$('#recStop').onclick=()=>{rec?.stop();toast('تم الإيقاف ⏹️')};
function speak(t){try{const u=new SpeechSynthesisUtterance(t.slice(0,500));u.lang=$('#voiceLang').value;speechSynthesis.cancel();speechSynthesis.speak(u)}catch{toast('النطق غير مدعوم')}}
$('#speakAns').onclick=()=>lastAnswer?speak(lastAnswer):toast('لا إجابة بعد');
$('#micBtn').onclick=()=>{
  if(!SR){toast('الإملاء غير مدعوم في متصفحك');return}
  const r=new SR();r.lang=document.documentElement.lang==='ar'?'ar-SA':'en-US';
  r.onresult=e=>{$('#prompt').value+=e[0][0].transcript};r.start();toast('🎙️ تحدث...');
};
$('#voiceSend').onclick=()=>{$('#prompt').value=$('#voiceText').value;showTab('chat');send()};

/* usage/notif/settings/admin */
async function loadUsage(){try{const u=await api('/api/usage/me');const badge=u.plan==='vip'?'👑 VIP':u.plan==='pro'?'⭐ PRO':'🆓 مجاني';$('#usageBox').innerHTML=`${badge} · 📊 اليوم: 💬 ${u.messages}/${u.limits.messages} · 📁 ${u.files}/${u.limits.files} · 🔍 ${u.searches}/${u.limits.searches}`}catch{}}

/* ---- prompt library ---- */
const PROMPTS=[
 ['🍽️ موقع مطعم','اعملي موقع مطعم بألوان داكنة وقسم للمنيو والحجز'],
 ['💻 كود بايثون','اكتب كود بايثون يقرأ ملف CSV ويحسب المتوسط'],
 ['🐞 تصحيح','صحح هذا الكود: '],
 ['🌍 ترجمة','ترجم للإنجليزية: '],
 ['📝 تلخيص','لخص النص التالي في 5 نقاط: '],
 ['✍️ صياغة','أعد صياغة النص التالي بأسلوب احترافي: '],
 ['💡 أفكار','اقترح 7 أفكار مشروع تطبيق صغير مربح'],
 ['🎨 صورة','ارسم صورة مدينة مستقبلية مضيئة باللون الأزرق'],
 ['🔍 بحث','ابحث عن آخر أخبار الذكاء الاصطناعي'],
 ['🗄️ SQL','اكتب استعلام SQL يعرض أعلى 10 عملاء إنفاقا'],
];
function customPrompts(){try{return JSON.parse(store.get('cprompts','[]'))}catch{return[]}}
function renderPrompts(f=''){
  const all=[...customPrompts().map(c=>['⭐ '+c[0],c[1]]),...PROMPTS].filter(([t])=>t.includes(f));
  $('#promptList').innerHTML=all.length?all.map(([t,p])=>`<button class="chip" style="text-align:start" data-p="${esc(p)}"><b>${esc(t)}</b><br><small style="color:var(--muted)">${esc(p.slice(0,60))}</small></button>`).join(''):'<div class="empty">لا قوالب مطابقة</div>';
  $$('#promptList [data-p]').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.p;$('#promptsModal').classList.remove('on');showTab('chat');$('#prompt').focus()});
}
function mountPromptsBtn(){openPromptsWire()}
function openPrompts(){renderPrompts();$('#promptsModal').classList.add('on')}
function openPromptsWire(){
  if(window._pwired)return;window._pwired=true;
  $('#promptsClose').onclick=()=>$('#promptsModal').classList.remove('on');
  $('#promptSearch').oninput=e=>renderPrompts(e.target.value);
  $('#promptCustom').onclick=()=>{const t=prompt('اسم القالب:');if(!t)return;const p=prompt('نص البرومبت:');if(!p)return;const c=customPrompts();c.push([t,p]);store.set('cprompts',JSON.stringify(c));renderPrompts();toast('تمت إضافة قالبك ⭐')};
  $('#plusBtn').onclick=e=>{e.stopPropagation();const m=$('#plusMenu');m.hidden=!m.hidden};
  document.addEventListener('click',e=>{if(!e.target.closest('#plusMenu')&&!e.target.closest('#plusBtn'))$('#plusMenu').hidden=true});
  $('#plusMenu').onclick=e=>{const b=e.target.closest('[data-plus]');if(!b)return;$('#plusMenu').hidden=true;
    if(b.dataset.plus==='file')$('#fileInput').click();
    if(b.dataset.plus==='prompts')openPrompts();
    if(b.dataset.plus==='voice'){showTab('voice')}};
}

/* ---- export conversation ---- */
async function convText(){
  const j=await api('/api/conversations/'+convId);
  return {title:j.conversation.title,lines:j.messages.map(m=>`${m.role==='user'?'👤 أنت':'🤖 MODYX AI'}:\n${m.content}`).join('\n\n---\n\n')};
}
$('#expTxt').onclick=async()=>{try{const c=await convText();dl(c.title+'.txt',c.title+'\n\n'+c.lines)}catch(e){toast(e.message)}};
$('#expPdf').onclick=()=>{document.body.classList.add('printing');setTimeout(()=>{window.print();setTimeout(()=>document.body.classList.remove('printing'),500)},50)};

/* ---- permanent memory UI ---- */
async function loadMem(){
  try{const j=await api('/api/memory');
    $('#memList').innerHTML=j.memories.length?j.memories.map(m=>`<div class="filechip">🧠 ${esc(m.fact)} <button data-mdel="${m.id}">✕</button></div>`).join(''):'<div class="empty">لا ذكريات بعد — قل «اسمي...» أو «تذكر أن...»</div>';
    $$('#memList [data-mdel]').forEach(b=>b.onclick=async()=>{await api('/api/memory/'+b.dataset.mdel,{method:'DELETE'});loadMem()});
  }catch{}
}
$('#memAdd').onclick=async()=>{const v=$('#memInput').value.trim();if(!v)return;await api('/api/memory',{method:'POST',body:JSON.stringify({fact:v})});$('#memInput').value='';loadMem();toast('تم الحفظ في الذاكرة 🧠')};

/* ---- PWA ---- */
if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}

/* ---- continuous hands-free voice mode ---- */
let loopOn=false;
$('#loopVoice').onclick=async()=>{
  if(!SR){toast('متصفحك لا يدعم التعرف الصوتي — استخدم Chrome');return}
  loopOn=!loopOn;$('#loopVoice').textContent=loopOn?'⏹️ إيقاف المستمر':'🔁 وضع مستمر';
  if(!loopOn){try{speechSynthesis.cancel()}catch{}toast('توقف الوضع المستمر');return}
  toast('🔁 وضع مستمر — تحدث بحرية');
  while(loopOn){
    const said=await listenOnce().catch(()=> '');
    if(!loopOn||!said)break;
    $('#voiceText').value+=said+' ';
    try{
      if(!convId){const j=await api('/api/conversations',{method:'POST',body:JSON.stringify({})});convId=j.id}
      const j=await api('/api/conversations/'+convId+'/messages',{method:'POST',body:JSON.stringify({content:said})});
      lastAnswer=j.reply;loadChats();loadUsage();speak(j.reply);
      await new Promise(r=>{const iv=setInterval(()=>{if(!speechSynthesis.speaking){clearInterval(iv);r()}},400)});
    }catch(e){toast(e.message);break}
  }
  loopOn=false;$('#loopVoice').textContent='🔁 وضع مستمر';
};
function listenOnce(){return new Promise((res,rej)=>{const r=new SR();r.lang=$('#voiceLang').value;r.interimResults=false;r.onresult=e=>res(e[0][0].transcript);r.onerror=rej;r.onend=()=>rej(new Error('no-speech'));r.start()})};

/* subscriptions */
async function loadPlans(){
  try{
    const p=await api('/api/plans');
    $('#payInstr').innerHTML='💳 '+esc(p.payment_instructions||'');
    let me={plan:'free'};
    try{me=await api('/api/subscription/me')}catch{}
    $('#planStatus').innerHTML=me.pending?`⏳ طلبك لخطة <b>${esc(me.pending.plan)}</b> قيد المراجعة...`:`خطتك الحالية: <b>${me.plan==='vip'?'👑 VIP':me.plan==='pro'?'⭐ PRO':me.plan==='developer'?'💻 مطورين':me.plan==='team'?'👥 فرق':'🆓 مجانية'}</b>${me.plan_expires?` (حتى ${esc(me.plan_expires)})`:''}`;
    $('#plansGrid').innerHTML=p.plans.map(pl=>`<div class="card" style="${pl.id===me.plan?'border-color:var(--neon);box-shadow:0 0 18px rgba(0,207,255,.35)':''}"><h4>${esc(pl.name)}</h4><div style="font-size:26px;font-weight:900;color:var(--neon)">${esc(pl.price)} <small style="font-size:12px">${esc(pl.currency)}</small></div><div style="font-size:13px;color:var(--muted)">💬 ${pl.limits.messages} · 📁 ${pl.limits.files} · 🔍 ${pl.limits.searches} / يوم</div><ul style="font-size:14px">${pl.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>${pl.id==='free'?'<div class="empty">خطتك الأساسية</div>':pl.id===me.plan?'<div class="empty">✅ خطتك الحالية</div>':`<button class="btn primary" data-sub="${pl.id}">💎 اشترك الآن</button>`}</div>`).join('');
    $$('#plansGrid [data-sub]').forEach(b=>b.onclick=()=>payForm(b.dataset.sub));
  }catch(e){$('#plansGrid').innerHTML='<div class="empty">❌ '+esc(e.message)+'</div>'}
}
async function payForm(plan){
  const m=await api('/api/payments/methods');
  $('#payBox').innerHTML=`<div class="wcard"><b>💳 الدفع لخطة ${esc(plan)}</b>
    <div class="prow"><select id="payM">${m.methods.map(x=>`<option value="${x.id}">${esc(x.name)}${x.ready===false?' (يدوي)':''} — ${esc(x.hint||'')}</option>`).join('')}</select></div>
    <div class="prow"><input id="payTx" placeholder="رقم العملية/التحويل (للدفع اليدوي)"></div>
    <div class="prow"><button class="btn primary" id="payGo">تأكيد الدفع</button></div></div>`;
  $('#payGo').onclick=async()=>{
    try{const j=await api('/api/payments',{method:'POST',body:JSON.stringify({plan,method:$('#payM').value,tx:$('#payTx').value})});
      toast('✅ '+(j.note||'تم'));$('#payBox').innerHTML='';loadPlans();
    }catch(e){toast(e.message)}
  };
  $('#payBox').scrollIntoView({block:'center'});
}
/* ads (free plan only) */
async function loadAd(placement,el){
  try{
    const j=await api('/api/ads?placement='+placement);
    const box=typeof el==='string'?$(el):el;if(!box)return;
    if(!j.ads?.length){box.innerHTML='';return}
    const a=j.ads[0];
    box.innerHTML=`<div class="filechip" style="justify-content:space-between">📢 <b>${esc(a.title)}</b> <small>${esc((a.body||'').slice(0,60))}</small> <button data-ad="${a.id}" data-link="${esc(a.link||'')}">عرض</button></div>`;
    box.querySelector('[data-ad]').onclick=async e=>{try{await api('/api/ads/'+a.id+'/click',{method:'POST'})}catch{}if(a.link)open(a.link,'_blank')};
  }catch{}
}
async function loadNotif(){try{const j=await api('/api/notifications');$('#notifCount').textContent=j.notifications.length?`(${j.notifications.length})`:'';$('#notifList').innerHTML=j.notifications.length?j.notifications.map(n=>`<div class="card" style="margin:8px 0"><b>${esc(n.title)}</b><p>${esc(n.body)}</p></div>`).join(''):'<div class="empty">لا إشعارات 🎉</div>'}catch{}}
$('#saveSet').onclick=async()=>{
  store.set('lang',$('#setLang').value);store.set('theme',$('#setTheme').value);store.set('font',$('#setFont').value);store.set('accent',$('#setAccent').value||'');applyPrefs();
  try{await api('/api/auth/me',{method:'PUT',body:JSON.stringify({name:$('#setName').value,lang:$('#setLang').value,theme:$('#setTheme').value,avatar:$('#setAvatar').value})});toast('تم الحفظ ✅')}catch(e){toast(e.message)}
};
/* security center: 2FA + sessions + push */
async function loadSec(){
  try{
    const s=await api('/api/sessions');
    $('#sessList').innerHTML='<label>الأجهزة والجلسات النشطة</label>'+s.sessions.map(x=>`<div class="filechip">📱 ${esc((x.ua||'').slice(0,40))||'جهاز'} · ${esc(x.ip||'')} · ${esc(x.last_seen||'')} ${x.revoked?'🚫':'<button data-rev="'+x.jti+'">خروج</button>'}</div>`).join('');
    $$('#sessList [data-rev]').forEach(b=>b.onclick=async()=>{await api('/api/sessions/revoke',{method:'POST',body:JSON.stringify({jti:b.dataset.rev})});loadSec();toast('تم تسجيل الخروج من الجلسة')});
  }catch{}
  try{const p=await api('/api/push/status');$('#pushState').textContent=p.supported?'✅ مدعوم':'⚠️ '+p.reason}catch{}
  const me=user;$('#tfaBox').innerHTML=me?.totp_enabled?'<div class="filechip">🔐 2FA مفعّل ✅</div>':'<button class="btn" id="tfaSetup">🔐 تفعيل المصادقة الثنائية</button>';
  const tb=$('#tfaSetup');if(tb)tb.onclick=async()=>{
    const j=await api('/api/2fa/setup',{method:'POST'});
    const code=prompt('أدخل هذا السر في تطبيق المصادقة (Google Authenticator):\n'+j.secret+'\n\nثم أدخل الرمز المكون من 6 أرقام:');
    if(!code)return;
    try{await api('/api/2fa/enable',{method:'POST',body:JSON.stringify({code})});toast('تم تفعيل 2FA ✅');user.totp_enabled=1;loadSec()}catch(e){toast(e.message)}
  };
}
$('#setPush').onchange=async e=>{
  try{await api('/api/push',{method:'POST',body:JSON.stringify({sub:{ts:Date.now()},enabled:e.target.checked?1:0})});toast(e.target.checked?'تم تفعيل Push (حالة المزود: راجع pushState)':'تم الإيقاف')}catch(err){toast(err.message)}
};
/* custom background */
$('#bgPick').onclick=()=>$('#bgFile').click();
$('#bgFile').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  if(!f.type.startsWith('image/')){toast('اختر صورة فقط');return}
  const fd=new FormData();fd.append('file',f);fd.append('conversation_id','');
  try{
    const r=await fetch('/api/files/upload',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});
    const j=await r.json();if(!r.ok)throw new Error(j.error);
    if(!j.file.url)throw new Error('تعذر إنشاء رابط الصورة');
    await api('/api/auth/me',{method:'PUT',body:JSON.stringify({bg_url:j.file.url})});
    user.bg_url=j.file.url;store.set('bg',user.bg_url);applyBg();toast('تم تعيين الخلفية 🎨');
  }catch(err){toast(err.message)}
  e.target.value='';
};
$('#bgOpacity').oninput=e=>{store.set('bgop',e.target.value);if(user)user.bg_opacity=e.target.value;applyBg()};
$('#bgClear').onclick=async()=>{store.set('bg','');if(user){user.bg_url='';await api('/api/auth/me',{method:'PUT',body:JSON.stringify({bg_url:''})})}applyBg();toast('تمت الإزالة')};
$('#bgOpacity').onchange=async e=>{if(user&&token)try{await api('/api/auth/me',{method:'PUT',body:JSON.stringify({bg_opacity:e.target.value})})}catch{}};
$('#delAcc').onclick=async()=>{if(!confirm('حذف الحساب نهائيًا؟'))return;await api('/api/auth/me',{method:'DELETE'});location.reload()};
function cycleTheme(){const cur=store.get('theme','dark');const nx=cur==='dark'?'purple':cur==='purple'?'green':cur==='green'?'light':'dark';store.set('theme',nx);applyPrefs()}
function cycleLang(){const cur=store.get('lang','ar');store.set('lang',cur==='ar'?'en':cur==='en'?'fr':'ar');applyPrefs()}
$('#langBtn').onclick=cycleLang;
$('#langBtn2').onclick=cycleLang;
$('#themeBtn').onclick=cycleTheme;
$('#themeBtn2').onclick=cycleTheme;
const PLAN_FIELDS=[['plan_pro_price','سعر PRO'],['plan_vip_price','سعر VIP'],['plan_currency','العملة'],['payment_instructions','تعليمات الدفع'],['limit_pro_messages','PRO: رسائل/يوم'],['limit_pro_files','PRO: ملفات/يوم'],['limit_pro_searches','PRO: بحث/يوم'],['limit_vip_messages','VIP: رسائل/يوم'],['limit_vip_files','VIP: ملفات/يوم'],['limit_vip_searches','VIP: بحث/يوم'],['brand_name','اسم العلامة (White Label)'],['brand_emoji','أيقونة العلامة'],['brand_accent','لون العلامة (hex)'],['ads_enabled','الإعلانات (1/0)'],['pay_vodafone_number','رقم فودافون كاش'],['pay_instapay_handle','عنوان انستاباي']];
async function loadAdmin(){
  if(user.role!=='admin')return;
  try{const s=await api('/api/admin/stats');$('#admStats').innerHTML=`👥 ${s.users} · 💬 ${s.conversations} · ✉️ ${s.messages} · 📁 ${s.files}<br>مزود: ${esc(s.provider.provider)} (${esc(s.provider.mode)})`;
    const u=await api('/api/admin/users');$('#admUsers').innerHTML=`<table><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>إجراء</th></tr>${u.users.map(x=>`<tr><td>${esc(x.name)}</td><td dir="ltr">${esc(x.email)}</td><td>${x.blocked?'🚫 محظور':x.role}</td><td>${x.role!=='admin'?`<button data-b="${x.id}" data-s="${x.blocked}">${x.blocked?'✅ فك':'🚫 حظر'}</button>`:''}</td></tr>`).join('')}</table>`;
    $$('#admUsers [data-b]').forEach(b=>b.onclick=async()=>{await api(`/api/admin/users/${b.dataset.b}/${b.dataset.s==='1'?'unblock':'block'}`,{method:'POST'});loadAdmin()});
    const st=await api('/api/admin/settings');$('#limMsg').value=st.settings.daily_messages_limit;$('#limFiles').value=st.settings.daily_files_limit;$('#limSearch').value=st.settings.daily_search_limit;$('#limAnn').value=st.settings.announcement||'';
    $('#planSet').innerHTML=PLAN_FIELDS.map(([k,l])=>`<div><label>${l} <small>(${k})</small></label><input data-pk="${k}" value="${esc(st.settings[k]||'')}" dir="auto"></div>`).join('');
    const subs=await api('/api/admin/subscriptions');
    let payHtml='';
    try{const pay=await api('/api/admin/payments');
      payHtml=pay.payments.map(x=>`<div class="filechip">💳 ${esc(x.email)} → <b>${esc(x.plan)}</b> [${esc(x.method)}:${esc(x.tx)}] [${esc(x.status)}] ${x.status==='pending'?`<button data-pok="${x.id}">✅ تفعيل</button><button data-pno="${x.id}">✕</button>`:''}</div>`).join('');
    }catch{}
    const subHtml=subs.subs.map(x=>`<div class="filechip">💎 ${esc(x.name)} (${esc(x.email)}) → <b>${esc(x.plan)}</b> [${esc(x.status)}] ${x.status==='pending'?`<button data-ok="${x.id}">✅ تفعيل</button><button data-no="${x.id}">✕ رفض</button>`:''}</div>`).join('');
    $('#admSubs').innerHTML=(subHtml+payHtml)||'<div class="empty">لا طلبات.</div>';
    $$('#admSubs [data-ok]').forEach(b=>b.onclick=async()=>{await api(`/api/admin/subscriptions/${b.dataset.ok}/approve`,{method:'POST'});toast('تم التفعيل 💎');loadAdmin()});
    $$('#admSubs [data-no]').forEach(b=>b.onclick=async()=>{await api(`/api/admin/subscriptions/${b.dataset.no}/reject`,{method:'POST'});loadAdmin()});
    $$('#admSubs [data-pok]').forEach(b=>b.onclick=async()=>{await api(`/api/admin/payments/${b.dataset.pok}/approve`,{method:'POST'});toast('تم التفعيل 💳');loadAdmin()});
    $$('#admSubs [data-pno]').forEach(b=>b.onclick=async()=>{await api(`/api/admin/payments/${b.dataset.pno}/reject`,{method:'POST'});loadAdmin()});
    const l=await api('/api/admin/logs');$('#admLogs').innerHTML=l.logs.map(x=>`<div class="filechip">${esc(x.created_at)} — <b>${esc(x.action)}</b> ${esc(x.detail||'')}</div>`).join('')||'—';
  }catch(e){toast(e.message)}
}
$('#admNotify').onclick=async()=>{try{await api('/api/notifications',{method:'POST',body:JSON.stringify({title:$('#admTitle').value,body:$('#admBody').value})});toast('تم الإرسال 📢')}catch(e){toast(e.message)}};
$('#admSave').onclick=async()=>{try{const body={daily_messages_limit:$('#limMsg').value,daily_files_limit:$('#limFiles').value,daily_search_limit:$('#limSearch').value,announcement:$('#limAnn').value};$$('#planSet [data-pk]').forEach(i=>body[i.dataset.pk]=i.value);await api('/api/admin/settings',{method:'PUT',body:JSON.stringify(body)});toast('تم الحفظ ✅')}catch(e){toast(e.message)}};
