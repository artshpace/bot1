/* =====================================================================
   ЗАРПЛАТЫ ПЕДАГОГОВ (Этап 1 — месячная ведомость, КЗ-2026)
   ---------------------------------------------------------------------
   Формулы повторяют ведомость владельца («Белая зп» / «Серая зп»).
   Доступ — RLS (0017): пишет только директор, читает директор + сам сотрудник.

   Два режима по data-view у #payroll-root:
     • "director" (admin-payroll.html) — ввод табеля, ставки, МРП; сводка ЗП+налоги.
     • "staff"    (payroll.html)        — сотрудник видит ТОЛЬКО свою ЗП (read-only).
   ===================================================================== */
(function () {
  'use strict';
  var ROOT_ID = 'payroll-root';
  var sb = null, me = null, MRP = 4325;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function money(n){ return (Math.round((+n||0)*100)/100).toLocaleString('ru-RU'); }
  function pad2(n){ return (n<10?'0':'')+n; }
  function monthTitle(y,m){ var names=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']; return names[m]+' '+y; }
  function sumDays(days){ var s=0; if(days) for(var k in days){ s+=(+days[k]||0); } return s; }

  /* ---- РАСЧЁТ (точно как в ведомости) ---- */
  function computeWhite(hours, rate, mrp){
    var accrued = (+hours||0)*(+rate||0);              // начислено (AM)
    var opv  = accrued*0.10;                            // ОПВ 10% (AN)
    var opvr = accrued<85000 ? 2975 : accrued*0.035;    // ОПВР 3.5% / min 2975 (AO)
    var so   = Math.max(4250, (accrued-opv)*0.05);      // СО 5% / min 4250 (AP)
    var vosms= accrued*0.02;                            // ВОСМС 2% (AQ)
    var osms = accrued*0.03;                            // ОСМС 3% (AR)
    var ipn  = Math.max(0, (accrued-opv-vosms-(mrp*30))*0.10); // ИПН 10%, вычет МРП*30 (AS)
    var net  = accrued-opv-vosms-ipn;                   // К ВЫДАЧЕ (AT)
    return { hours:+hours||0, accrued:accrued, opv:opv, opvr:opvr, so:so, vosms:vosms, osms:osms, ipn:ipn, net:net };
  }

  function injectStyles(){
    if(document.getElementById('pr-styles')) return;
    var css=
      '.pr-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:20px;}'+
      '.pr-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;}'+
      '.pr-row label{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin-bottom:4px;}'+
      '.pr-month{display:flex;align-items:center;gap:8px;}.pr-month b{min-width:130px;text-align:center;}'+
      '.pr-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:8px;}'+
      '.pr-table{border-collapse:collapse;width:100%;font-size:.85rem;}'+
      '.pr-table th,.pr-table td{border:1px solid var(--border);padding:7px 9px;text-align:right;white-space:nowrap;}'+
      '.pr-table th{background:var(--card-bg);font-size:.7rem;text-transform:uppercase;color:var(--text-muted);}'+
      '.pr-table td.l,.pr-table th.l{text-align:left;}'+
      '.pr-days{display:flex;flex-wrap:wrap;gap:3px;}'+
      '.pr-days input{width:40px;text-align:center;padding:4px 2px;}'+
      '.pr-days .d{display:flex;flex-direction:column;align-items:center;font-size:.62rem;color:var(--text-muted);}'+
      '.pr-tot{font-weight:700;}'+
      '.pr-net-w{color:#2e9e5b;font-weight:700;}.pr-net-g{color:#b58e2e;font-weight:700;}'+
      '.pr-msg{font-size:.85rem;margin-top:10px;min-height:1.1em;}.pr-msg.ok{color:#2e9e5b;}.pr-msg.err{color:#e53935;}.pr-msg.wait{color:var(--text-muted);}'+
      '.pr-empty{color:var(--text-muted);padding:8px 0;}'+
      '.pr-kpis{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0;}'+
      '.pr-kpi{background:var(--bg,#f7f7f8);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:130px;}'+
      '.pr-kpi b{display:block;font-size:1.3rem;}.pr-kpi span{font-size:.74rem;color:var(--text-muted);}'+
      '.pr-edit{background:rgba(201,168,76,.06);}';
    var st=document.createElement('style'); st.id='pr-styles'; st.textContent=css; document.head.appendChild(st);
  }
  function hideMock(){ ['admin-payroll-root','payroll-mock-root'].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display='none'; }); }

  /* ---- data ---- */
  function loadConfig(year){ return sb.from('payroll_config').select('mrp').eq('year',year).maybeSingle().then(function(r){ return r.data? (+r.data.mrp||4325):4325; }); }
  function loadStaff(){ return sb.from('payroll_staff').select('id,name,position,user_id,active').order('name').then(function(r){ if(r.error)throw r.error; return r.data||[]; }); }
  function loadTimesheets(period){ return sb.from('payroll_timesheets').select('*').eq('period',period).then(function(r){ if(r.error)throw r.error; return r.data||[]; }); }

  /* ================= DIRECTOR ================= */
  function directorView(root){
    var now=new Date(); var st={ y:now.getFullYear(), m:now.getMonth(), staff:[], ts:{}, editId:null };

    root.innerHTML='<div class="pr-card"><p class="pr-empty">Загрузка…</p></div>';
    reload();

    function period(){ return st.y+'-'+pad2(st.m+1); }
    function reload(){
      Promise.all([loadConfig(st.y), loadStaff(), loadTimesheets(period())]).then(function(res){
        MRP=res[0]; st.staff=res[1];
        st.ts={}; res[2].forEach(function(t){ st.ts[t.staff_id+'|'+t.kind]=t; });
        render();
      }).catch(function(e){ root.innerHTML='<div class="pr-card"><p class="pr-msg err">Ошибка: '+esc(e.message||e)+'</p></div>'; });
    }
    function tsFor(id,kind){ return st.ts[id+'|'+kind] || { days:{}, hourly_rate:0, work_days:0, worked:0 }; }

    function render(){
      var rows = st.staff.map(function(s){
        var w=tsFor(s.id,'white'), g=tsFor(s.id,'grey');
        var cw=computeWhite(sumDays(w.days), w.hourly_rate, MRP);
        var gAccr=sumDays(g.days)*(+g.hourly_rate||0);
        var gNet=gAccr-cw.net;
        return '<tr>'+
          '<td class="l">'+esc(s.name)+'<br><span class="pr-empty" style="font-size:.72rem">'+esc(s.position||'')+(s.user_id?' · 🔗':'')+'</span></td>'+
          '<td>'+money(cw.hours)+'</td>'+
          '<td class="pr-net-w">'+money(cw.net)+'</td>'+
          '<td class="pr-net-g">'+money(gNet)+'</td>'+
          '<td class="pr-tot">'+money(cw.net+gNet)+'</td>'+
          '<td class="l"><button class="btn btn-outline btn-sm" data-edit="'+esc(s.id)+'">Табель</button>'+
            '<br><select class="form-control pr-link" data-link="'+esc(s.id)+'" style="min-width:170px;margin-top:6px"><option value="">— привязать аккаунт —</option></select></td>'+
        '</tr>';
      }).join('');

      root.innerHTML=
        '<div class="pr-card">'+
          '<div class="pr-row" style="justify-content:space-between">'+
            '<div class="pr-month"><button class="btn btn-ghost btn-sm" id="pr-prev">‹</button><b id="pr-mt">'+monthTitle(st.y,st.m)+'</b><button class="btn btn-ghost btn-sm" id="pr-next">›</button></div>'+
            '<div class="pr-row"><div><label>МРП '+st.y+'</label><input class="form-control" id="pr-mrp" type="number" value="'+MRP+'" style="width:110px"></div>'+
            '<button class="btn btn-ghost btn-sm" id="pr-savemrp">Сохранить МРП</button></div>'+
          '</div>'+
          '<p class="pr-empty" style="margin:6px 0 0">Вычет по ИПН = МРП × 30 = '+money(MRP*30)+' ₸</p>'+
        '</div>'+
        '<div class="pr-card">'+
          '<div class="pr-wrap"><table class="pr-table">'+
            '<thead><tr><th class="l">Сотрудник</th><th>Часы (бел.)</th><th>Белая (на карту)</th><th>Серая (налом)</th><th>Итого на руки</th><th class="l">Табель / аккаунт</th></tr></thead>'+
            '<tbody>'+(rows||'<tr><td colspan="6" class="pr-empty">Сотрудников нет.</td></tr>')+'</tbody>'+
          '</table></div>'+
          '<div class="pr-row" style="margin-top:12px"><div><label>Новый сотрудник</label><input class="form-control" id="pr-nn" placeholder="ФИО"></div>'+
          '<div><label>Должность</label><input class="form-control" id="pr-np" placeholder="напр. Педагог по гитаре"></div>'+
          '<button class="btn btn-primary btn-sm" id="pr-add">Добавить</button></div>'+
          '<div class="pr-msg" id="pr-msg"></div>'+
        '</div>'+
        '<div id="pr-editbox"></div>';

      document.getElementById('pr-prev').addEventListener('click',function(){ step(-1); });
      document.getElementById('pr-next').addEventListener('click',function(){ step(1); });
      document.getElementById('pr-savemrp').addEventListener('click',saveMrp);
      document.getElementById('pr-add').addEventListener('click',addStaff);
      root.querySelectorAll('[data-edit]').forEach(function(b){ b.addEventListener('click',function(){ renderEdit(b.getAttribute('data-edit')); }); });
      populateLinks();
      if(st.editId) renderEdit(st.editId);
    }

    function populateLinks(){
      var sels=root.querySelectorAll('.pr-link'); if(!sels.length) return;
      sb.from('profiles').select('id,name,role').in('role',['teacher','admin','director']).order('name').then(function(r){
        var accs=(r.data||[]);
        sels.forEach(function(sel){
          var sid=sel.getAttribute('data-link');
          var s=st.staff.filter(function(x){return x.id===sid;})[0];
          accs.forEach(function(a){ var o=document.createElement('option'); o.value=a.id; o.textContent=a.name||a.id; if(s&&s.user_id===a.id) o.selected=true; sel.appendChild(o); });
          sel.addEventListener('change',function(){
            sb.from('payroll_staff').update({user_id: sel.value||null}).eq('id',sid).then(function(x){ if(!x.error){ if(s) s.user_id=sel.value||null; msg('Аккаунт привязан.','ok'); } else msg('Ошибка: '+x.error.message,'err'); });
          });
        });
      });
    }
    function step(d){ st.m+=d; if(st.m<0){st.m=11;st.y--;} if(st.m>11){st.m=0;st.y++;} st.editId=null; reload(); }
    function msg(t,k){ var el=document.getElementById('pr-msg'); if(el){ el.textContent=t||''; el.className='pr-msg'+(k?' '+k:''); } }

    function saveMrp(){
      var v=+document.getElementById('pr-mrp').value||0;
      sb.from('payroll_config').upsert({year:st.y, mrp:v},{onConflict:'year'}).then(function(r){ if(r.error){msg('Ошибка: '+r.error.message,'err');return;} MRP=v; reload(); });
    }
    function addStaff(){
      var n=(document.getElementById('pr-nn').value||'').trim(); var p=(document.getElementById('pr-np').value||'').trim();
      if(!n){ msg('Введите ФИО.','err'); return; }
      sb.from('payroll_staff').insert({name:n, position:p||null}).then(function(r){ if(r.error){msg('Ошибка: '+r.error.message,'err');return;} reload(); });
    }

    function renderEdit(id){
      st.editId=id;
      var s=st.staff.filter(function(x){return x.id===id;})[0]; if(!s) return;
      var box=document.getElementById('pr-editbox');
      function grid(kind){
        var t=tsFor(id,kind);
        var cells=''; for(var d=1; d<=31; d++){ cells+='<div class="d">'+d+'<input type="number" step="0.5" min="0" data-day="'+d+'" value="'+(t.days&&t.days[d]!=null?t.days[d]:'')+'"></div>'; }
        return '<div class="pr-card pr-edit" data-kind="'+kind+'">'+
          '<strong>'+(kind==='white'?'Белая ведомость':'Серая ведомость')+'</strong>'+
          '<div class="pr-days" style="margin:8px 0">'+cells+'</div>'+
          '<div class="pr-row"><div><label>Часовая ставка</label><input class="form-control pr-rate" type="number" value="'+(t.hourly_rate||0)+'" style="width:120px"></div>'+
          '<div><label>Раб. дни</label><input class="form-control pr-wd" type="number" value="'+(t.work_days||0)+'" style="width:90px"></div>'+
          '<div><label>Отработано</label><input class="form-control pr-wk" type="number" value="'+(t.worked||0)+'" style="width:90px"></div>'+
          '<button class="btn btn-primary btn-sm pr-save">Сохранить '+(kind==='white'?'белую':'серую')+'</button></div>'+
        '</div>';
      }
      box.innerHTML='<div class="pr-card"><h3 style="margin:0 0 4px">Табель — '+esc(s.name)+'</h3>'+
        '<p class="pr-empty" style="margin:0 0 8px">Впишите часы по дням месяца (можно дробные, напр. 3.5).</p>'+
        grid('white')+grid('grey')+
        '<div id="pr-calc"></div>'+
        '<button class="btn btn-ghost btn-sm" id="pr-close" style="margin-top:8px">Закрыть табель</button>'+
        '<div class="pr-msg" id="pr-emsg"></div></div>';
      box.querySelectorAll('[data-kind]').forEach(function(g){
        g.querySelector('.pr-save').addEventListener('click',function(){ saveSheet(id, g); });
        g.addEventListener('input',function(){ renderCalc(id); });
      });
      document.getElementById('pr-close').addEventListener('click',function(){ st.editId=null; box.innerHTML=''; });
      renderCalc(id);
    }
    function readGrid(g){
      var days={}; g.querySelectorAll('[data-day]').forEach(function(i){ var v=i.value.trim(); if(v!=='') days[i.getAttribute('data-day')]=+v; });
      return { days:days, hourly_rate:+g.querySelector('.pr-rate').value||0, work_days:+g.querySelector('.pr-wd').value||0, worked:+g.querySelector('.pr-wk').value||0 };
    }
    function renderCalc(id){
      var box=document.getElementById('pr-calc'); if(!box) return;
      var gw=document.querySelector('#pr-editbox [data-kind="white"]'), gg=document.querySelector('#pr-editbox [data-kind="grey"]');
      var w=readGrid(gw), g=readGrid(gg);
      var cw=computeWhite(sumDays(w.days), w.hourly_rate, MRP);
      var gAccr=sumDays(g.days)*g.hourly_rate; var gNet=gAccr-cw.net;
      box.innerHTML='<div class="pr-kpis">'+
        kpi('Часы (бел.)', money(cw.hours))+kpi('Начислено', money(cw.accrued))+
        kpi('Белая к выдаче', money(cw.net), 'pr-net-w')+kpi('Серая (налом)', money(gNet), 'pr-net-g')+
        kpi('Итого на руки', money(cw.net+gNet))+
        '</div>'+
        '<div class="pr-wrap"><table class="pr-table"><thead><tr><th class="l">Налог/взнос</th><th>Сумма ₸</th></tr></thead><tbody>'+
        trow('ОПВ 10%',cw.opv)+trow('ОПВР 3.5%',cw.opvr)+trow('СО 5%',cw.so)+trow('ВОСМС 2%',cw.vosms)+trow('ОСМС 3%',cw.osms)+trow('ИПН 10%',cw.ipn)+
        '</tbody></table></div>';
    }
    function kpi(label,val,cls){ return '<div class="pr-kpi"><b class="'+(cls||'')+'">'+val+'</b><span>'+label+'</span></div>'; }
    function trow(l,v){ return '<tr><td class="l">'+l+'</td><td>'+money(v)+'</td></tr>'; }

    function saveSheet(id, g){
      var kind=g.getAttribute('data-kind'); var d=readGrid(g);
      var emsg=document.getElementById('pr-emsg'); emsg.textContent='Сохраняем…'; emsg.className='pr-msg wait';
      sb.from('payroll_timesheets').upsert({ staff_id:id, period:period(), kind:kind, days:d.days, hourly_rate:d.hourly_rate, work_days:d.work_days, worked:d.worked, updated_at:new Date().toISOString() }, {onConflict:'staff_id,period,kind'})
        .then(function(r){ if(r.error)throw r.error; st.ts[id+'|'+kind]=Object.assign({staff_id:id,period:period(),kind:kind},d); emsg.textContent='Сохранено ✓'; emsg.className='pr-msg ok'; })
        .catch(function(e){ emsg.textContent='Ошибка: '+(e.message||e); emsg.className='pr-msg err'; });
    }
  }

  /* ================= STAFF (read-only own salary) ================= */
  function staffView(root){
    var now=new Date(); var st={ y:now.getFullYear(), m:now.getMonth(), staff:null };
    root.innerHTML='<div class="pr-card"><p class="pr-empty">Загрузка…</p></div>';
    sb.from('payroll_staff').select('id,name,position').eq('user_id',me.id).maybeSingle().then(function(r){
      if(!r.data){ root.innerHTML='<div class="pr-card"><p class="pr-empty">Данных по зарплате пока нет. Они появятся, когда директор внесёт табель и привяжет ваш аккаунт.</p></div>'; return; }
      st.staff=r.data; loadConfig(st.y).then(function(mrp){ MRP=mrp; render(); });
    }).catch(function(e){ root.innerHTML='<div class="pr-card"><p class="pr-msg err">Ошибка: '+esc(e.message||e)+'</p></div>'; });

    function period(){ return st.y+'-'+pad2(st.m+1); }
    function render(){
      root.innerHTML='<div class="pr-card"><div class="pr-month" style="justify-content:center">'+
        '<button class="btn btn-ghost btn-sm" id="ps-prev">‹</button><b id="ps-mt">'+monthTitle(st.y,st.m)+'</b><button class="btn btn-ghost btn-sm" id="ps-next">›</button></div>'+
        '<div id="ps-body" style="margin-top:12px"><p class="pr-empty">Загрузка…</p></div></div>';
      document.getElementById('ps-prev').addEventListener('click',function(){ stepm(-1); });
      document.getElementById('ps-next').addEventListener('click',function(){ stepm(1); });
      loadBody();
    }
    function stepm(d){ st.m+=d; if(st.m<0){st.m=11;st.y--;} if(st.m>11){st.m=0;st.y++;} loadConfig(st.y).then(function(mrp){MRP=mrp; document.getElementById('ps-mt').textContent=monthTitle(st.y,st.m); loadBody();}); }
    function loadBody(){
      var body=document.getElementById('ps-body');
      loadTimesheets(period()).then(function(list){
        var w=list.filter(function(t){return t.kind==='white';})[0]||{days:{},hourly_rate:0};
        var g=list.filter(function(t){return t.kind==='grey';})[0]||{days:{},hourly_rate:0};
        var cw=computeWhite(sumDays(w.days), w.hourly_rate, MRP);
        var gAccr=sumDays(g.days)*(+g.hourly_rate||0); var gNet=gAccr-cw.net;
        if(!cw.hours && !gAccr){ body.innerHTML='<p class="pr-empty">За '+monthTitle(st.y,st.m)+' данных нет.</p>'; return; }
        body.innerHTML='<div class="pr-kpis">'+
          kpi('Часы',money(cw.hours))+kpi('Начислено',money(cw.accrued))+
          kpi('Белая (на карту)',money(cw.net),'pr-net-w')+kpi('Серая (наличкой)',money(gNet),'pr-net-g')+
          kpi('Итого на руки',money(cw.net+gNet))+'</div>'+
          '<div class="pr-wrap"><table class="pr-table"><thead><tr><th class="l">Налог/взнос</th><th>Сумма ₸</th></tr></thead><tbody>'+
          trow('ОПВ 10%',cw.opv)+trow('ОПВР 3.5%',cw.opvr)+trow('СО 5%',cw.so)+trow('ВОСМС 2%',cw.vosms)+trow('ОСМС 3%',cw.osms)+trow('ИПН 10%',cw.ipn)+
          '</tbody></table></div>'+
          '<p class="pr-empty" style="margin-top:6px">Белая ЗП — на карту, налоги платит студия сверх. Серая — наличными.</p>';
      }).catch(function(e){ body.innerHTML='<p class="pr-msg err">Ошибка: '+esc(e.message||e)+'</p>'; });
    }
    function kpi(label,val,cls){ return '<div class="pr-kpi"><b class="'+(cls||'')+'">'+val+'</b><span>'+label+'</span></div>'; }
    function trow(l,v){ return '<tr><td class="l">'+l+'</td><td>'+money(v)+'</td></tr>'; }
  }

  function mount(){
    var root=document.getElementById(ROOT_ID); if(!root) return;
    if(!window.SUPA||!window.SUPA.enabled||!window.SUPA.enabled()){ root.innerHTML='<div class="pr-card"><p class="pr-empty">Раздел доступен после входа через аккаунт студии.</p></div>'; return; }
    sb=window.SUPA.client; injectStyles(); hideMock();
    var view=root.getAttribute('data-view')||'staff';
    root.innerHTML='<div class="pr-card"><p class="pr-empty">Загрузка…</p></div>';
    window.SUPA.myProfile().then(function(p){
      me=p;
      if(!me){ root.innerHTML='<div class="pr-card"><p class="pr-empty">Войдите в аккаунт.</p></div>'; return; }
      if(view==='director'){
        if(me.role!=='director'){ root.innerHTML='<div class="pr-card"><p class="pr-empty">Раздел зарплат доступен только директору.</p></div>'; return; }
        directorView(root);
      } else { staffView(root); }
    }).catch(function(e){ root.innerHTML='<div class="pr-card"><p class="pr-msg err">Ошибка: '+esc(e.message||e)+'</p></div>'; });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
})();
