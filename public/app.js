
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
  const s = sectionShell("Novo Lançamento", "Preencha e envie. O gestor verá em Pendentes.");
  const msg = document.createElement("div");
  msg.className = "msg hidden";
  s.appendChild(msg);

  const form = document.createElement("form");
  form.className = "section";
  form.style.marginTop = "14px";
  form.innerHTML = `
    <div class="row">
      <div>
        <label class="label">Data</label>
        <input id="fData" type="date" class="input" required />
      </div>
      <div>
        <label class="label">Frota</label>
        <select id="fFrota" class="input"></select>
      </div>
      <div class="grow2">
        <label class="label">Cliente</label>
        <select id="fCliente" class="input" required></select>
      </div>
    </div>
    <div class="row" style="margin-top:10px">
      <div><label class="label">Container 1</label><input id="c1" class="input" placeholder="Ex.: GDLU..." /></div>
      <div><label class="label">Container 2</label><input id="c2" class="input" placeholder="Opcional" /></div>
      <div><label class="label">Container 3</label><input id="c3" class="input" placeholder="Opcional" /></div>
      <div><label class="label">Container 4</label><input id="c4" class="input" placeholder="Opcional" /></div>
    </div>
    <div class="row" style="margin-top:10px">
      <div><label class="label">Tipo</label><input id="fTipo" class="input" placeholder="Rodoviário / Vazio / Redex ..." /></div>
      <div><label class="label">Valor</label><input id="fValor" class="input" inputmode="decimal" placeholder="Ex.: 150,00" /></div>
      <div class="fit" style="align-self:end"><button class="btn btn--primary" type="submit">Enviar</button></div>
    </div>
  `;
  s.appendChild(form);
  s.appendChild(msg);
  host.appendChild(s);

  const init = await api("init", {});
  const clientes = init.clientes || [];
  const frotas = init.frotas || [];

  const selCli = form.querySelector("#fCliente");
  selCli.innerHTML = `<option value="">Selecione...</option>` + clientes.map(c => `<option>${c.Cliente}</option>`).join("");

  const selFro = form.querySelector("#fFrota");
  selFro.innerHTML = `<option value="">Selecione...</option>` + frotas.map(f => `<option>${f.Frota}</option>`).join("");
  if (state.session.user.FrotaPadrao) selFro.value = state.session.user.FrotaPadrao;

  const d = new Date();
  form.querySelector("#fData").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    setMsg(msg,"","");
    const frete = {
      Data: form.querySelector("#fData").value,
      Frota: form.querySelector("#fFrota").value,
      Cliente: form.querySelector("#fCliente").value,
      Container1: form.querySelector("#c1").value,
      Container2: form.querySelector("#c2").value,
      Container3: form.querySelector("#c3").value,
      Container4: form.querySelector("#c4").value,
      Tipo: form.querySelector("#fTipo").value,
      Valor: form.querySelector("#fValor").value
    };
    try{
      await api("salvarFreteMotorista", { frete });
      toast("Enviado com sucesso.");
      form.reset();
      form.querySelector("#fData").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }catch(err){
      setMsg(msg, err.message || String(err), "error");
    }
  };
}

async function renderMeusLancamentos(host){
  const s = sectionShell("Meus Lançamentos", "Acompanhe pendentes, aprovados e reprovados.");
  const msg = document.createElement("div");
  msg.className = "msg hidden";
  s.appendChild(msg);

  const holder = document.createElement("div");
  holder.style.marginTop = "14px";
  s.appendChild(holder);
  host.appendChild(s);

  try{
    const data = await api("getLancamentosMotorista", {});
    holder.innerHTML = "";

    const pend = (data.aprovacao || []).map(r => ({
      "Data": fmtDate(r.Data),
      "AnoMes": r.AnoMes || "",
      "Cliente": r.Cliente || "",
      "Tipo": r.Tipo || "",
      "Valor": fmtMoney(r.Valor),
      "Status": { __html: `<span class="badge badge--pend">PENDENTE</span>` }
    }));
    const aprov = (data.lancamentos || []).map(r => ({
      "Data": fmtDate(r.Data),
      "AnoMes": r.AnoMes || "",
      "Cliente": r.Cliente || "",
      "Tipo": r.Tipo || "",
      "Valor": fmtMoney(r.Valor),
      "Status": { __html: `<span class="badge badge--ok">APROVADO</span>` }
    }));
    const rep = (data.reprovados || []).map(r => ({
      "Data": fmtDate(r.Data),
      "AnoMes": r.AnoMes || "",
      "Cliente": r.Cliente || "",
      "Tipo": r.Tipo || "",
      "Valor": fmtMoney(r.Valor),
      "Status": { __html: `<span class="badge badge--no">REPROVADO</span>` },
      "Justificativa": r.Justificativa || ""
    }));

    const box1 = sectionShell("Pendentes", "");
    box1.appendChild(makeTable(["Data","AnoMes","Cliente","Tipo","Valor","Status"], pend.length?pend:[{"Data":"—","AnoMes":"","Cliente":"","Tipo":"","Valor":"","Status":""}]));
    holder.appendChild(box1);

    const box2 = sectionShell("Aprovados", "");
    box2.appendChild(makeTable(["Data","AnoMes","Cliente","Tipo","Valor","Status"], aprov.length?aprov:[{"Data":"—","AnoMes":"","Cliente":"","Tipo":"","Valor":"","Status":""}]));
    holder.appendChild(box2);

    const box3 = sectionShell("Reprovados", "");
    box3.appendChild(makeTable(["Data","AnoMes","Cliente","Tipo","Valor","Status","Justificativa"], rep.length?rep:[{"Data":"—","AnoMes":"","Cliente":"","Tipo":"","Valor":"","Status":"","Justificativa":""}]));
    holder.appendChild(box3);

  }catch(err){
    setMsg(msg, err.message || String(err), "error");
  }
}

/* -------------------- LOGIN -------------------- */

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
