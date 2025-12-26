
/**
 * Ziran Logística — Controle de Fretes (Cloudflare)
 * Frontend SPA: login + fluxo gestor/motorista
 */

const CONFIG = {
  apiPath: "/api",
  proxySecret: "", // se usar PROXY_SHARED_SECRET no Cloudflare, repita aqui.
  sessionStorageKey: "ziran_fretes_session_v1",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  session: null,
  initData: null,
  tab: null,
};

function toast(msg, ms=3200){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.add("hidden"), ms);
}

function setMsg(el, text, kind="error"){
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("hidden","msg--error","msg--ok");
  el.classList.add(kind === "ok" ? "msg--ok" : "msg--error");
  if (!text) el.classList.add("hidden");
}

async function api(action, payload){
  const body = { action, payload: payload || {} };

  if (state.session?.token && action !== "login") {
    body.payload = body.payload || {};
    body.payload.auth = body.payload.auth || {};
    body.payload.auth.token = state.session.token;
    body.payload.auth.email = state.session.user?.Email || state.session.user?.email;
  }

  const headers = { "Content-Type": "application/json" };
  if (CONFIG.proxySecret) headers["X-Proxy-Secret"] = CONFIG.proxySecret;

  const res = await fetch(CONFIG.apiPath, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch(e) {
    throw new Error("Resposta inválida do servidor.");
  }
  if (!json.success) throw new Error(json.message || "Erro desconhecido.");
  return json.data;
}

function saveSession(sess){
  state.session = sess;
  localStorage.setItem(CONFIG.sessionStorageKey, JSON.stringify(sess));
}

function loadSession(){
  const raw = localStorage.getItem(CONFIG.sessionStorageKey);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e){ return null; }
}

function clearSession(){
  state.session = null;
  state.initData = null;
  localStorage.removeItem(CONFIG.sessionStorageKey);
}

function showApp(){
  $("#viewLogin").classList.add("hidden");
  $("#viewApp").classList.remove("hidden");
  $("#btnLogout").classList.remove("hidden");
  const pill = $("#userPill");
  pill.textContent = `${state.session.user.Nome} • ${state.session.user.Perfil}`;
  pill.classList.remove("hidden");
}

function showLogin(){
  $("#viewLogin").classList.remove("hidden");
  $("#viewApp").classList.add("hidden");
  $("#btnLogout").classList.add("hidden");
  $("#userPill").classList.add("hidden");
}

function buildTabs(){
  const perfil = (state.session?.user?.Perfil || "").toLowerCase();
  const tabs = [];

  if (perfil === "gestor") {
    tabs.push({ id:"pendentes", label:"Pendentes de Aprovação", render: renderPendentes });
    tabs.push({ id:"hist_aprov", label:"Histórico Aprovados", render: renderHistAprov });
    tabs.push({ id:"hist_reprov", label:"Histórico Reprovados", render: renderHistReprov });
    tabs.push({ id:"relatorios", label:"Relatórios", render: renderRelatorios });
    tabs.push({ id:"cadastros", label:"Cadastros", render: renderCadastros });
  } else {
    tabs.push({ id:"novo", label:"Novo Lançamento", render: renderNovoLancamento });
    tabs.push({ id:"meus", label:"Meus Lançamentos", render: renderMeusLancamentos });
  }

  const nav = $("#tabs");
  nav.innerHTML = "";
  tabs.forEach(t => {
    const b = document.createElement("button");
    b.className = "tab";
    b.textContent = t.label;
    b.onclick = () => selectTab(t.id, tabs);
    b.dataset.tab = t.id;
    nav.appendChild(b);
  });

  selectTab(tabs[0]?.id, tabs);
}

async function selectTab(id, tabs){
  state.tab = id;
  $$("#tabs .tab").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  const t = tabs.find(x => x.id === id);
  const host = $("#tabContent");
  host.innerHTML = "";
  await t.render(host);
}

