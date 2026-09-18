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
    const pols = (turnoAtivo.policiais || []).map(p =>
      `${p.graduacao ? p.graduacao + " " : ""}${p.nome}${p.matricula ? " ("+p.matricula+")" : ""}`
    ).join(" • ");
    barra.innerHTML = `
      <div class="turno-info">
        <span class="turno-dot"></span>
        <div>
          <strong>Guarnição em serviço${turnoAtivo.viatura ? " — " + esc(turnoAtivo.viatura) : ""}</strong>
          <div class="turno-pols">${esc(pols) || "—"}</div>
        </div>
      </div>
      ${perfil === "guarnicao"
        ? `<button id="btn-encerrar" class="btn btn-mini btn-perigo">Encerrar serviço</button>` : ""}
    `;
    barra.classList.add("ativa");
    const be = $("btn-encerrar");
    if (be) be.addEventListener("click", encerrarServico);
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

function prepararPainelAssumir() {
  $("painel-assumir").dataset.pronto = "1";
  const lista = $("lista-policiais");
  const addLinha = () => {
    const div = document.createElement("div");
    div.className = "policial-linha";
    div.innerHTML = `
      <input class="campo pol-grad" placeholder="Grad." />
      <input class="campo pol-nome" placeholder="Nome" />
      <input class="campo pol-mat" placeholder="Matrícula" />
      <button class="btn btn-mini btn-remove" title="Remover">✕</button>`;
    div.querySelector(".btn-remove").addEventListener("click", () => div.remove());
    lista.appendChild(div);
  };
  addLinha(); addLinha(); addLinha(); // começa com 3 linhas
  $("btn-add-policial").addEventListener("click", addLinha);
  $("btn-assumir").addEventListener("click", assumirServico);
}

async function assumirServico() {
  const policiais = els(".policial-linha").map(l => ({
    graduacao: l.querySelector(".pol-grad").value.trim(),
    nome: l.querySelector(".pol-nome").value.trim(),
    matricula: l.querySelector(".pol-mat").value.trim()
  })).filter(p => p.nome);

  if (policiais.length === 0) { toast("Informe ao menos um policial."); return; }

  await addDoc(collection(db, "turnos"), {
    ativo: true,
    viatura: $("turno-viatura").value.trim(),
    policiais,
    inicio: serverTimestamp(),
    fim: null,
    criadoPor: usuario.email
  });
  toast("Serviço assumido. Bom trabalho!");
}

async function encerrarServico() {
  if (!turnoAtivo) return;
  if (!confirm("Encerrar o serviço? As ocorrências vão para o histórico e o quadro fica limpo.")) return;

  const batch = writeBatch(db);
  // Arquiva as ocorrências do quadro e carimba com o turno
  const snap = await getDocs(query(collection(db, "ocorrencias"), where("arquivada", "==", false)));
  snap.forEach(d => batch.update(doc(db, "ocorrencias", d.id), {
    arquivada: true, turnoId: turnoAtivo.id
  }));
  batch.update(doc(db, "turnos", turnoAtivo.id), { ativo: false, fim: serverTimestamp() });
  await batch.commit();
  toast("Serviço encerrado.");
}

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

// Divide um texto colado em uma ou mais ocorrências e extrai os campos
function parseOcorrencias(texto) {
  const linhas = texto.split(/\r?\n/);
  const registros = [];
  let atual = null;
  let campoAtual = null;

  const salva = () => { if (atual && Object.values(atual).some(v => v)) registros.push(atual); };

  for (const linha of linhas) {
    if (!linha.trim()) continue;
    const rot = identificaRotulo(linha);
    if (rot) {
      // Novo "Município" indica início de outra ocorrência
      if (rot.chave === "municipioBairro" && atual && atual.municipioBairro) {
        salva();
        atual = null;
      }
      if (!atual) atual = { municipioBairro:"", enderecoIncidente:"", enderecoReferencia:"", descricao:"", rawText:"" };
      campoAtual = rot.chave;
      if (rot.resto) atual[campoAtual] = rot.resto;
    } else if (atual && campoAtual) {
      atual[campoAtual] += (atual[campoAtual] ? " " : "") + linha.trim();
    } else {
      // Texto solto antes de qualquer rótulo: trata como descrição de uma ocorrência avulsa
      if (!atual) atual = { municipioBairro:"", enderecoIncidente:"", enderecoReferencia:"", descricao:"", rawText:"" };
      atual.descricao += (atual.descricao ? " " : "") + linha.trim();
      campoAtual = "descricao";
    }
  }
  salva();
  registros.forEach(r => r.rawText = texto.trim());
  return registros;
}

