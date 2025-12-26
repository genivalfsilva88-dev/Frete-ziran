
/************************************************************
 * ZIRAN LOGÍSTICA — Controle de Fretes (API para Cloudflare)
 * Backend Google Apps Script (Google Sheets)
 *
 * Abas (nomes exatos):
 * - Respostas ao formulário 1
 * - Aprovacao
 * - Lancamentos
 * - Reprovado
 * - Usuarios
 * - Clientes
 * - Frotas
 ************************************************************/

var CONFIG = {
  AUTO_IMPORTAR_AO_LISTAR_PENDENTES: true,
  SESSION_TTL_SECONDS: 6 * 60 * 60,
  REQUIRE_PIN: true,
  ALLOW_GESTOR_WITHOUT_PIN: false,
  PIN_HEADER: 'PIN',
};

/* ------------------------ Utils ------------------------ */

function getSS_(){ return SpreadsheetApp.getActiveSpreadsheet(); }

function normKey_(s){
  return String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,'');
}

function getSheetByAlias_(alias){
  var target = normKey_(alias);
  var sheets = getSS_().getSheets();
  for (var i=0;i<sheets.length;i++){
    if (normKey_(sheets[i].getName()) === target) return sheets[i];
  }
  throw new Error('Aba não encontrada: ' + alias);
}

function getHeaderMap_(sh){
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1,1,1,lastCol).getValues()[0] || [];
  var map = {};
  for (var i=0;i<headers.length;i++){
    var k = normKey_(headers[i]);
    if (k && map[k] == null) map[k] = i;
  }
  return { headers: headers, map: map };
}

function ensureColumn_(sh, info, colName){
  var k = normKey_(colName);
  if (info.map[k] != null) return info;
  sh.getRange(1, info.headers.length+1).setValue(colName);
  return getHeaderMap_(sh);
}

function setRow_(row, info, key, value){
  var c = info.map[normKey_(key)];
  if (c == null) return;
  row[c] = value;
}

function getRow_(row, info, key){
  var c = info.map[normKey_(key)];
  if (c == null) return '';
  return row[c];
}

function firstNonEmpty_(){
  for (var i=0;i<arguments.length;i++){
    var v = arguments[i];
    if (v !== null && v !== undefined && String(v).trim() !== '') return v;
  }
  return '';
}

function upper_(v){ return String(v||'').trim().toUpperCase(); }

function safeNumber_(v){
  var s = String(v||'').trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.\-]/g,'');
  if (s.indexOf(',')>=0 && s.indexOf('.')>=0) s = s.replace(/\./g,'').replace(',','.');
  else if (s.indexOf(',')>=0) s = s.replace(',','.');
  var n = Number(s);
  return isNaN(n) ? 0 : n;
}

function parseDateFlexible_(v){
  if (!v) return null;
  if (Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v)) return v;

  if (typeof v === 'number'){
    if (v > 100000000000) { var dms=new Date(v); return isNaN(dms)?null:dms; }
    if (v > 2000 && v < 80000){
      var epoch=new Date(Date.UTC(1899,11,30));
      var dSerial=new Date(epoch.getTime()+v*86400000);
      return isNaN(dSerial)?null:dSerial;
    }
    var dn=new Date(v); return isNaN(dn)?null:dn;
  }

  var s = String(v).trim();
  var mBR = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mBR){
    var dd=Number(mBR[1]), mm=Number(mBR[2]), yy=Number(mBR[3]);
    var d=new Date(yy,mm-1,dd);
    return isNaN(d)?null:d;
  }
  var mISO = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mISO){
    var d2=new Date(Number(mISO[1]),Number(mISO[2])-1,Number(mISO[3]));
    return isNaN(d2)?null:d2;
  }
  var d3=new Date(s);
  return isNaN(d3)?null:d3;
}

function anoMesText_(v){
  var d = parseDateFlexible_(v);
  if (!d) return '';
  var y=d.getFullYear();
  if (y<2000 || y>2100) return '';
  var m=('0'+(d.getMonth()+1)).slice(-2);
  return y+'-'+m;
}

function makeToken_(){
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid()+'|'+Date.now()+'|'+Math.random());
  return raw.map(function(b){ var v=(b<0?b+256:b).toString(16); return v.length===1?'0'+v:v; }).join('');
}

