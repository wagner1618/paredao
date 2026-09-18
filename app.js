// ============================================================
//  Operação Paredão — lógica do aplicativo
// ============================================================
import { firebaseConfig, EMAILS_CICOM } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Estado ----------
let perfil = null;            // "cicom" | "guarnicao"
let usuario = null;
let turnoAtivo = null;        // {id, ...}
let ocorrencias = [];         // do turno atual (não arquivadas)
let unsubOcorr = null;
let unsubTurno = null;

// Rótulos de status
const STATUS = {
  pendente:                { rotulo: "Pendente",                classe: "st-pendente" },
  atendida:                { rotulo: "Atendida",                classe: "st-atendida" },
  endereco_nao_encontrado: { rotulo: "Endereço não encontrado", classe: "st-naoenc" },
  nao_possivel:            { rotulo: "Não será possível",       classe: "st-naopos" }
};

// Opções das listas suspensas da guarnição
const FUNCOES = ["Cmt", "Mot", "Mot/Cmt", "Patr 1", "Patr 2", "Patr 3"];
const GRADUACOES = ["Cap PM", "Ten PM", "Subten PM", "Sgt PM", "Cb PM", "Sd PM"];

// ---------- Atalhos ----------
const $ = (id) => document.getElementById(id);
const el = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));

// ============================================================
//  LOGIN
// ============================================================
$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-erro").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-senha").value);
  } catch (err) {
    $("login-erro").textContent = traduzErro(err.code);
  }
});

$("btn-sair").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    usuario = user;
    perfil = EMAILS_CICOM.map(e => e.toLowerCase()).includes(user.email.toLowerCase())
      ? "cicom" : "guarnicao";
    entrarNoApp();
  } else {
    sairDoApp();
  }
});

function entrarNoApp() {
  $("tela-login").classList.add("oculto");
  $("tela-app").classList.remove("oculto");
  $("usuario-atual").textContent = usuario.email;
  const badge = $("badge-perfil");
  badge.textContent = perfil === "cicom" ? "CICOM" : "GUARNIÇÃO";
  badge.className = "badge " + (perfil === "cicom" ? "badge-cicom" : "badge-guarnicao");
  $("painel-cicom").classList.toggle("oculto", perfil !== "cicom");
  $("btn-limpar-hist").classList.toggle("oculto", perfil !== "cicom");
  ouvirTurno();
  ouvirOcorrencias();
}

function sairDoApp() {
  if (unsubOcorr) unsubOcorr();
  if (unsubTurno) unsubTurno();
  usuario = perfil = turnoAtivo = null;
  ocorrencias = [];
  $("tela-app").classList.add("oculto");
  $("tela-login").classList.remove("oculto");
  $("form-login").reset();
}

// ============================================================
//  TURNO (assumir / encerrar serviço)
// ============================================================
function ouvirTurno() {
  const q = query(collection(db, "turnos"), where("ativo", "==", true));
  unsubTurno = onSnapshot(q, (snap) => {
    turnoAtivo = null;
    snap.forEach(d => { turnoAtivo = { id: d.id, ...d.data() }; });
    renderBarraTurno();
    renderColunas();
  });
}

function renderBarraTurno() {
  const barra = $("barra-turno");
  const painelAssumir = $("painel-assumir");

  if (turnoAtivo) {
    painelAssumir.classList.add("oculto");
    const pols = (turnoAtivo.policiais || []).map(fmtPolicial).join(" • ");
    const t = turnoAtivo;
    const detalhes = [
      t.viatura ? "🚓 " + esc(t.viatura) : "",
      t.km ? "KM " + esc(t.km) : "",
      (t.horaInicio || t.horaTermino) ? `⏱ ${esc(t.horaInicio || "?")}–${esc(t.horaTermino || "?")}` : ""
    ].filter(Boolean).join(" · ");
    barra.innerHTML = `
      <div class="turno-info">
        <span class="turno-dot"></span>
        <div>
          <strong>Guarnição em serviço</strong>
          ${detalhes ? `<div class="turno-det">${detalhes}</div>` : ""}
          <div class="turno-pols">${esc(pols) || "—"}</div>
          ${t.observacoes ? `<div class="turno-obs">📝 ${esc(t.observacoes)}</div>` : ""}
        </div>
      </div>
      <div class="turno-lado">
        ${htmlContagem()}
        ${perfil === "guarnicao"
          ? `<button id="btn-encerrar" class="btn btn-mini btn-perigo">Encerrar serviço</button>` : ""}
      </div>
    `;
    barra.classList.add("ativa");
    const be = $("btn-encerrar");
    if (be) be.addEventListener("click", abrirModalEncerrar);
  } else {
    barra.classList.remove("ativa");
    barra.innerHTML = `<div class="turno-info turno-vazio">
      <span class="turno-dot off"></span>
      <strong>Nenhuma guarnição em serviço no momento</strong>
    </div>`;
    // Guarnição vê o painel para assumir
    painelAssumir.classList.toggle("oculto", perfil !== "guarnicao");
    if (perfil === "guarnicao" && !painelAssumir.dataset.pronto) prepararPainelAssumir();
  }
}