// -------- Botões do painel CICOM --------
$("btn-previa").addEventListener("click", () => {
  const regs = parseOcorrencias($("entrada-colar").value);
  const previa = $("previa");
  if (regs.length === 0) { previa.classList.add("oculto"); toast("Nada reconhecido no texto."); return; }
  previa.classList.remove("oculto");
  previa.innerHTML = `<p class="dica">${regs.length} ocorrência(s) reconhecida(s):</p>` +
    regs.map((r, i) => `
      <div class="previa-card">
        <b>#${i+1} — ${esc(r.municipioBairro) || "(sem município/bairro)"}</b>
        <div><span>Incidente:</span> ${esc(r.enderecoIncidente) || "—"}</div>
        <div><span>Referência:</span> ${esc(r.enderecoReferencia) || "—"}</div>
        <div><span>Descrição:</span> ${esc(r.descricao) || "—"}</div>
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
      <b class="mun">${esc(o.municipioBairro) || "(sem município)"}</b>
      ${podeAgir ? `<span class="setas">
        <button class="btn-seta" data-mov="cima" data-id="${o.id}" ${idx===0?"disabled":""}>▲</button>
        <button class="btn-seta" data-mov="baixo" data-id="${o.id}" ${idx===total-1?"disabled":""}>▼</button>
      </span>` : ""}
    </div>
    <div class="card-corpo">
      <div><span>📍 Incidente:</span> ${esc(o.enderecoIncidente) || "—"}</div>
      ${o.enderecoReferencia ? `<div><span>🧭 Referência:</span> ${esc(o.enderecoReferencia)}</div>` : ""}
      ${o.descricao ? `<div><span>📝</span> ${esc(o.descricao)}</div>` : ""}
      ${o.enderecoIncidente ? `<a class="link-mapa" target="_blank"
          href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.enderecoIncidente)}">Abrir no mapa ↗</a>` : ""}
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
      <b class="mun">${esc(o.municipioBairro) || "(sem município)"}</b>
    </div>
    <div class="card-corpo">
      <div><span>📍</span> ${esc(o.enderecoIncidente) || "—"}</div>
      <div class="fin-meta">${o.finalizadoPor ? "por " + esc(o.finalizadoPor.split("@")[0]) : ""} ${horaDe(o.finalizadoEm)}</div>
    </div>
    ${perfil === "guarnicao" ? `<div class="card-acoes">
      <button class="btn btn-mini" data-reabrir="${o.id}">Reabrir</button></div>` : ""}
  </div>`;
}

function ligarEventosCards() {
  // Finalizar
  els("[data-fin]").forEach(b => b.addEventListener("click", async () => {
    await updateDoc(doc(db, "ocorrencias", b.dataset.id), {
      status: b.dataset.fin,
      finalizadoEm: serverTimestamp(),
      finalizadoPor: usuario.email
    });
  }));
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
async function carregarHistorico() {
  const cont = $("lista-historico");
  cont.innerHTML = `<p class="dica">Carregando…</p>`;
  const snap = await getDocs(query(collection(db, "turnos"), where("ativo", "==", false)));
  const turnos = [];
  snap.forEach(d => turnos.push({ id: d.id, ...d.data() }));
  turnos.sort((a, b) => msDe(b.inicio) - msDe(a.inicio));

  if (turnos.length === 0) { cont.innerHTML = `<p class="vazio">Nenhum serviço encerrado ainda.</p>`; return; }

  // Busca todas as ocorrências arquivadas de uma vez
  const oSnap = await getDocs(query(collection(db, "ocorrencias"), where("arquivada", "==", true)));
  const porTurno = {};
  oSnap.forEach(d => {
    const o = d.data();
    (porTurno[o.turnoId] = porTurno[o.turnoId] || []).push(o);
  });

  cont.innerHTML = turnos.map(t => {
    const list = porTurno[t.id] || [];
    const cont2 = (s) => list.filter(o => o.status === s).length;
    const pols = (t.policiais || []).map(p => `${p.graduacao||""} ${p.nome}${p.matricula?" ("+p.matricula+")":""}`.trim()).join(" • ");
    return `
    <details class="hist-item">
      <summary>
        <b>${dataDe(t.inicio)}</b> ${t.viatura ? "— "+esc(t.viatura) : ""}
        <span class="hist-resumo">✅ ${cont2("atendida")} · 🔍 ${cont2("endereco_nao_encontrado")} · ✖ ${cont2("nao_possivel")} · total ${list.length}</span>
      </summary>
      <div class="hist-pols">${esc(pols) || "—"}</div>
      ${list.map(o => `<div class="hist-oc">
        <span class="tag ${(STATUS[o.status]||STATUS.pendente).classe}">${(STATUS[o.status]||STATUS.pendente).rotulo}</span>
        <b>${esc(o.municipioBairro)}</b> — ${esc(o.enderecoIncidente)}
      </div>`).join("")}
    </details>`;
  }).join("");
}

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
  return ts.toDate().toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
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