function cache_(){ return CacheService.getScriptCache(); }
function saveSession_(token, obj){ cache_().put('sess:'+token, JSON.stringify(obj), CONFIG.SESSION_TTL_SECONDS); }
function loadSession_(token){
  var v = cache_().get('sess:'+token);
  if (!v) return null;
  try { return JSON.parse(v); } catch(e){ return null; }
}

function requireAuth_(payload){
  var auth = (payload && payload.auth) || {};
  var token = String(auth.token||'').trim();
  var sess = loadSession_(token);
  if (!sess) throw new Error('Sessão inválida ou expirada. Faça login novamente.');
  return sess;
}

function getEmailFromPayload_(payload){
  return String(firstNonEmpty_(payload && payload.email, payload && payload.userEmail, payload && payload.auth && payload.auth.email) || '').trim().toLowerCase();
}

/* ------------------------ Base tables ------------------------ */

function findUsuarioByEmail_(email){
  var e = String(email||'').trim().toLowerCase();
  if (!e) return null;

  var sh = getSheetByAlias_('Usuarios');
  var info = getHeaderMap_(sh);
  info = ensureColumn_(sh, info, CONFIG.PIN_HEADER);
  info = getHeaderMap_(sh);

  var last = sh.getLastRow();
  if (last <= 1) return null;

  var values = sh.getRange(2,1,last-1,info.headers.length).getValues();
  var colEmail = info.map[normKey_('Email')];

  for (var i=0;i<values.length;i++){
    var r = values[i];
    var re = colEmail!=null ? String(r[colEmail]).trim().toLowerCase() : '';
    if (re === e){
      return {
        Nome: String(getRow_(r,info,'Nome')||'').trim(),
        Email: e,
        Perfil: String(getRow_(r,info,'Perfil')||'Motorista').trim(),
        Ativo: String(getRow_(r,info,'Ativo')||'').trim(),
        FrotaPadrao: String(getRow_(r,info,'FrotaPadrao')||'').trim(),
        PIN: String(getRow_(r,info,CONFIG.PIN_HEADER)||'').trim(),
      };
    }
  }
  return null;
}

function listUsuarios_(){
  var sh=getSheetByAlias_('Usuarios');
  var info=getHeaderMap_(sh);
  info=ensureColumn_(sh,info,CONFIG.PIN_HEADER);
  info=getHeaderMap_(sh);

  var out=[];
  var last=sh.getLastRow();
  if (last<=1) return out;

  var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
  for (var i=0;i<values.length;i++){
    var r=values[i];
    out.push({
      Nome: String(getRow_(r,info,'Nome')||'').trim(),
      Email: String(getRow_(r,info,'Email')||'').trim().toLowerCase(),
      Perfil: String(getRow_(r,info,'Perfil')||'Motorista').trim(),
      Ativo: String(getRow_(r,info,'Ativo')||'').trim(),
      FrotaPadrao: String(getRow_(r,info,'FrotaPadrao')||'').trim(),
    });
  }
  return out;
}

function listClientes_(){
  var sh=getSheetByAlias_('Clientes');
  var info=getHeaderMap_(sh);
  var last=sh.getLastRow();
  var out=[];
  if (last<=1) return out;

  var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
  for (var i=0;i<values.length;i++){
    var r=values[i];
    var nome = firstNonEmpty_(getRow_(r,info,'Cliente'), r[0]);
    if (String(nome||'').trim()!=='') out.push({Cliente:nome});
  }
  return out;
}

function listFrotas_(){
  var sh=getSheetByAlias_('Frotas');
  var info=getHeaderMap_(sh);
  var last=sh.getLastRow();
  var out=[];
  if (last<=1) return out;

  var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
  for (var i=0;i<values.length;i++){
    var r=values[i];
    var v = firstNonEmpty_(getRow_(r,info,'Frota'), r[0]);
    if (String(v||'').trim()!=='') out.push({Frota:v});
  }
  return out;
}

/* ------------------------ Auth flows ------------------------ */