function opcoes(lista) {
  return `<option value="">—</option>` + lista.map(o => `<option value="${o}">${o}</option>`).join("");
}

// "Cmt Ten PM João" (ignora campos vazios)
function fmtPolicial(p) {
  return [p.funcao, p.graduacao, p.nome].filter(Boolean).join(" ");
}

// Contagem do serviço em andamento.
// "Não atendidas" = tudo que não foi atendido (pendentes + end. não encontrado + não possível).
function contagem() {
  const atendidas = ocorrencias.filter(o => o.status === "atendida").length;
  return {
    enviadas: ocorrencias.length,
    atendidas,
    naoAtendidas: ocorrencias.length - atendidas
  };
}
function htmlContagem() {
  const c = contagem();
  return `<div class="contagem">
    <span class="cont-item"><b>${c.enviadas}</b> enviadas</span>
    <span class="cont-item ok"><b>${c.atendidas}</b> atendidas</span>
    <span class="cont-item nao"><b>${c.naoAtendidas}</b> não atend.</span>
  </div>`;
}

function prepararPainelAssumir() {
  $("painel-assumir").dataset.pronto = "1";
  const lista = $("lista-policiais");
  const addLinha = () => {
    const div = document.createElement("div");
    div.className = "policial-linha";
    div.innerHTML = `
      <select class="campo pol-func">${opcoes(FUNCOES)}</select>
      <select class="campo pol-grad">${opcoes(GRADUACOES)}</select>
      <input class="campo pol-nome" placeholder="Nome" />
      <button class="btn btn-mini btn-remove" title="Remover">✕</button>`;
    div.querySelector(".btn-remove").addEventListener("click", () => div.remove());
    lista.appendChild(div);
  };
  addLinha(); addLinha(); addLinha(); addLinha(); // começa com 4 linhas
  $("btn-add-policial").addEventListener("click", addLinha);
  $("btn-assumir").addEventListener("click", assumirServico);
}

async function assumirServico() {
  const policiais = els(".policial-linha").map(l => ({
    funcao: l.querySelector(".pol-func").value,
    graduacao: l.querySelector(".pol-grad").value,
    nome: l.querySelector(".pol-nome").value.trim()
  })).filter(p => p.nome);

  if (policiais.length === 0) { toast("Informe ao menos um policial."); return; }

  await addDoc(collection(db, "turnos"), {
    ativo: true,
    viatura: $("turno-viatura").value.trim(),
    km: $("turno-km").value.trim(),
    horaInicio: $("turno-inicio").value,     // "HH:MM" informado pela guarnição
    horaTermino: $("turno-termino").value,   // "HH:MM" informado pela guarnição
    observacoes: $("turno-obs").value.trim(),
    policiais,
    inicio: serverTimestamp(),               // usado só para ordenar/datar no histórico
    fim: null,
    criadoPor: usuario.email
  });
  toast("Serviço assumido. Bom trabalho!");
}

// Senha exigida para encerrar o serviço (evita encerramento acidental)
const SENHA_ENCERRAR = "paredao";

function abrirModalEncerrar() {
  if (!turnoAtivo) return;
  $("encerrar-senha").value = "";
  $("encerrar-erro").textContent = "";
  $("modal-encerrar").classList.remove("oculto");
  $("encerrar-senha").focus();
}