async function bootstrapFromSession(){
  const sess = loadSession();
  if (!sess?.token) return false;

  try{
    state.session = sess;
    const data = await api("init", { auth: { token: sess.token, email: sess.user.Email } });
    state.session.user = data.currentUser;
    state.initData = { clientes: data.clientes || [], frotas: data.frotas || [], usuarios: data.usuarios || [] };
    saveSession(state.session);
    showApp();
    buildTabs();
    return true;
  }catch(err){
    clearSession();
    return false;
  }
}

/* -------------------- UI HELPERS -------------------- */

function sectionShell(title, subtitle){
  const wrap = document.createElement("div");
  wrap.className = "section";
  wrap.innerHTML = `
    <div class="row">
      <div class="grow3">
        <h2>${title}</h2>
        ${subtitle ? `<div class="muted">${subtitle}</div>` : ""}
      </div>
    </div>
  `;
  return wrap;
}

function makeTable(columns, rows){
  const wrap = document.createElement("div");
  wrap.className = "tableWrap";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  columns.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c;
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    columns.forEach(c => {
      const td = document.createElement("td");
      const v = r[c];
      if (v && v.__html) td.innerHTML = v.__html;
      else td.textContent = v ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function fmtMoney(n){
  const v = Number(n || 0);
  return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function fmtDate(d){
  if (!d) return "";
  try{
    const dt = new Date(d);
    if (isNaN(dt)) return String(d);
    return dt.toLocaleDateString("pt-BR");
  }catch(e){
    return String(d);
  }
}

function parseMoney(v){
  if (v == null) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  // remove currency and spaces
  const cleaned = s.replace(/R\$|\s/g,'').replace(/\./g,'').replace(',', '.');
  const num = Number(cleaned);
  return isFinite(num) ? num : 0;
}

function ymFromAnoMes(v){
  if (!v) return '';
  // if already "YYYY-MM"
  const s = String(v);
  const m1 = s.match(/^(\d{4})-(\d{2})$/);
  if (m1) return `${m1[1]}-${m1[2]}`;
  // ISO date or Date string
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    return `${y}-${m}`;
  }
  // fallback: try first 7 chars
  const m2 = s.match(/^(\d{4})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return '';
}

function ymPrev(ym){
  const m = String(ym||'').match(/^(\d{4})-(\d{2})$/);
  if(!m) return '';
  let y = Number(m[1]);
  let mo = Number(m[2]);
  mo -= 1;
  if (mo === 0){ mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2,'0')}`;
}

function ymCompare(a,b){
  return String(a).localeCompare(String(b));
}


/* -------------------- TAB: PENDENTES (GESTOR) -------------------- */

async function renderPendentes(host){
  const s = sectionShell("Pendentes de Aprovação", "Aprove/reprove e clique em Processar Selecionados.");
  const row = document.createElement("div");
  row.className = "row";

  const search = document.createElement("input");
  search.className = "input grow3";
  search.placeholder = "Buscar por motorista, cliente, frota, tipo...";

  const btnReload = document.createElement("button");
  btnReload.className = "btn btn--ghost fit";
  btnReload.textContent = "Atualizar";

  const btnProcess = document.createElement("button");
  btnProcess.className = "btn btn--primary fit";
  btnProcess.textContent = "Processar Selecionados";

  row.appendChild(search);
  row.appendChild(btnReload);
  row.appendChild(btnProcess);
  s.appendChild(row);

  const msg = document.createElement("div");
  msg.className = "msg hidden";
  s.appendChild(msg);

  const holder = document.createElement("div");
  holder.style.marginTop = "14px";
  s.appendChild(holder);

  host.appendChild(s);

  let data = [];
  async function load(){
    setMsg(msg, "", "ok");
    holder.innerHTML = "<div class='muted'>Carregando...</div>";
    try{
      data = await api("getPendentesGestor", {});
      renderTable();
    }catch(err){
      holder.innerHTML = "";
      setMsg(msg, err.message || String(err), "error");
    }
  }

  function renderTable(){
    const q = (search.value || "").trim().toLowerCase();
    const filtered = data.filter(r => {
      if (!q) return true;
      const blob = Object.values(r).join(" ").toLowerCase();
      return blob.includes(q);
    });

    holder.innerHTML = "";
    if (!filtered.length){
      holder.innerHTML = "<div class='muted'>Nenhum pendente.</div>";
      return;
    }

    const rows = filtered.map(r => ({
      "Sel": { __html: `<input type="checkbox" class="sel" data-row="${r._row}">` },
      "Data": fmtDate(r.Data),
      "Motorista": r.Motorista || "",
      "Cliente": r.Cliente || "",
      "Frota": r.Frota || "",
      "Tipo": r.Tipo || "",
      "Valor": fmtMoney(r.Valor),
      "Decisão": { __html: `
        <select class="input" style="padding:8px 10px" data-row="${r._row}">
          <option value="">—</option>
          <option value="APROVADO">APROVAR</option>
          <option value="REPROVADO">REPROVAR</option>
        </select>
      `},
      "Obs.": { __html: `<input class="input obs" style="padding:8px 10px" placeholder="Observação (opcional)" data-row="${r._row}">` },
    }));

    holder.appendChild(makeTable(["Sel","Data","Motorista","Cliente","Frota","Tipo","Valor","Decisão","Obs."], rows));
  }

  btnReload.onclick = load;
  search.oninput = renderTable;

  btnProcess.onclick = async () => {
    const sels = Array.from(holder.querySelectorAll("input.sel:checked"));
    if (!sels.length) return toast("Selecione ao menos 1 lançamento.");

    const decisoes = sels.map(chk => {
      const row = Number(chk.dataset.row);
      const sel = holder.querySelector(`select[data-row="${row}"]`);
      const obs = holder.querySelector(`input.obs[data-row="${row}"]`);
      return { row, status: sel?.value || "", observacao: obs?.value || "" };
    }).filter(d => d.status);

    if (!decisoes.length) return toast("Defina APROVAR/REPROVAR para os selecionados.");

    btnProcess.disabled = true;
    btnProcess.style.opacity = .7;
    try{
      const res = await api("processarPendentes", { decisoes });
      toast(`Processados: ${res.processed}`);
      await load();
    }catch(err){
      toast(err.message || String(err));
    }finally{
      btnProcess.disabled = false;
      btnProcess.style.opacity = 1;
    }
  };

  await load();
}

/* -------------------- TAB: HISTÓRICOS / RELATÓRIOS (GESTOR) -------------------- */

async function renderHistAprov(host){
  const s = sectionShell("Histórico Aprovados", "Consulta de lançamentos aprovados.");
  const msg = document.createElement("div");
  msg.className = "msg hidden";
  s.appendChild(msg);
  const holder = document.createElement("div");
  holder.style.marginTop = "14px";
  s.appendChild(holder);
  host.appendChild(s);

  try{
    const h = await api("getHistoricoGestor", {});
    const rows = (h.aprovados || []).map(r => ({
      "Data": fmtDate(r.Data),
      "AnoMes": r.AnoMes || "",
      "Motorista": r.Motorista || "",
      "Cliente": r.Cliente || "",
      "Tipo": r.Tipo || "",
      "Valor": fmtMoney(r.Valor),
      "Obs.": r["Observação Gestor"] || ""
    }));
    holder.appendChild(makeTable(["Data","AnoMes","Motorista","Cliente","Tipo","Valor","Obs."], rows));
  }catch(err){
    setMsg(msg, err.message || String(err), "error");
  }
}

async function renderHistReprov(host){
  const s = sectionShell("Histórico Reprovados", "Consulta de lançamentos reprovados.");
  const msg = document.createElement("div");
  msg.className = "msg hidden";
  s.appendChild(msg);
  const holder = document.createElement("div");
  holder.style.marginTop = "14px";
  s.appendChild(holder);
  host.appendChild(s);

  try{
    const h = await api("getHistoricoGestor", {});
    const rows = (h.reprovados || []).map(r => ({
      "Data": fmtDate(r.Data),
      "AnoMes": r.AnoMes || "",
      "Motorista": r.Motorista || "",
      "Cliente": r.Cliente || "",
      "Tipo": r.Tipo || "",
      "Valor": fmtMoney(r.Valor),
      "Justificativa": r.Justificativa || ""
    }));
    holder.appendChild(makeTable(["Data","AnoMes","Motorista","Cliente","Tipo","Valor","Justificativa"], rows));
  }catch(err){
    setMsg(msg, err.message || String(err), "error");
  }
}

async function renderRelatorios(host){
  const s = sectionShell("Relatórios", "Resumo por mês e por motorista.");
  const msg = document.createElement("div");
  msg.className = "msg hidden";
  s.appendChild(msg);

  const cards = document.createElement("div");
  cards.className = "row";
  s.appendChild(cards);

  const charts = document.createElement("div");
  charts.className = "row";
  charts.style.marginTop = "14px";
  s.appendChild(charts);

  host.appendChild(s);

  try{
    const r = await api("getRelatorioGestor", {});
    cards.innerHTML = `
      <div class="section" style="box-shadow:none">
        <div class="muted">Fretes aprovados</div>
        <div style="font-size:24px;font-weight:900">${r.totalFretesAprov || 0}</div>
      </div>
      <div class="section" style="box-shadow:none">
        <div class="muted">Fretes reprovados</div>
        <div style="font-size:24px;font-weight:900">${r.totalFretesReprov || 0}</div>
      </div>
      <div class="section" style="box-shadow:none">
        <div class="muted">Valor aprovado</div>
        <div style="font-size:24px;font-weight:900">${fmtMoney(r.totalValorAprov || 0)}</div>
      </div>
    `;

    charts.innerHTML = "";
    const c1 = document.createElement("canvas");
    c1.height = 140;
    const c2 = document.createElement("canvas");
    c2.height = 140;

    const box1 = document.createElement("div");
    box1.className = "section";
    box1.innerHTML = `<h3 style="margin:0 0 8px">Por mês</h3>`;
    box1.appendChild(c1);

    const box2 = document.createElement("div");
    box2.className = "section";
    box2.innerHTML = `<h3 style="margin:0 0 8px">Por motorista (Top 10)</h3>`;
    box2.appendChild(c2);

    charts.appendChild(box1);
    charts.appendChild(box2);

    const porMes = r.porMes || [];
    new Chart(c1.getContext("2d"), {
      type:"bar",
      data:{ labels: porMes.map(x => x.mes), datasets:[{ label:"R$ aprovado", data: porMes.map(x => Number(x.valor || 0)) }] },
      options:{ responsive:true, plugins:{ legend:{ display:false } } }
    });

    const porMot = (r.porMotoristaArr || []).slice().sort((a,b)=>b.valor-a.valor).slice(0,10);
    new Chart(c2.getContext("2d"), {
      type:"bar",
      data:{ labels: porMot.map(x => x.motorista), datasets:[{ label:"R$ aprovado", data: porMot.map(x => Number(x.valor || 0)) }] },
      options:{ indexAxis:"y", responsive:true, plugins:{ legend:{ display:false } } }
    });

  }catch(err){
    setMsg(msg, err.message || String(err), "error");
  }
}

/* -------------------- TAB: CADASTROS (GESTOR) -------------------- */

async function renderCadastros(host){
  const s = sectionShell("Cadastros", "Clientes e Frotas (usuários você edita direto na planilha).");
  const msg = document.createElement("div");
  msg.className = "msg hidden";
  s.appendChild(msg);

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <div class="section" style="box-shadow:none">
      <h3 style="margin:0 0 10px">Adicionar Cliente</h3>
      <div class="row">
        <input id="cliNome" class="input grow3" placeholder="Nome do cliente" />
        <button id="btnAddCli" class="btn btn--primary fit">Adicionar</button>
      </div>
    </div>
    <div class="section" style="box-shadow:none">
      <h3 style="margin:0 0 10px">Adicionar Frota</h3>
      <div class="row">
        <input id="froNum" class="input grow3" placeholder="Número da frota" />
        <button id="btnAddFro" class="btn btn--primary fit">Adicionar</button>
      </div>
    </div>
  `;
  s.appendChild(row);

  const usersBox = document.createElement("div");
  usersBox.className = "section";
  usersBox.style.marginTop = "14px";
  usersBox.innerHTML = `<h3 style="margin:0 0 10px">Usuários</h3><div class="muted">Para editar, altere direto na aba Usuarios.</div>`;
  s.appendChild(usersBox);

  host.appendChild(s);

  try{
    const data = await api("init", {});
    const users = (data.usuarios || []).map(u => ({
      "Nome": u.Nome || "",
      "Email": u.Email || "",
      "Perfil": u.Perfil || "",
      "Ativo": u.Ativo || "",
      "FrotaPadrao": u.FrotaPadrao || "",
    }));
    usersBox.appendChild(makeTable(["Nome","Email","Perfil","Ativo","FrotaPadrao"], users));
  }catch(err){
    setMsg(msg, err.message || String(err), "error");
  }

  $("#btnAddCli").onclick = async () => {
    const nome = ($("#cliNome").value || "").trim();
    if (!nome) return toast("Informe o nome do cliente.");
    try{
      await api("addCliente", { nome });
      toast("Cliente adicionado.");
      $("#cliNome").value = "";
    }catch(err){
      toast(err.message || String(err));
    }
  };

  $("#btnAddFro").onclick = async () => {
    const numero = ($("#froNum").value || "").trim();
    if (!numero) return toast("Informe a frota.");
    try{
      await api("addFrota", { numero });
      toast("Frota adicionada.");
      $("#froNum").value = "";
    }catch(err){
      toast(err.message || String(err));
    }
  };
}

/* -------------------- MOTORISTA: NOVO / MEUS -------------------- */

async function renderNovoLancamento(host){
  host.innerHTML = sectionShell("Novo Lançamento", `
    <form id="frmNovo" class="form-grid">
      <div class="field">
        <label>Data</label>
        <input type="date" id="fData" required />
      </div>

      <div class="field">
        <label>Frota</label>
        <select id="fFrota" required>
          <option value="">Selecione...</option>
          ${(state.initData?.frotas||[]).map(f=>`<option value="${esc(f.Frota)}">${esc(f.Frota)}${f.Modelo?` — ${esc(f.Modelo)}`:''}</option>`).join("")}
        </select>
        <div class="hint">Dica: escolha a frota para evitar digitação fora do padrão.</div>
      </div>

      <div class="field">
        <label>Cliente</label>
        <select id="fCliente" required>
          <option value="">Selecione...</option>
          ${(state.initData?.clientes||[]).map(c=>`<option value="${esc(c.Cliente)}">${esc(c.Cliente)}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>Tipo</label>
        <select id="fTipo" required>
          <option value="">Selecione...</option>
          ${[
            "Rodoviário","Cheio","Vazio","Redex","Bônus OP.RODO","Diária","Outro..."
          ].map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("")}
        </select>
        <input type="text" id="fTipoOutro" placeholder="Informe o tipo..." style="display:none;margin-top:8px" />
      </div>

      <div class="field">
        <label>Valor (R$)</label>
        <input type="text" id="fValor" inputmode="decimal" placeholder="Ex.: 350,00" required />
        <div class="hint">Aceita vírgula. O sistema formata automaticamente.</div>
      </div>

      <div class="field">
        <label>Container 1 (opcional)</label>
        <input type="text" id="fC1" maxlength="11" placeholder="ABCD1234567" />
      </div>
      <div class="field">
        <label>Container 2 (opcional)</label>
        <input type="text" id="fC2" maxlength="11" placeholder="ABCD1234567" />
      </div>
      <div class="field">
        <label>Container 3 (opcional)</label>
        <input type="text" id="fC3" maxlength="11" placeholder="ABCD1234567" />
      </div>
      <div class="field">
        <label>Container 4 (opcional)</label>
        <input type="text" id="fC4" maxlength="11" placeholder="ABCD1234567" />
      </div>

      <div class="field full">
        <label>Observação (opcional)</label>
        <input type="text" id="fObs" maxlength="120" placeholder="Ex.: viagem com 2 containers" />
      </div>

      <div class="actions">
        <button class="primary" id="btnSalvarLancamento" type="submit">Enviar lançamento</button>
      </div>
      <div id="novoMsg" class="msg" style="display:none"></div>
    </form>
  `);

  const form = $("#frmNovo");
  const msg = $("#novoMsg");
  const setMsg = (text, kind="warn")=>{
    msg.style.display = "block";
    msg.className = `msg ${kind}`;
    msg.textContent = text;
  };

  // defaults
  $("#fData").valueAsDate = new Date();

  // Tipo "Outro..."
  $("#fTipo").addEventListener("change", ()=>{
    const v = $("#fTipo").value;
    const other = $("#fTipoOutro");
    if (v === "Outro..."){
      other.style.display = "block";
      other.required = true;
      other.focus();
    } else {
      other.style.display = "none";
      other.required = false;
      other.value = "";
    }
  });

  // container sanitize
  const sanitizeContainer = (el)=>{
    el.value = el.value.toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9]/g,'').slice(0,11);
  };
  ["#fC1","#fC2","#fC3","#fC4"].forEach(id=>{
    const el = $(id);
    el.addEventListener("input", ()=>sanitizeContainer(el));
  });

  // money sanitize
  const moneyEl = $("#fValor");
  moneyEl.addEventListener("blur", ()=>{
    const v = parseMoney(moneyEl.value);
    moneyEl.value = v ? v.toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2}) : "";
  });

  form.onsubmit = async (ev)=>{
    ev.preventDefault();
    msg.style.display = "none";

    const tipoSel = $("#fTipo").value.trim();
    const tipo = (tipoSel === "Outro...") ? $("#fTipoOutro").value.trim() : tipoSel;

    const payload = {
      pin: state.auth.pin,
      email: state.auth.email,
      data: $("#fData").value,
      frota: $("#fFrota").value.trim(),
      cliente: $("#fCliente").value.trim(),
      tipo,
      valor: parseMoney($("#fValor").value),
      container1: $("#fC1").value.trim(),
      container2: $("#fC2").value.trim(),
      container3: $("#fC3").value.trim(),
      container4: $("#fC4").value.trim(),
      obs: $("#fObs").value.trim(),
    };

    if (!payload.data || !payload.frota || !payload.cliente || !payload.tipo) {
      return setMsg("Preencha Data, Frota, Cliente e Tipo.");
    }
    if (!(payload.valor > 0)) {
      return setMsg("Informe um valor válido (maior que zero).");
    }

    const btn = $("#btnSalvarLancamento");
    btn.disabled = true;
    btn.textContent = "Enviando...";

    try{
      const res = await api("salvarFreteMotorista", payload);
      setMsg(res?.message || "Lançamento enviado com sucesso.", "ok");
      form.reset();
      $("#fData").valueAsDate = new Date();
    }catch(e){
      setMsg(e?.message || "Erro ao enviar lançamento. Tente novamente.");
    }finally{
      btn.disabled = false;
      btn.textContent = "Enviar lançamento";
    }
  };
}

async function renderMeusLancamentos(host){
  host.innerHTML = sectionShell("Meus Lançamentos", `
    <div class="subtabs" id="meusTabs">
      <button class="subtab active" data-tab="pendentes">Pendentes</button>
      <button class="subtab" data-tab="aprovados">Aprovados</button>
      <button class="subtab" data-tab="reprovados">Reprovados</button>
      <div class="subtabs-spacer"></div>
      <button class="btn" id="btnRefreshMeus">Atualizar</button>
    </div>
    <div id="meusContent">
      <div class="skeleton">
        <div class="sk-line"></div>
        <div class="sk-line"></div>
        <div class="sk-line"></div>
      </div>
    </div>
  `);

  const content = $("#meusContent");
  const tabsEl = $("#meusTabs");

  const load = async ()=>{
    content.innerHTML = `
      <div class="skeleton">
        <div class="sk-line"></div>
        <div class="sk-line"></div>
        <div class="sk-line"></div>
      </div>
    `;
    const data = await api("getLancamentosMotorista", { pin: state.auth.pin, email: state.auth.email });
    state.motoristaData = data || {};
    renderTab(state.motoristaView || "pendentes");
  };

  const rowsHtml = (rows, status)=>{
    if (!rows?.length) {
      return `<div class="empty">Nenhum lançamento encontrado.</div>`;
    }
    const showJust = status === "reprovados";
    return `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>AnoMes</th>
              <th>Cliente</th>
              <th>Tipo</th>
              <th class="right">Valor</th>
              <th>Status</th>
              ${showJust ? `<th>Justificativa</th>` : ``}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>{
              const ym = ymFromAnoMes(r.AnoMes);
              return `
                <tr>
                  <td>${esc(r.Data||"")}</td>
                  <td>${esc(ym||"")}</td>
                  <td>${esc(r.Cliente||"")}</td>
                  <td>${esc(r.Tipo||"")}</td>
                  <td class="right">${fmtMoney(parseMoney(r.Valor))}</td>
                  <td><span class="tag ${status==='pendentes'?'pend':status==='aprovados'?'ok':'bad'}">${status==='pendentes'?'PENDENTE':status==='aprovados'?'APROVADO':'REPROVADO'}</span></td>
                  ${showJust ? `<td>${esc(r.Justificativa||"")}</td>` : ``}
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  const approvedSummaryHtml = (aprovados)=>{
    const monthly = new Map(); // ym -> total
    (aprovados||[]).forEach(r=>{
      const ym = ymFromAnoMes(r.AnoMes);
      const val = parseMoney(r.Valor);
      if(!ym) return;
      monthly.set(ym, (monthly.get(ym)||0) + val);
    });

    const months = Array.from(monthly.keys()).sort(ymCompare);
    const currentYm = months.length ? months[months.length-1] : ymFromAnoMes(new Date());
    const prevYm = ymPrev(currentYm);

    const totalCur = monthly.get(currentYm) || 0;
    const totalPrev = monthly.get(prevYm) || 0;

    const varPct = totalPrev > 0 ? ((totalCur - totalPrev)/totalPrev)*100 : (totalCur>0 ? 100 : 0);
    const varLabel = (totalPrev>0) ? `${varPct>=0?'+':''}${varPct.toFixed(0)}%` : (totalCur>0 ? "+100%" : "0%");

    const options = months.map(m=>`<option value="${esc(m)}"${m===currentYm?' selected':''}>${esc(m)}</option>`).join("");

    return `
      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-title">Aprovado (mês)</div>
          <div class="kpi-value">${fmtMoney(totalCur)}</div>
          <div class="kpi-sub">${esc(currentYm || "-")}</div>
        </div>
        <div class="kpi">
          <div class="kpi-title">Mês anterior</div>
          <div class="kpi-value">${fmtMoney(totalPrev)}</div>
          <div class="kpi-sub">${esc(prevYm || "-")}</div>
        </div>
        <div class="kpi">
          <div class="kpi-title">Variação</div>
          <div class="kpi-value">${varLabel}</div>
          <div class="kpi-sub">Comparação mensal</div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="card-h">
          <div>
            <div class="muted">Selecionar mês</div>
            <select id="drvMonthSel" class="select-inline">${options || `<option value="${esc(currentYm)}">${esc(currentYm)}</option>`}</select>
          </div>
        </div>
        <div class="card-b">
          <canvas id="drvApprovedChart" height="120"></canvas>
        </div>
      </div>
    `;
  };

  const renderApprovedChart = (monthlyMap, selectedYm)=>{
    const months = Array.from(monthlyMap.keys()).sort(ymCompare);
    const last = months.slice(Math.max(0, months.length-6));
    const data = last.map(m=>monthlyMap.get(m) || 0);

    const ctx = $("#drvApprovedChart")?.getContext?.("2d");
    if(!ctx) return;

    // destroy previous
    if (state.motoristaApprovedChart){
      try{ state.motoristaApprovedChart.destroy(); }catch(_){}
      state.motoristaApprovedChart = null;
    }

    state.motoristaApprovedChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: last,
        datasets: [{
          label: "R$ aprovado",
          data,
          borderWidth: 1,
          backgroundColor: "rgba(171,22,27,0.35)",
          borderColor: "rgba(171,22,27,0.8)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: (v)=> Number(v).toLocaleString("pt-BR") } }
        }
      }
    });
  };

  const renderTab = (tab)=>{
    state.motoristaView = tab;

    // active style
    tabsEl.querySelectorAll(".subtab").forEach(b=>{
      b.classList.toggle("active", b.dataset.tab === tab);
    });

    const data = state.motoristaData || {};
    const pend = data.pendentes || [];
    const aprov = data.aprovados || [];
    const repr = data.reprovados || [];

    if (tab === "pendentes"){
      content.innerHTML = rowsHtml(pend, "pendentes");
      return;
    }
    if (tab === "reprovados"){
      content.innerHTML = rowsHtml(repr, "reprovados");
      return;
    }

    // aprovados tab with summary
    const monthly = new Map();
    (aprov||[]).forEach(r=>{
      const ym = ymFromAnoMes(r.AnoMes);
      if(!ym) return;
      monthly.set(ym, (monthly.get(ym)||0) + parseMoney(r.Valor));
    });
    const months = Array.from(monthly.keys()).sort(ymCompare);
    const defaultYm = months.length ? months[months.length-1] : ymFromAnoMes(new Date());

    content.innerHTML = `
      ${approvedSummaryHtml(aprov)}
      <div style="margin-top:14px"></div>
      ${rowsHtml(aprov, "aprovados")}
    `;

    // wire month select + chart
    const sel = $("#drvMonthSel");
    if (sel){
      sel.onchange = ()=>{
        const ym = sel.value;
        // update KPI numbers by re-rendering approved tab but keep selected
        // quick patch: recompute KPIs in-place
        const prev = ymPrev(ym);
        const curVal = monthly.get(ym) || 0;
        const prevVal = monthly.get(prev) || 0;
        const varPct = prevVal > 0 ? ((curVal - prevVal)/prevVal)*100 : (curVal>0 ? 100 : 0);
        const varLabel = (prevVal>0) ? `${varPct>=0?'+':''}${varPct.toFixed(0)}%` : (curVal>0 ? "+100%" : "0%");

        const kpis = content.querySelectorAll(".kpi");
        if (kpis?.length >= 3){
          kpis[0].querySelector(".kpi-value").textContent = fmtMoney(curVal);
          kpis[0].querySelector(".kpi-sub").textContent = ym || "-";
          kpis[1].querySelector(".kpi-value").textContent = fmtMoney(prevVal);
          kpis[1].querySelector(".kpi-sub").textContent = prev || "-";
          kpis[2].querySelector(".kpi-value").textContent = varLabel;
        }
        renderApprovedChart(monthly, ym);
      };
      // set to default and draw
      sel.value = defaultYm;
      sel.onchange();
    } else {
      renderApprovedChart(monthly, defaultYm);
    }
  };

  tabsEl.addEventListener("click", (e)=>{
    const btn = e.target.closest(".subtab");
    if (!btn) return;
    renderTab(btn.dataset.tab);
  });

  $("#btnRefreshMeus").onclick = load;

  await load();
}

async function doLogin(email, pin){
  const data = await api("login", { email, pin });
  saveSession({ token: data.token, user: data.currentUser });
  state.initData = { clientes: data.clientes || [], frotas: data.frotas || [], usuarios: data.usuarios || [] };
  showApp();
  buildTabs();
}

$("#loginForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const msg = $("#loginMsg");
  setMsg(msg,"","");
  const email = ($("#loginEmail").value || "").trim().toLowerCase();
  const pin = ($("#loginPin").value || "").trim();

  if (!email) return setMsg(msg, "Informe o e-mail.", "error");
  if (!pin) return setMsg(msg, "Informe o PIN (matrícula).", "error");

  try{
    await doLogin(email, pin);
  }catch(err){
    setMsg(msg, err.message || String(err), "error");
  }
});

$("#btnLogout").addEventListener("click", () => {
  clearSession();
  showLogin();
  toast("Saiu do sistema.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(()=>{}));
}

(async function(){
  const ok = await bootstrapFromSession();
  if (!ok) showLogin();
})();