function login_(payload){
  var email = getEmailFromPayload_(payload);
  var pin = String(payload && payload.pin || '').trim();

  if (!email) throw new Error('E-mail não informado.');
  var user = findUsuarioByEmail_(email);
  if (!user) throw new Error('Usuário não cadastrado na aba Usuarios.');
  if (upper_(user.Ativo) !== 'SIM') throw new Error('Usuário inativo na aba Usuarios.');

  var isGestor = normKey_(user.Perfil) === normKey_('Gestor');

  if (CONFIG.REQUIRE_PIN){
    if (!pin){
      if (!(isGestor && CONFIG.ALLOW_GESTOR_WITHOUT_PIN)) throw new Error('PIN obrigatório.');
    } else {
      if (!user.PIN) throw new Error('PIN não cadastrado para este usuário. Peça ao gestor para cadastrar.');
      if (String(user.PIN) !== String(pin)) throw new Error('PIN inválido.');
    }
  } else {
    if (pin && user.PIN && String(user.PIN) !== String(pin)) throw new Error('PIN inválido.');
  }

  var token = makeToken_();
  saveSession_(token, { email: email, perfil: user.Perfil, nome: user.Nome, issuedAt: new Date().toISOString() });

  return {
    token: token,
    currentUser: user,
    usuarios: listUsuarios_(),
    clientes: listClientes_(),
    frotas: listFrotas_(),
  };
}

function init_(payload){
  var currentUser = null;
  try {
    var sess = requireAuth_(payload);
    currentUser = findUsuarioByEmail_(sess.email);
  } catch(e){}
  return {
    authenticated: !!currentUser,
    currentUser: currentUser,
    usuarios: listUsuarios_(),
    clientes: listClientes_(),
    frotas: listFrotas_(),
  };
}

function ensureGestor_(payload){
  var sess = requireAuth_(payload);
  var user = findUsuarioByEmail_(sess.email);
  if (!user) throw new Error('Usuário inválido.');
  if (normKey_(user.Perfil) !== normKey_('Gestor')) throw new Error('Acesso permitido apenas ao gestor.');
  return user;
}

/* ------------------------ Motorista: lançamento ------------------------ */

function salvarFreteMotorista_(payload){
  var sess = requireAuth_(payload);
  var email = sess.email;

  var user = findUsuarioByEmail_(email);
  if (!user) throw new Error('Usuário não encontrado.');
  if (normKey_(user.Perfil) === normKey_('Gestor')) throw new Error('Gestor não pode lançar frete como motorista.');

  var frete = (payload && payload.frete) || {};
  var sh = getSheetByAlias_('Respostas ao formulário 1');
  var info = getHeaderMap_(sh);

  var cols = ['ID','Timestamp','Data','Motorista','Email Motorista','Frota','Cliente','Container 1','Container 2','Container 3','Container 4','Tipo','Valor','Status','Observação Gestor','Status de Transferência','AnoMes','Tipo de Lançamento'];
  for (var i=0;i<cols.length;i++) info = ensureColumn_(sh, info, cols[i]);
  info = getHeaderMap_(sh);

  var row = new Array(info.headers.length).fill('');
  var dt = parseDateFlexible_(firstNonEmpty_(frete.Data, frete.data)) || new Date();
  var id = Utilities.getUuid(); // simples e confiável

  setRow_(row,info,'ID',id);
  setRow_(row,info,'Timestamp',new Date());
  setRow_(row,info,'Data',dt);
  setRow_(row,info,'AnoMes',anoMesText_(dt));
  setRow_(row,info,'Motorista',user.Nome);
  setRow_(row,info,'Email Motorista',email);
  setRow_(row,info,'Frota',firstNonEmpty_(frete.Frota, frete.frota, user.FrotaPadrao));
  setRow_(row,info,'Cliente',firstNonEmpty_(frete.Cliente, frete.cliente));
  setRow_(row,info,'Container 1',firstNonEmpty_(frete.Container1, frete.container1));
  setRow_(row,info,'Container 2',firstNonEmpty_(frete.Container2, frete.container2));
  setRow_(row,info,'Container 3',firstNonEmpty_(frete.Container3, frete.container3));
  setRow_(row,info,'Container 4',firstNonEmpty_(frete.Container4, frete.container4));
  setRow_(row,info,'Tipo',firstNonEmpty_(frete.Tipo, frete.tipo));
  setRow_(row,info,'Valor',safeNumber_(firstNonEmpty_(frete.Valor, frete.valor)));
  setRow_(row,info,'Status','PENDENTE');
  setRow_(row,info,'Status de Transferência','');
  setRow_(row,info,'Observação Gestor','');
  setRow_(row,info,'Tipo de Lançamento',firstNonEmpty_(frete.TipoLancamento, 'Frete'));

  sh.appendRow(row);
  return { ok:true, id:id };
}