function fecharModalEncerrar() {
  $("modal-encerrar").classList.add("oculto");
}

async function confirmarEncerramento() {
  if (!turnoAtivo) { fecharModalEncerrar(); return; }
  const senha = $("encerrar-senha").value.trim().toLowerCase();
  if (senha !== SENHA_ENCERRAR) {
    $("encerrar-erro").textContent = "Senha incorreta.";
    $("encerrar-senha").select();
    return;
  }
  const batch = writeBatch(db);
  // Arquiva as ocorrências do quadro e carimba com o turno
  const snap = await getDocs(query(collection(db, "ocorrencias"), where("arquivada", "==", false)));
  snap.forEach(d => batch.update(doc(db, "ocorrencias", d.id), {
    arquivada: true, turnoId: turnoAtivo.id
  }));
  // Não gravamos a hora real do encerramento: o término é o horário
  // informado pela guarnição ao assumir (turnoAtivo.horaTermino).
  batch.update(doc(db, "turnos", turnoAtivo.id), { ativo: false });
  await batch.commit();
  fecharModalEncerrar();
  toast("Serviço encerrado.");
}

$("encerrar-cancelar").addEventListener("click", fecharModalEncerrar);
$("encerrar-confirmar").addEventListener("click", confirmarEncerramento);
$("encerrar-senha").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmarEncerramento(); });
$("modal-encerrar").addEventListener("click", (e) => { if (e.target.id === "modal-encerrar") fecharModalEncerrar(); });

// ============================================================
//  OCORRÊNCIAS
// ============================================================
function ouvirOcorrencias() {
  const q = query(collection(db, "ocorrencias"), where("arquivada", "==", false));
  unsubOcorr = onSnapshot(q, (snap) => {
    ocorrencias = [];
    snap.forEach(d => ocorrencias.push({ id: d.id, ...d.data() }));
    renderColunas();
  });
}

