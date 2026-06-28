/* =====================================================================
   ОТПУСКНЫЕ (Этап 2)  — по таблице владельца
   ---------------------------------------------------------------------
   За период берутся помесячно дни/часы/ЗП (белые и серые отдельно):
     СЧЗ = Σ ЗП ÷ Σ часы;  отпуск = СЧЗ × дни_отпуска (вводит директор).
     Серый налом (к доплате) = серый_отпуск − белый_отпуск.
   Доступ — RLS (0018): пишет директор, видит директор + сам сотрудник.
   Монтируется в #vacation-root (data-view: director | staff).
   ===================================================================== */
(function () {
  'use strict';
  var ROOT_ID = 'vacation-root';
  var sb = null, me = null;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function money(n){ return (Math.round((+n||0)*100)/100).toLocaleString('ru-RU'); }
  function calc(rows){ var s=0,h=0; (rows||[]).forEach(function(r){ s+=(+r.s||0); h+=(+r.h||0); }); return { sumS:s, sumH:h, scz: h? s/h : 0 }; }

  function injectStyles(){
    if(document.getElementById('vac-styles')) return;
    var css=
      '.vac-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:20px;}'+
      '.vac-wrap{overflow-x:auto;}'+
      '.vac-table{border-collapse:collapse;width:100%;font-size:.85rem;margin-top:8px;}'+
      '.vac-table th,.vac-table td{border:1px solid var(--border);padding:6px 8px;text-align:right;}'+
      '.vac-table th{background:var(--card-bg);font-size:.7rem;text-transform:uppercase;color:var(--text-muted);}'+
      '.vac-table td.l,.vac-table th.l{text-align:left;}'+
      '.vac-table input{width:90px;text-align:right;padding:4px 6px;}'+
      '.vac-table input.m{width:90px;text-align:left;}'+
      '.vac-kpis{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0;}'+
      '.vac-kpi{background:var(--bg,#f7f7f8);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:150px;}'+
      '.vac-kpi b{display:block;font-size:1.3rem;}.vac-kpi span{font-size:.74rem;color:var(--text-muted);}'+
      '.vac-w{color:#2e9e5b;}.vac-g{color:#b58e2e;}'+
      '.vac-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;}@media(max-width:760px){.vac-cols{grid-template-columns:1fr;}}'+
      '.vac-msg{font-size:.85rem;margin-top:10px;min-height:1.1em;}.vac-msg.ok{color:#2e9e5b;}.vac-msg.err{color:#e53935;}.vac-msg.wait{color:var(--text-muted);}'+
      '.vac-empty{color:var(--text-muted);padding:8px 0;}';
    var st=document.createElement('style'); st.id='vac-styles'; st.textContent=css; document.head.appendChild(st);
  }

  function loadStaff(){ return sb.from('payroll_staff').select('id,name').order('name').then(function(r){ if(r.error)throw r.error; return r.data||[]; }); }
  function loadVac(staffId){ return sb.from('payroll_vacation').select('*').eq('staff_id',staffId).order('updated_at',{ascending:false}).limit(1).then(function(r){ if(r.error)throw r.error; return (r.data&&r.data[0])||null; }); }

  /* ================= DIRECTOR ================= */
  function directorView(root){
    var st={ staff:[], staffId:null, rec:null };
    root.innerHTML='<div class="vac-card"><p class="vac-empty">Загрузка…</p></div>';
    loadStaff().then(function(s){ st.staff=s; if(s.length) st.staffId=s[0].id; shell(); })
      .catch(function(e){ root.innerHTML='<div class="vac-card"><p class="vac-msg err">Ошибка: '+esc(e.message||e)+'</p></div>'; });

    function shell(){
      var opts=st.staff.map(function(s){ return '<option value="'+esc(s.id)+'"'+(s.id===st.staffId?' selected':'')+'>'+esc(s.name)+'</option>'; }).join('');
      root.innerHTML='<div class="vac-card"><div class="pr-row" style="display:flex;gap:12px;align-items:flex-end">'+
        '<div><label style="display:block;font-size:.72rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Сотрудник</label>'+
        (st.staff.length?'<select class="form-control" id="vac-staff">'+opts+'</select>':'<span class="vac-empty">Сначала заведите сотрудников в разделе «Зарплаты»</span>')+'</div>'+
        '</div></div><div id="vac-box"></div>';
      var sel=document.getElementById('vac-staff');
      if(sel) sel.addEventListener('change',function(){ st.staffId=sel.value; loadEditor(); });
      if(st.staffId) loadEditor();
    }

    function loadEditor(){
      var box=document.getElementById('vac-box'); box.innerHTML='<div class="vac-card"><p class="vac-empty">Загрузка…</p></div>';
      loadVac(st.staffId).then(function(rec){
        st.rec = rec || { white_rows:[], grey_rows:[], white_days:0, grey_days:0, label:'' };
        if(!st.rec.white_rows.length) st.rec.white_rows=[{m:'',d:'',h:'',s:''}];
        if(!st.rec.grey_rows.length) st.rec.grey_rows=[{m:'',d:'',h:'',s:''}];
        renderEditor();
      });
    }

    function renderEditor(){
      var box=document.getElementById('vac-box');
      box.innerHTML='<div class="vac-card">'+
        '<div class="pr-row" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">'+
          '<div><label style="display:block;font-size:.72rem;text-transform:uppercase;color:var(--text-muted)">Название</label><input class="form-control" id="vac-label" value="'+esc(st.rec.label||'')+'" placeholder="напр. Отпуск июль 2026" style="min-width:220px"></div>'+
          '<div><label style="display:block;font-size:.72rem;text-transform:uppercase;color:var(--text-muted)">Дни отпуска (белый)</label><input class="form-control" id="vac-wd" type="number" step="0.5" value="'+(st.rec.white_days||0)+'" style="width:120px"></div>'+
          '<div><label style="display:block;font-size:.72rem;text-transform:uppercase;color:var(--text-muted)">Дни отпуска (серый)</label><input class="form-control" id="vac-gd" type="number" step="0.5" value="'+(st.rec.grey_days||0)+'" style="width:120px"></div>'+
        '</div>'+
        '<div class="vac-cols" style="margin-top:12px">'+
          tableHtml('white','Белые (помесячно)',st.rec.white_rows)+
          tableHtml('grey','Серые (помесячно)',st.rec.grey_rows)+
        '</div>'+
        '<div id="vac-calc"></div>'+
        '<div class="pr-row" style="margin-top:12px"><button class="btn btn-primary btn-sm" id="vac-save">Сохранить</button></div>'+
        '<div class="vac-msg" id="vac-msg"></div>'+
      '</div>';
      wire();
      renderCalc();
    }
    function tableHtml(kind,title,rows){
      var body=rows.map(function(r,i){ return '<tr data-k="'+kind+'" data-i="'+i+'">'+
        '<td class="l"><input class="m" data-f="m" value="'+esc(r.m||'')+'" placeholder="Месяц"></td>'+
        '<td><input data-f="d" type="number" step="0.5" value="'+(r.d!=null?r.d:'')+'"></td>'+
        '<td><input data-f="h" type="number" step="0.5" value="'+(r.h!=null?r.h:'')+'"></td>'+
        '<td><input data-f="s" type="number" value="'+(r.s!=null?r.s:'')+'"></td>'+
        '<td><button class="btn btn-ghost btn-sm" data-del="'+kind+':'+i+'">✕</button></td></tr>'; }).join('');
      return '<div><strong>'+title+'</strong>'+
        '<div class="vac-wrap"><table class="vac-table" data-tbl="'+kind+'"><thead><tr><th class="l">Месяц</th><th>Дни</th><th>Часы</th><th>ЗП</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div>'+
        '<button class="btn btn-ghost btn-sm" data-add="'+kind+'" style="margin-top:6px">+ месяц</button></div>';
    }
    function readRows(kind){
      var rows=[];
      document.querySelectorAll('tr[data-k="'+kind+'"]').forEach(function(tr){
        var r={}; tr.querySelectorAll('[data-f]').forEach(function(i){ var f=i.getAttribute('data-f'); r[f]= f==='m'? i.value : (i.value===''?'':+i.value); });
        rows.push(r);
      });
      return rows;
    }
    function wire(){
      document.querySelectorAll('[data-add]').forEach(function(b){ b.addEventListener('click',function(){ var k=b.getAttribute('data-add'); st.rec[k+'_rows']=readRows(k); st.rec[k+'_rows'].push({m:'',d:'',h:'',s:''}); renderEditor(); }); });
      document.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click',function(){ var p=b.getAttribute('data-del').split(':'); var k=p[0],i=+p[1]; st.rec.white_rows=readRows('white'); st.rec.grey_rows=readRows('grey'); st.rec[k+'_rows'].splice(i,1); if(!st.rec[k+'_rows'].length) st.rec[k+'_rows'].push({m:'',d:'',h:'',s:''}); renderEditor(); }); });
      document.querySelectorAll('#vac-box input').forEach(function(i){ i.addEventListener('input',renderCalc); });
      document.getElementById('vac-save').addEventListener('click',save);
    }
    function renderCalc(){
      var box=document.getElementById('vac-calc'); if(!box) return;
      var w=calc(readRows('white')), g=calc(readRows('grey'));
      var wd=+document.getElementById('vac-wd').value||0, gd=+document.getElementById('vac-gd').value||0;
      var whiteVac=w.scz*wd, greyVac=g.scz*gd, cash=greyVac-whiteVac;
      box.innerHTML='<div class="vac-kpis">'+
        kpi('СЧЗ белый', money(w.scz))+kpi('СЧЗ серый', money(g.scz))+
        kpi('Белый отпуск', money(whiteVac),'vac-w')+kpi('Серый отпуск', money(greyVac),'vac-g')+
        kpi('К доплате налом', money(cash),'vac-g')+
        '</div>';
    }
    function kpi(l,v,cls){ return '<div class="vac-kpi"><b class="'+(cls||'')+'">'+v+'</b><span>'+l+'</span></div>'; }
    function save(){
      var rec={ staff_id:st.staffId, label:document.getElementById('vac-label').value||null,
        white_rows:readRows('white'), grey_rows:readRows('grey'),
        white_days:+document.getElementById('vac-wd').value||0, grey_days:+document.getElementById('vac-gd').value||0,
        updated_at:new Date().toISOString() };
      var msg=document.getElementById('vac-msg'); msg.textContent='Сохраняем…'; msg.className='vac-msg wait';
      var op = st.rec && st.rec.id
        ? sb.from('payroll_vacation').update(rec).eq('id',st.rec.id)
        : sb.from('payroll_vacation').insert(rec).select('id').single();
      op.then(function(r){ if(r.error)throw r.error; if(r.data&&r.data.id) st.rec.id=r.data.id; msg.textContent='Сохранено ✓'; msg.className='vac-msg ok'; })
        .catch(function(e){ msg.textContent='Ошибка: '+(e.message||e); msg.className='vac-msg err'; });
    }
  }

  /* ================= STAFF (read-only) ================= */
  function staffView(root){
    root.innerHTML='<div class="vac-card"><p class="vac-empty">Загрузка отпускных…</p></div>';
    sb.from('payroll_staff').select('id,name').eq('user_id',me.id).maybeSingle().then(function(r){
      if(!r.data){ root.innerHTML=''; return; }
      return loadVac(r.data.id).then(function(rec){
        if(!rec){ root.innerHTML='<div class="vac-card"><h3 style="margin:0 0 6px">Отпускные</h3><p class="vac-empty">Расчёт отпускных пока не внесён.</p></div>'; return; }
        var w=calc(rec.white_rows), g=calc(rec.grey_rows);
        var whiteVac=w.scz*(+rec.white_days||0), greyVac=g.scz*(+rec.grey_days||0), cash=greyVac-whiteVac;
        root.innerHTML='<div class="vac-card"><h3 style="margin:0 0 8px">Отпускные'+(rec.label?' — '+esc(rec.label):'')+'</h3>'+
          '<div class="vac-kpis">'+
            '<div class="vac-kpi"><b class="vac-w">'+money(whiteVac)+'</b><span>Белый отпуск</span></div>'+
            '<div class="vac-kpi"><b class="vac-g">'+money(greyVac)+'</b><span>Серый отпуск</span></div>'+
            '<div class="vac-kpi"><b class="vac-g">'+money(cash)+'</b><span>К доплате наличными</span></div>'+
          '</div>'+
          '<p class="vac-empty">СЧЗ белый: '+money(w.scz)+' · СЧЗ серый: '+money(g.scz)+' · дни: '+ (rec.white_days||0)+'/'+(rec.grey_days||0)+'</p></div>';
      });
    }).catch(function(e){ root.innerHTML='<div class="vac-card"><p class="vac-msg err">Ошибка: '+esc(e.message||e)+'</p></div>'; });
  }

  function mount(){
    var root=document.getElementById(ROOT_ID); if(!root) return;
    if(!window.SUPA||!window.SUPA.enabled||!window.SUPA.enabled()){ return; }
    sb=window.SUPA.client; injectStyles();
    var view=root.getAttribute('data-view')||'staff';
    window.SUPA.myProfile().then(function(p){
      me=p; if(!me) return;
      if(view==='director'){ if(me.role==='director') directorView(root); }
      else staffView(root);
    }).catch(function(){});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
})();