/* ------------------------ Importação (origem -> Aprovacao) ------------------------ */

function importarNovasRespostasParaAprovacao_(){
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    var shForm=getSheetByAlias_('Respostas ao formulário 1');
    var shApr=getSheetByAlias_('Aprovacao');

    var formInfo=getHeaderMap_(shForm);
    var aprInfo=getHeaderMap_(shApr);

    var cols = ['ID','Timestamp','Data','Motorista','Email Motorista','Frota','Cliente','Container 1','Container 2','Container 3','Container 4','Tipo','Valor','Status','Observação Gestor','AnoMes','Tipo de Lançamento'];
    for (var i=0;i<cols.length;i++){
      formInfo = ensureColumn_(shForm, formInfo, cols[i]);
      aprInfo  = ensureColumn_(shApr, aprInfo, cols[i]);
    }
    formInfo = ensureColumn_(shForm, formInfo, 'Status de Transferência');

    formInfo=getHeaderMap_(shForm);
    aprInfo=getHeaderMap_(shApr);

    var last=shForm.getLastRow();
    if (last<=1) return { imported:0 };

    var values=shForm.getRange(2,1,last-1,formInfo.headers.length).getValues();
    var colTransf=formInfo.map[normKey_('Status de Transferência')];

    var out=[];
    var mark=[];

    for (var r=0;r<values.length;r++){
      var row=values[r];
      var transf = colTransf!=null ? String(row[colTransf]||'').trim() : '';
      if (transf) continue;

      var newRow = new Array(aprInfo.headers.length).fill('');
      for (var c=0;c<aprInfo.headers.length;c++){
        var h=aprInfo.headers[c];
        var v=getRow_(row,formInfo,h);
        if (v!=='') newRow[c]=v;
      }
      setRow_(newRow,aprInfo,'Status','PENDENTE');
      var dt = firstNonEmpty_(getRow_(row,formInfo,'Data'), getRow_(row,formInfo,'Timestamp'));
      var ym = String(getRow_(row,formInfo,'AnoMes')||'').trim();
      if (!/^\d{4}-\d{2}$/.test(ym)) ym = anoMesText_(dt);
      setRow_(newRow,aprInfo,'AnoMes',ym);

      out.push(newRow);
      mark.push(2+r);
    }

    if (out.length){
      shApr.getRange(shApr.getLastRow()+1,1,out.length,aprInfo.headers.length).setValues(out);
      mark.forEach(function(rr){ shForm.getRange(rr,colTransf+1).setValue('OK'); });
    }

    return { imported: out.length };
  } finally {
    lock.releaseLock();
  }
}

function normalizeDecision_(s){
  var v=upper_(s);
  if (v.indexOf('APROV')>=0) return 'APROVADO';
  if (v.indexOf('REPROV')>=0) return 'REPROVADO';
  return '';
}

function getPendentesGestor_(payload){
  ensureGestor_(payload);
  if (CONFIG.AUTO_IMPORTAR_AO_LISTAR_PENDENTES) importarNovasRespostasParaAprovacao_();

  var sh=getSheetByAlias_('Aprovacao');
  var info=getHeaderMap_(sh);
  var cols=['ID','Data','Motorista','Email Motorista','Cliente','Frota','Tipo','Valor','Status','Observação Gestor','AnoMes'];
  for (var i=0;i<cols.length;i++) info=ensureColumn_(sh,info,cols[i]);
  info=getHeaderMap_(sh);

  var last=sh.getLastRow();
  var out=[];
  if (last<=1) return out;

  var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
  var colStatus=info.map[normKey_('Status')];

  for (var r=0;r<values.length;r++){
    var row=values[r];
    var st = colStatus!=null ? upper_(row[colStatus]) : 'PENDENTE';
    if (st !== 'PENDENTE') continue;

    out.push({
      _row: 2+r,
      ID: getRow_(row,info,'ID'),
      Data: getRow_(row,info,'Data'),
      AnoMes: getRow_(row,info,'AnoMes'),
      Motorista: getRow_(row,info,'Motorista'),
      Email: getRow_(row,info,'Email Motorista'),
      Cliente: getRow_(row,info,'Cliente'),
      Frota: getRow_(row,info,'Frota'),
      Tipo: getRow_(row,info,'Tipo'),
      Valor: safeNumber_(getRow_(row,info,'Valor')),
    });
  }
  return out;
}