// -------- Parser do bloco do WhatsApp --------
function semAcento(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const CAMPOS = [
  { chave: "municipioBairro",     rotulos: ["municipio/bairro", "municipio", "bairro"] },
  { chave: "enderecoIncidente",   rotulos: ["endereco de incidente", "endereco do incidente", "endereco incidente", "endereco"] },
  { chave: "enderecoReferencia",  rotulos: ["endereco de referencia", "ponto de referencia", "referencia"] },
  { chave: "descricao",           rotulos: ["descricao", "natureza", "solicitacao"] }
];

// Lista plana de rótulos, do mais específico (longo) para o mais genérico,
// para que "endereço de referência" não seja confundido com "endereço".
const ROTULOS = CAMPOS
  .flatMap(c => c.rotulos.map(r => ({ chave: c.chave, rotulo: r })))
  .sort((a, b) => b.rotulo.length - a.rotulo.length);

function identificaRotulo(linha) {
  const l = semAcento(linha.replace(/:/g, "").trim());
  for (const { chave, rotulo } of ROTULOS) {
    if (l === rotulo || l.startsWith(rotulo)) {
      // texto que já vem na mesma linha depois do rótulo (ex.: "Descrição: som alto")
      const resto = linha.split(/:(.+)/s)[1];
      return { chave, resto: resto ? resto.trim() : "" };
    }
  }
  return null;
}

function ehRotulo(linha, chave) {
  const r = identificaRotulo(linha);
  return !!r && r.chave === chave;
}

// A cidade/bairro nem sempre vem com a etiqueta "Município/Bairro": muitas vezes
// é só a 1ª linha. Por isso usamos "Endereço de incidente" (que aparece em toda
// ocorrência) como âncora para separar vários blocos colados de uma vez.
function separaPorIncidente(bloco) {
  const lin = bloco.split(/\r?\n/).filter(l => l.trim());
  const inc = [];
  lin.forEach((l, i) => { if (ehRotulo(l, "enderecoIncidente")) inc.push(i); });
  if (inc.length <= 1) return [bloco];

  const inicios = [0];
  for (let k = 1; k < inc.length; k++) {
    let s = inc[k] - 1;                                   // linha do município (antes do "Endereço de incidente")
    if (s - 1 >= 0 && ehRotulo(lin[s - 1], "municipioBairro")) s = s - 1; // inclui a etiqueta, se houver
    inicios.push(s);
  }
  const recs = [];
  for (let k = 0; k < inicios.length; k++) {
    const fim = k + 1 < inicios.length ? inicios[k + 1] : lin.length;
    recs.push(lin.slice(inicios[k], fim).join("\n"));
  }
  return recs;
}

// Extrai os campos de UMA ocorrência
function parseUmRegistro(bloco) {
  const lin = bloco.split(/\r?\n/).filter(l => l.trim());
  const r = { municipioBairro:"", enderecoIncidente:"", enderecoReferencia:"", descricao:"", rawText: bloco.trim() };
  let campo = null, vistoLabel = false;
  const antes = [];
  for (const linha of lin) {
    const rot = identificaRotulo(linha);
    if (rot) {
      vistoLabel = true;
      campo = rot.chave;
      if (rot.resto) r[campo] = (r[campo] ? r[campo] + " " : "") + rot.resto;
    } else if (!vistoLabel) {
      antes.push(linha.trim());          // texto antes de qualquer etiqueta = cidade/bairro
    } else if (campo) {
      r[campo] += (r[campo] ? " " : "") + linha.trim();
    }
  }
  if (!r.municipioBairro && antes.length) r.municipioBairro = antes.join(" ");
  return r;
}

// Divide um texto colado em uma ou mais ocorrências e extrai os campos
function parseOcorrencias(texto) {
  const blocos = texto.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const registros = [];
  for (const b of blocos) separaPorIncidente(b).forEach(r => registros.push(parseUmRegistro(r)));
  return registros.filter(r => r.municipioBairro || r.enderecoIncidente || r.descricao);
}

// Título curto do card (cidade/bairro, ou 1ª linha do texto)
function tituloDe(o) {
  if (o.municipioBairro) return o.municipioBairro;
  const l = (o.rawText || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return l[0] || "Ocorrência";
}
// Melhor endereço para o mapa (bastidor); se nada, usa a 1ª linha do texto
function enderecoParaMapa(o) {
  return o.enderecoIncidente || o.municipioBairro ||
    (o.rawText || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || "";
}
// Texto completo, preservando as quebras de linha
function textoHtml(raw) { return esc(raw || "").replace(/\n/g, "<br>"); }

// -------- Botões do painel CICOM --------
$("btn-previa").addEventListener("click", () => {
  const regs = parseOcorrencias($("entrada-colar").value);
  const previa = $("previa");
  if (regs.length === 0) { previa.classList.add("oculto"); toast("Nada reconhecido no texto."); return; }
  previa.classList.remove("oculto");
  previa.innerHTML = `<p class="dica">${regs.length} ocorrência(s):</p>` +
    regs.map((r, i) => `
      <div class="previa-card">
        <b>#${i+1} — ${esc(tituloDe(r))}</b>
        <div class="previa-texto">${textoHtml(r.rawText)}</div>
      </div>`).join("");
});

$("btn-lancar").addEventListener("click", async () => {
  const regs = parseOcorrencias($("entrada-colar").value);
  if (regs.length === 0) { toast("Nada reconhecido para lançar."); return; }

  let ordemBase = proximaOrdem();
  const batch = writeBatch(db);
  regs.forEach((r) => {
    const ref = doc(collection(db, "ocorrencias"));
    batch.set(ref, {
      ...r,
      status: "pendente",
      ordem: ordemBase++,
      arquivada: false,
      turnoId: turnoAtivo ? turnoAtivo.id : null,
      criadoEm: serverTimestamp(),
      criadoPor: usuario.email,
      finalizadoEm: null,
      finalizadoPor: null,
      observacao: ""
    });
  });
  await batch.commit();
  $("entrada-colar").value = "";
  $("previa").classList.add("oculto");
  toast(`${regs.length} ocorrência(s) lançada(s).`);
});

function proximaOrdem() {
  const pend = ocorrencias.filter(o => o.status === "pendente");
  return pend.length ? Math.max(...pend.map(o => o.ordem || 0)) + 1 : 1;
}

// -------- Render das colunas --------
function renderColunas() {
  const cont = $("colunas");
  if (!cont) return;

  if (turnoAtivo) renderBarraTurno(); // atualiza a contagem quando as ocorrências mudam

  const pendentes = ocorrencias.filter(o => o.status === "pendente")
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const finalizadas = ocorrencias.filter(o => o.status !== "pendente")
    .sort((a, b) => (msDe(b.finalizadoEm) - msDe(a.finalizadoEm)));

  cont.innerHTML = `
    <div class="coluna">
      <h3 class="titulo-col">🟡 Pendentes <span class="contador">${pendentes.length}</span></h3>
      <div id="lista-pendentes" class="lista">
        ${pendentes.length ? pendentes.map((o, i) => cardPendente(o, i, pendentes.length)).join("")
                            : `<p class="vazio">Nenhuma ocorrência pendente.</p>`}
      </div>
    </div>
    <div class="coluna">
      <h3 class="titulo-col">✅ Finalizadas <span class="contador">${finalizadas.length}</span></h3>
      <div class="lista">
        ${finalizadas.length ? finalizadas.map(cardFinalizada).join("")
                             : `<p class="vazio">Nenhuma finalizada ainda.</p>`}
      </div>
    </div>`;

  ligarEventosCards();
}

function cardPendente(o, idx, total) {
  const podeAgir = perfil === "guarnicao";
  return `
  <div class="card st-pendente" draggable="${podeAgir}" data-id="${o.id}" data-ordem="${o.ordem}">
    <div class="card-topo">
      <span class="pos">${idx + 1}º</span>
      <b class="mun">${esc(tituloDe(o))}</b>
      ${podeAgir ? `<span class="setas">
        <button class="btn-seta" data-mov="cima" data-id="${o.id}" ${idx===0?"disabled":""}>▲</button>
        <button class="btn-seta" data-mov="baixo" data-id="${o.id}" ${idx===total-1?"disabled":""}>▼</button>
      </span>` : ""}
    </div>
    <div class="card-corpo">
      <div class="texto-oc">${textoHtml(o.rawText)}</div>
      ${enderecoParaMapa(o) ? `<a class="link-mapa" target="_blank"
          href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoParaMapa(o))}">Abrir no mapa ↗</a>` : ""}
    </div>
    ${podeAgir ? `<div class="card-acoes">
      <button class="btn btn-ok"     data-fin="atendida"                data-id="${o.id}">Atendida</button>
      <button class="btn btn-neutro" data-fin="endereco_nao_encontrado" data-id="${o.id}">End. não encontrado</button>
      <button class="btn btn-perigo" data-fin="nao_possivel"            data-id="${o.id}">Não será possível</button>
    </div>` : ""}
    ${perfil === "cicom" ? `<div class="card-acoes">
      <button class="btn btn-mini btn-apagar" data-del="${o.id}">Apagar</button></div>` : ""}
  </div>`;
}

function cardFinalizada(o) {
  const st = STATUS[o.status] || STATUS.pendente;
  return `
  <div class="card finalizada ${st.classe}" data-id="${o.id}">
    <div class="card-topo">
      <span class="tag ${st.classe}">${st.rotulo}</span>
      <b class="mun">${esc(tituloDe(o))}</b>
    </div>
    <div class="card-corpo">
      <div class="texto-oc texto-oc-min">${textoHtml(o.rawText)}</div>
      ${o.observacao ? `<div class="obs-oc">📝 ${esc(o.observacao)}</div>` : ""}
      <div class="fin-meta">${o.finalizadoPor ? "por " + esc(o.finalizadoPor.split("@")[0]) : ""} ${horaDe(o.finalizadoEm)}</div>
    </div>
    ${perfil === "guarnicao" ? `<div class="card-acoes">
      <button class="btn btn-mini" data-reabrir="${o.id}">Reabrir</button></div>` : ""}
  </div>`;
}

function ligarEventosCards() {
  // Finalizar / trocar status -> abre a janela de confirmação
  els("[data-fin]").forEach(b => b.addEventListener("click", () => abrirModalStatus(b.dataset.id, b.dataset.fin)));
  // Reabrir
  els("[data-reabrir]").forEach(b => b.addEventListener("click", async () => {
    await updateDoc(doc(db, "ocorrencias", b.dataset.reabrir), {
      status: "pendente", ordem: proximaOrdem(), finalizadoEm: null, finalizadoPor: null
    });
  }));
  // Apagar (CICOM)
  els("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (confirm("Apagar esta ocorrência?")) await deleteDoc(doc(db, "ocorrencias", b.dataset.del));
  }));
  // Setas de reordenar
  els(".btn-seta").forEach(b => b.addEventListener("click", () => mover(b.dataset.id, b.dataset.mov)));
  // Arrastar (desktop)
  ligarDragDrop();
}

// ---- Janela de confirmação de status ----
let acaoStatus = null; // { id, status }

function abrirModalStatus(id, status) {
  const o = ocorrencias.find(x => x.id === id);
  acaoStatus = { id, status };
  $("modal-titulo").textContent = "Marcar como: " + (STATUS[status]?.rotulo || status);
  $("modal-sub").textContent = o ? tituloDe(o) : "";
  // Ao marcar como Atendida, já sugere "som cessado" (a guarnição pode editar ou apagar).
  $("modal-obs").value = (o && o.observacao) ? o.observacao
    : (status === "atendida" ? "som cessado" : "");
  const btn = $("modal-confirmar");
  btn.className = "btn " + (status === "atendida" ? "btn-ok" : status === "nao_possivel" ? "btn-perigo" : "btn-neutro");
  $("modal-status").classList.remove("oculto");
  $("modal-obs").focus();
}

function fecharModalStatus() {
  $("modal-status").classList.add("oculto");
  acaoStatus = null;
}

async function confirmarModalStatus() {
  if (!acaoStatus) return;
  const { id, status } = acaoStatus;
  await updateDoc(doc(db, "ocorrencias", id), {
    status,
    observacao: $("modal-obs").value.trim(),
    finalizadoEm: serverTimestamp(),
    finalizadoPor: usuario.email
  });
  fecharModalStatus();
  toast("Ocorrência atualizada.");
}

$("modal-cancelar").addEventListener("click", fecharModalStatus);
$("modal-confirmar").addEventListener("click", confirmarModalStatus);
$("modal-status").addEventListener("click", (e) => { if (e.target.id === "modal-status") fecharModalStatus(); });

async function mover(id, direcao) {
  const pend = ocorrencias.filter(o => o.status === "pendente")
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const i = pend.findIndex(o => o.id === id);
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= pend.length) return;
  const a = pend[i], b = pend[j];
  const batch = writeBatch(db);
  batch.update(doc(db, "ocorrencias", a.id), { ordem: b.ordem });
  batch.update(doc(db, "ocorrencias", b.id), { ordem: a.ordem });
  await batch.commit();
}

let arrastando = null;
function ligarDragDrop() {
  els("#lista-pendentes .card").forEach(card => {
    card.addEventListener("dragstart", () => { arrastando = card.dataset.id; card.classList.add("arrastando"); });
    card.addEventListener("dragend",   () => { card.classList.remove("arrastando"); arrastando = null; });
    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      const alvo = card.dataset.id;
      if (!arrastando || arrastando === alvo) return;
      await reordenarSolto(arrastando, alvo);
    });
  });
}

async function reordenarSolto(idMovido, idAlvo) {
  const pend = ocorrencias.filter(o => o.status === "pendente")
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const movido = pend.find(o => o.id === idMovido);
  const semMovido = pend.filter(o => o.id !== idMovido);
  const idxAlvo = semMovido.findIndex(o => o.id === idAlvo);
  semMovido.splice(idxAlvo, 0, movido);
  const batch = writeBatch(db);
  semMovido.forEach((o, i) => batch.update(doc(db, "ocorrencias", o.id), { ordem: i + 1 }));
  await batch.commit();
}

// ============================================================
//  HISTÓRICO
// ============================================================
let histTurnos = [];    // serviços encerrados (todos)
let histPorTurno = {};  // ocorrências arquivadas agrupadas por turnoId

async function carregarHistorico() {
  const cont = $("lista-historico");
  cont.innerHTML = `<p class="dica">Carregando…</p>`;
  const snap = await getDocs(query(collection(db, "turnos"), where("ativo", "==", false)));
  histTurnos = [];
  snap.forEach(d => histTurnos.push({ id: d.id, ...d.data() }));
  histTurnos.sort((a, b) => msDe(b.inicio) - msDe(a.inicio));

  const oSnap = await getDocs(query(collection(db, "ocorrencias"), where("arquivada", "==", true)));
  histPorTurno = {};
  oSnap.forEach(d => {
    const o = d.data();
    (histPorTurno[o.turnoId] = histPorTurno[o.turnoId] || []).push(o);
  });

  renderHistorico();
}

// Data local do turno no formato "YYYY-MM-DD" (para comparar com os filtros)
function diaLocal(t) {
  const d = t.inicio && t.inicio.toDate ? t.inicio.toDate() : null;
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function turnoNoEscopo(t) {
  const modo = $("filtro-modo").value;
  const dia = diaLocal(t);
  if (modo === "geral") return true;
  if (!dia) return false;
  if (modo === "mes") {
    const m = $("filtro-mes").value;          // "YYYY-MM"
    return !m || dia.slice(0, 7) === m;
  }
  if (modo === "periodo") {
    const de = $("filtro-de").value, ate = $("filtro-ate").value;
    if (de && dia < de) return false;
    if (ate && dia > ate) return false;
    return true;
  }
  return true;
}

function totaisDe(turnos) {
  let enviadas = 0, atendidas = 0;
  turnos.forEach(t => {
    const list = histPorTurno[t.id] || [];
    enviadas += list.length;
    atendidas += list.filter(o => o.status === "atendida").length;
  });
  return { servicos: turnos.length, enviadas, atendidas, naoAtendidas: enviadas - atendidas };
}

function renderHistorico() {
  // mostra/esconde os campos do filtro conforme o modo
  const modo = $("filtro-modo").value;
  $("filtro-mes").classList.toggle("oculto", modo !== "mes");
  $("filtro-periodo").classList.toggle("oculto", modo !== "periodo");

  const turnos = histTurnos.filter(turnoNoEscopo);
  const t = totaisDe(turnos);

  $("hist-resumo-geral").innerHTML = `
    <div class="resumo-cards">
      <div class="resumo-card"><b>${t.servicos}</b><span>serviços</span></div>
      <div class="resumo-card"><b>${t.enviadas}</b><span>enviadas</span></div>
      <div class="resumo-card ok"><b>${t.atendidas}</b><span>atendidas</span></div>
      <div class="resumo-card nao"><b>${t.naoAtendidas}</b><span>não atendidas</span></div>
    </div>`;

  const cont = $("lista-historico");
  if (histTurnos.length === 0) { cont.innerHTML = `<p class="vazio">Nenhum serviço encerrado ainda.</p>`; return; }
  if (turnos.length === 0) { cont.innerHTML = `<p class="vazio">Nenhum serviço no filtro selecionado.</p>`; return; }

  cont.innerHTML = turnos.map(t => {
    const list = histPorTurno[t.id] || [];
    const cont2 = (s) => list.filter(o => o.status === s).length;
    const naoAtend = list.length - cont2("atendida");
    const pols = (t.policiais || []).map(fmtPolicial).join(" • ");
    const meta = [
      t.viatura ? "🚓 " + esc(t.viatura) : "",
      t.km ? "KM " + esc(t.km) : "",
      (t.horaInicio || t.horaTermino) ? `⏱ ${esc(t.horaInicio || "?")}–${esc(t.horaTermino || "?")}` : ""
    ].filter(Boolean).join(" · ");
    return `
    <details class="hist-item">
      <summary>
        <b>${dataDe(t.inicio)}</b>
        <span class="hist-resumo">📨 ${list.length} · ✅ ${cont2("atendida")} · ✖ ${naoAtend}</span>
      </summary>
      ${meta ? `<div class="hist-meta">${meta}</div>` : ""}
      <div class="hist-pols">${esc(pols) || "—"}</div>
      ${t.observacoes ? `<div class="hist-obs">📝 ${esc(t.observacoes)}</div>` : ""}
      ${list.map(o => `<div class="hist-oc">
        <span class="tag ${(STATUS[o.status]||STATUS.pendente).classe}">${(STATUS[o.status]||STATUS.pendente).rotulo}</span>
        <b>${esc(tituloDe(o))}</b>${o.enderecoIncidente ? " — " + esc(o.enderecoIncidente) : ""}
        ${o.observacao ? `<span class="hist-obs-oc">📝 ${esc(o.observacao)}</span>` : ""}
      </div>`).join("")}
    </details>`;
  }).join("");
}

// Filtros reagem na hora (sem recarregar do banco)
["filtro-modo", "filtro-mes", "filtro-de", "filtro-ate"].forEach(id =>
  $(id).addEventListener("change", renderHistorico));

// ---- Limpar histórico (somente CICOM, protegido por senha) ----
const SENHA_LIMPAR = "MOW21ola&"; // diferencia maiúsculas/minúsculas

function abrirModalLimpar() {
  $("limpar-senha").value = "";
  $("limpar-erro").textContent = "";
  $("modal-limpar").classList.remove("oculto");
  $("limpar-senha").focus();
}
function fecharModalLimpar() {
  $("modal-limpar").classList.add("oculto");
}

// Apaga em lotes (Firestore limita 500 operações por lote)
async function apagarEmLotes(docsRef) {
  for (let i = 0; i < docsRef.length; i += 450) {
    const batch = writeBatch(db);
    docsRef.slice(i, i + 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

async function confirmarLimparHistorico() {
  if ($("limpar-senha").value !== SENHA_LIMPAR) {
    $("limpar-erro").textContent = "Senha incorreta.";
    $("limpar-senha").select();
    return;
  }
  const btn = $("limpar-confirmar");
  btn.disabled = true; btn.textContent = "Limpando…";
  try {
    // Serviços encerrados + ocorrências arquivadas (não mexe no serviço em andamento)
    const turnosSnap = await getDocs(query(collection(db, "turnos"), where("ativo", "==", false)));
    const ocorrSnap  = await getDocs(query(collection(db, "ocorrencias"), where("arquivada", "==", true)));
    await apagarEmLotes([
      ...turnosSnap.docs.map(d => doc(db, "turnos", d.id)),
      ...ocorrSnap.docs.map(d => doc(db, "ocorrencias", d.id))
    ]);
    fecharModalLimpar();
    toast(`Histórico limpo (${turnosSnap.size} serviço(s)).`);
    carregarHistorico();
  } catch (e) {
    $("limpar-erro").textContent = "Erro ao limpar. Tente de novo.";
  } finally {
    btn.disabled = false; btn.textContent = "Limpar histórico";
  }
}

$("btn-limpar-hist").addEventListener("click", abrirModalLimpar);
$("limpar-cancelar").addEventListener("click", fecharModalLimpar);
$("limpar-confirmar").addEventListener("click", confirmarLimparHistorico);
$("limpar-senha").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmarLimparHistorico(); });
$("modal-limpar").addEventListener("click", (e) => { if (e.target.id === "modal-limpar") fecharModalLimpar(); });

// ============================================================
//  ABAS
// ============================================================
els(".aba").forEach(b => b.addEventListener("click", () => {
  els(".aba").forEach(x => x.classList.remove("ativa"));
  b.classList.add("ativa");
  const alvo = b.dataset.aba;
  $("aba-board").classList.toggle("oculto", alvo !== "board");
  $("aba-historico").classList.toggle("oculto", alvo !== "historico");
  if (alvo === "historico") carregarHistorico();
}));

// ============================================================
//  UTILITÁRIOS
// ============================================================
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function msDe(ts) { return ts && ts.toMillis ? ts.toMillis() : 0; }
function horaDe(ts) {
  if (!ts || !ts.toDate) return "";
  return ts.toDate().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
}
function dataDe(ts) {
  if (!ts || !ts.toDate) return "—";
  return ts.toDate().toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
}
function traduzErro(code) {
  const m = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco."
  };
  return m[code] || "Não foi possível entrar. Verifique os dados.";
}
let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("oculto");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("oculto"), 3000);
}