function atualizarOrigemPorId_(id, status, obs){
  if (!id) return;

  var sh=getSheetByAlias_('Respostas ao formulário 1');
  var info=getHeaderMap_(sh);
  info=ensureColumn_(sh,info,'ID');
  info=ensureColumn_(sh,info,'Status');
  info=ensureColumn_(sh,info,'Observação Gestor');
  info=ensureColumn_(sh,info,'Status de Transferência');
  info=getHeaderMap_(sh);

  var last=sh.getLastRow();
  if (last<=1) return;

  var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
  var colId=info.map[normKey_('ID')];

  for (var i=0;i<values.length;i++){
    var row=values[i];
    if (String(row[colId]||'').trim() === String(id).trim()){
      sh.getRange(2+i, info.map[normKey_('Status')]+1).setValue(status);
      sh.getRange(2+i, info.map[normKey_('Observação Gestor')]+1).setValue(obs||'');
      var cell = sh.getRange(2+i, info.map[normKey_('Status de Transferência')]+1);
      if (!cell.getValue()) cell.setValue('OK');
      return;
    }
  }
}

function processarPendentes_(payload){
  ensureGestor_(payload);
  var decisoes = (payload && payload.decisoes) || [];
  if (!decisoes.length) return { processed: 0 };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    var shApr=getSheetByAlias_('Aprovacao');
    var aprInfo=getHeaderMap_(shApr);
    var baseCols=['ID','Timestamp','Data','Motorista','Email Motorista','Frota','Cliente','Container 1','Container 2','Container 3','Container 4','Tipo','Valor','Status','Observação Gestor','AnoMes','Tipo de Lançamento'];
    for (var i=0;i<baseCols.length;i++) aprInfo=ensureColumn_(shApr,aprInfo,baseCols[i]);
    aprInfo=getHeaderMap_(shApr);

    var shLan=getSheetByAlias_('Lancamentos');
    var lanInfo=getHeaderMap_(shLan);
    var shRep=getSheetByAlias_('Reprovado');
    var repInfo=getHeaderMap_(shRep);
    for (var j=0;j<baseCols.length;j++){
      lanInfo=ensureColumn_(shLan,lanInfo,baseCols[j]);
      repInfo=ensureColumn_(shRep,repInfo,baseCols[j]);
    }
    repInfo=ensureColumn_(shRep,repInfo,'Justificativa');
    lanInfo=getHeaderMap_(shLan);
    repInfo=getHeaderMap_(shRep);

    var last=shApr.getLastRow();
    if (last<=1) return { processed:0 };

    // process bottom-up
    decisoes.sort(function(a,b){ return Number(b.row)-Number(a.row); });

    var processed=0;
    for (var k=0;k<decisoes.length;k++){
      var dec=decisoes[k];
      var r=Number(dec.row);
      if (r<2 || r>last) continue;

      var status=normalizeDecision_(dec.status);
      if (!status) continue;

      var obs=String(dec.observacao||'').trim();
      var row = shApr.getRange(r,1,1,aprInfo.headers.length).getValues()[0];

      setRow_(row,aprInfo,'Status',status);
      setRow_(row,aprInfo,'Observação Gestor',obs);

      var target = (status==='APROVADO') ? shLan : shRep;
      var tInfo  = (status==='APROVADO') ? lanInfo : repInfo;

      var newRow = new Array(tInfo.headers.length).fill('');
      for (var c=0;c<tInfo.headers.length;c++){
        var h=tInfo.headers[c];
        var v=getRow_(row,aprInfo,h);
        if (v!=='') newRow[c]=v;
      }
      setRow_(newRow,tInfo,'Status',status);
      if (status==='REPROVADO') setRow_(newRow,tInfo,'Justificativa',obs);

      // AnoMes normalization
      var ym=String(getRow_(newRow,tInfo,'AnoMes')||'').trim();
      if (!/^\d{4}-\d{2}$/.test(ym)){
        var dt=firstNonEmpty_(getRow_(newRow,tInfo,'Data'), getRow_(newRow,tInfo,'Timestamp'));
        ym=anoMesText_(dt);
        setRow_(newRow,tInfo,'AnoMes',ym);
      }

      target.appendRow(newRow);

      atualizarOrigemPorId_(getRow_(row,aprInfo,'ID'), status, obs);
      shApr.deleteRow(r);
      processed++;
    }

    return { processed: processed };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------ Histórico / Relatórios ------------------------ */

function getHistoricoGestor_(payload){
  ensureGestor_(payload);

  function readSheet_(name, extra){
    var sh=getSheetByAlias_(name);
    var info=getHeaderMap_(sh);
    var cols=['ID','Data','AnoMes','Motorista','Cliente','Tipo','Valor','Status','Observação Gestor','Justificativa'];
    for (var i=0;i<cols.length;i++) info=ensureColumn_(sh,info,cols[i]);
    info=getHeaderMap_(sh);

    var last=sh.getLastRow();
    var out=[];
    if (last<=1) return out;

    var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
    for (var r=0;r<values.length;r++){
      var row=values[r];
      out.push({
        ID: getRow_(row,info,'ID'),
        Data: getRow_(row,info,'Data'),
        AnoMes: getRow_(row,info,'AnoMes'),
        Motorista: getRow_(row,info,'Motorista'),
        Cliente: getRow_(row,info,'Cliente'),
        Tipo: getRow_(row,info,'Tipo'),
        Valor: getRow_(row,info,'Valor'),
        'Observação Gestor': getRow_(row,info,'Observação Gestor'),
        Justificativa: getRow_(row,info,'Justificativa'),
      });
    }
    return out;
  }

  return {
    aprovados: readSheet_('Lancamentos'),
    reprovados: readSheet_('Reprovado'),
  };
}

function getRelatorioGestor_(payload){
  ensureGestor_(payload);

  var sh=getSheetByAlias_('Lancamentos');
  var info=getHeaderMap_(sh);
  var cols=['Valor','AnoMes','Data','Timestamp','Motorista'];
  for (var i=0;i<cols.length;i++) info=ensureColumn_(sh,info,cols[i]);
  info=getHeaderMap_(sh);

  var last=sh.getLastRow();
  var totalValor=0, totalFretes=0;
  var porMes={}, porMot={};

  if (last>1){
    var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
    for (var r=0;r<values.length;r++){
      var row=values[r];
      var val=safeNumber_(getRow_(row,info,'Valor'));
      if (!val) continue;

      var ym=String(getRow_(row,info,'AnoMes')||'').trim();
      if (!/^\d{4}-\d{2}$/.test(ym)){
        var dt=firstNonEmpty_(getRow_(row,info,'Data'), getRow_(row,info,'Timestamp'));
        ym=anoMesText_(dt);
      }
      if (!/^\d{4}-\d{2}$/.test(ym)) continue;

      var mot=String(getRow_(row,info,'Motorista')||'Sem motorista').trim();

      totalValor += val;
      totalFretes++;
      porMes[ym] = (porMes[ym]||0) + val;
      porMot[mot] = (porMot[mot]||0) + val;
    }
  }

  var shR=getSheetByAlias_('Reprovado');
  var totalReprov = Math.max(shR.getLastRow()-1, 0);

  var porMesArr = Object.keys(porMes).sort().map(function(k){ return {mes:k, valor: porMes[k]}; });
  var porMotArr = Object.keys(porMot).map(function(k){ return {motorista:k, valor: porMot[k]}; }).sort(function(a,b){ return a.valor-b.valor; });

  return {
    totalFretesAprov: totalFretes,
    totalFretesReprov: totalReprov,
    totalValorAprov: totalValor,
    porMes: porMesArr,
    porMotoristaArr: porMotArr,
  };
}

/* ------------------------ Motorista: meus lançamentos ------------------------ */

function rowMatchesMotorista_(row, info, user, email){
  var e = String(firstNonEmpty_(getRow_(row,info,'Email Motorista'), getRow_(row,info,'Email'))||'').trim().toLowerCase();
  if (e && e === String(email||'').trim().toLowerCase()) return true;
  var m = String(getRow_(row,info,'Motorista')||'').trim();
  return m && normKey_(m) === normKey_(user && user.Nome);
}

function getLancamentosMotorista_(payload){
  var sess=requireAuth_(payload);
  var email=sess.email;
  var user=findUsuarioByEmail_(email);
  if (!user) throw new Error('Usuário não encontrado.');

  var result={ aprovacao:[], lancamentos:[], reprovados:[] };
  var seen={};

  function pushUnique(arr,obj){
    var id=String(obj.ID||'').trim();
    if (id){
      if (seen[id]) return;
      seen[id]=true;
    }
    arr.push(obj);
  }

  // origem pendente (não importado)
  (function(){
    var sh=getSheetByAlias_('Respostas ao formulário 1');
    var info=getHeaderMap_(sh);
    var cols=['ID','Data','AnoMes','Cliente','Tipo','Valor','Status','Status de Transferência','Email Motorista','Motorista'];
    for (var i=0;i<cols.length;i++) info=ensureColumn_(sh,info,cols[i]);
    info=getHeaderMap_(sh);

    var last=sh.getLastRow();
    if (last<=1) return;

    var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
    var colTransf=info.map[normKey_('Status de Transferência')];

    for (var r=0;r<values.length;r++){
      var row=values[r];
      if (!rowMatchesMotorista_(row,info,user,email)) continue;

      var transf = colTransf!=null ? String(row[colTransf]||'').trim() : '';
      var st = upper_(getRow_(row,info,'Status')) || 'PENDENTE';
      if (!transf && st==='PENDENTE'){
        pushUnique(result.aprovacao,{
          ID:getRow_(row,info,'ID'),
          Data:getRow_(row,info,'Data'),
          AnoMes:getRow_(row,info,'AnoMes'),
          Cliente:getRow_(row,info,'Cliente'),
          Tipo:getRow_(row,info,'Tipo'),
          Valor:getRow_(row,info,'Valor'),
          Status:'PENDENTE',
          Justificativa:'',
        });
      }
    }
  })();

  function collectFromSheet(sheetName, arr, expectedStatus){
    var sh=getSheetByAlias_(sheetName);
    var info=getHeaderMap_(sh);
    var cols=['ID','Data','AnoMes','Cliente','Tipo','Valor','Status','Justificativa','Observação Gestor','Email Motorista','Motorista'];
    for (var i=0;i<cols.length;i++) info=ensureColumn_(sh,info,cols[i]);
    info=getHeaderMap_(sh);

    var last=sh.getLastRow();
    if (last<=1) return;

    var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
    var colStatus=info.map[normKey_('Status')];

    for (var r=0;r<values.length;r++){
      var row=values[r];
      if (!rowMatchesMotorista_(row,info,user,email)) continue;

      var st = colStatus!=null ? upper_(row[colStatus]) : '';
      if (expectedStatus && st !== expectedStatus) continue;

      pushUnique(arr,{
        ID:getRow_(row,info,'ID'),
        Data:getRow_(row,info,'Data'),
        AnoMes:getRow_(row,info,'AnoMes'),
        Cliente:getRow_(row,info,'Cliente'),
        Tipo:getRow_(row,info,'Tipo'),
        Valor:getRow_(row,info,'Valor'),
        Status: st,
        Justificativa: getRow_(row,info,'Justificativa'),
        'Observação Gestor': getRow_(row,info,'Observação Gestor'),
      });
    }
  }

  collectFromSheet('Aprovacao', result.aprovacao, 'PENDENTE');
  collectFromSheet('Lancamentos', result.lancamentos, 'APROVADO');
  collectFromSheet('Reprovado', result.reprovados, 'REPROVADO');

  return result;
}

/* ------------------------ Cadastros (Gestor) ------------------------ */

function addCliente_(payload){
  ensureGestor_(payload);
  var nome=String(payload && payload.nome || '').trim();
  if (!nome) throw new Error('Nome do cliente obrigatório.');

  var sh=getSheetByAlias_('Clientes');
  var info=getHeaderMap_(sh);
  info=ensureColumn_(sh,info,'Cliente');
  info=getHeaderMap_(sh);

  var last=sh.getLastRow();
  var exists=false;
  if (last>1){
    var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
    for (var i=0;i<values.length;i++){
      var r=values[i];
      var v=firstNonEmpty_(getRow_(r,info,'Cliente'), r[0]);
      if (v && normKey_(v)===normKey_(nome)) exists=true;
    }
  }
  if (!exists){
    var row=new Array(info.headers.length).fill('');
    setRow_(row,info,'Cliente',nome);
    sh.appendRow(row);
  }
  return listClientes_();
}

function addFrota_(payload){
  ensureGestor_(payload);
  var numero=String(payload && payload.numero || '').trim();
  if (!numero) throw new Error('Número da frota obrigatório.');

  var sh=getSheetByAlias_('Frotas');
  var info=getHeaderMap_(sh);
  info=ensureColumn_(sh,info,'Frota');
  info=getHeaderMap_(sh);

  var last=sh.getLastRow();
  var exists=false;
  if (last>1){
    var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
    for (var i=0;i<values.length;i++){
      var r=values[i];
      var v=firstNonEmpty_(getRow_(r,info,'Frota'), r[0]);
      if (v && normKey_(v)===normKey_(numero)) exists=true;
    }
  }
  if (!exists){
    var row=new Array(info.headers.length).fill('');
    setRow_(row,info,'Frota',numero);
    sh.appendRow(row);
  }
  return listFrotas_();
}

/* ------------------------ Backfill AnoMes ------------------------ */

function backfillAnoMesAll_(payload){
  ensureGestor_(payload);
  var tabs=['Respostas ao formulário 1','Aprovacao','Lancamentos','Reprovado'];
  var report={};

  tabs.forEach(function(name){
    var sh;
    try { sh=getSheetByAlias_(name); } catch(e){ return; }
    var info=getHeaderMap_(sh);
    info=ensureColumn_(sh,info,'AnoMes');
    info=getHeaderMap_(sh);

    var last=sh.getLastRow();
    if (last<=1) return;

    var values=sh.getRange(2,1,last-1,info.headers.length).getValues();
    var colYM=info.map[normKey_('AnoMes')];
    var colData=info.map[normKey_('Data')];
    var colTs=info.map[normKey_('Timestamp')];

    var out=[], filled=0;
    for (var i=0;i<values.length;i++){
      var row=values[i];
      var cur=String(row[colYM]||'').trim();
      if (/^\d{4}-\d{2}$/.test(cur)){ out.push([cur]); continue; }
      var dt = (colData!=null && row[colData]) ? row[colData] : ((colTs!=null && row[colTs]) ? row[colTs] : '');
      var ym=anoMesText_(dt);
      out.push([ym]);
      if (ym) filled++;
    }
    sh.getRange(2,colYM+1,out.length,1).setValues(out);
    report[name]={ linhas: out.length, preenchidos: filled };
  });

  return { ok:true, report:report };
}

/* ------------------------ Router ------------------------ */

function doPost(e){
  var out;
  try{
    var req={};
    if (e && e.postData && e.postData.contents){
      try { req=JSON.parse(e.postData.contents); } catch(_){ req={}; }
    }
    var action = firstNonEmpty_(req.action, e && e.parameter && e.parameter.action);
    var payload = req.payload || {};
    if (!action) throw new Error('Ação não informada.');

    var data;
    if (action==='login') data=login_(payload);
    else if (action==='init') data=init_(payload);
    else if (action==='salvarFreteMotorista') data=salvarFreteMotorista_(payload);
    else if (action==='importarNovasRespostasParaAprovacao') data=importarNovasRespostasParaAprovacao_();
    else if (action==='getPendentesGestor') data=getPendentesGestor_(payload);
    else if (action==='processarPendentes') data=processarPendentes_(payload);
    else if (action==='getHistoricoGestor') data=getHistoricoGestor_(payload);
    else if (action==='getRelatorioGestor') data=getRelatorioGestor_(payload);
    else if (action==='getLancamentosMotorista') data=getLancamentosMotorista_(payload);
    else if (action==='addCliente') data=addCliente_(payload);
    else if (action==='addFrota') data=addFrota_(payload);
    else if (action==='backfillAnoMesAll') data=backfillAnoMesAll_(payload);
    else throw new Error('Ação não reconhecida: '+action);

    out={ success:true, data:data };
  } catch(err){
    out={ success:false, message: err && err.message ? err.message : String(err) };
  }

  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------ Menu ------------------------ */

function onOpen(e){
  SpreadsheetApp.getUi()
    .createMenu('Administração')
    .addItem('Importar respostas -> Aprovação', 'importarNovasRespostasParaAprovacao_')
    .addSeparator()
    .addItem('Backfill AnoMes (todas abas)', 'backfillAnoMesAll_')
    .addToUi();
}
