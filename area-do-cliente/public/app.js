// VGA • Área do Cliente — telas (sem framework, pensado primeiro para o celular).

const tela = document.getElementById("tela");
const menu = document.getElementById("menu");

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
const NOMES_DIAS = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo" };
const FORMATOS = { reels: "Reels", carrossel: "Carrossel", feed: "Feed", stories: "Stories" };
const STATUS = { falta_material: "Falta enviar", para_aprovar: "Para aprovar", ajuste: "Em ajuste", aprovado: "Aprovado", agendado: "Agendado", publicado: "Publicado" };
const TRAVADOS = ["aprovado", "agendado", "publicado"];
const NOMES_DIAS_MIN = { seg: "segunda", ter: "terça", qua: "quarta", qui: "quinta", sex: "sexta", sab: "sábado", dom: "domingo" };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const estado = {
  eu: null,
  semana: null, // semana vista (segunda-feira AAAA-MM-DD)
  dados: null, // resposta de /api/semana
  filtro: null, // filtro de status na lista de pautas
  abertos: new Set(), // pautas com detalhes abertos
  envios: [], // envios em andamento
  ultimaAnalise: null,
  cal: { so_meu: true },
  painel: "estrategias",
  irPara: null, // pauta para abrir ao entrar na Semana (vindo do Início ou dos Insights)
  insights: { mes: null, fonte: "meta" },
  adminInsights: { usuario: null, mes: null, fonte: "meta" },
};

// Parâmetros depois do "?" no endereço (ex.: #/semana?item=p3).
function parametros() {
  const q = location.hash.split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(q));
}

// ---------- utilidades ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
function somarDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function dataHora(isoUtc) {
  if (!isoUtc) return "";
  const d = new Date(isoUtc.includes("T") ? isoUtc : `${isoUtc.replace(" ", "T")}Z`);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
const icone = {
  semana: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h7"/></svg>',
  enviar: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3"/></svg>',
  calendario: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/><circle cx="12" cy="15" r="2"/></svg>',
  conta: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  painel: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
  inicio: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  insights: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  esq: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  dir: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  nuvem: '<svg viewBox="0 0 24 24"><path d="M7 18a5 5 0 0 1-.5-9.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9"/><path d="M12 12v9M9 15l3-3 3 3"/></svg>',
  copiar: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  brilho: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>',
};

let timerAviso;
function aviso(msg, erro = false) {
  const el = document.getElementById("aviso");
  el.textContent = msg;
  el.className = `mostrar${erro ? " erro" : ""}`;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => (el.className = ""), 3200);
}

class ErroApi extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}

async function api(caminho, { metodo = "GET", corpo } = {}) {
  const opcoes = { method: metodo, headers: {} };
  if (corpo !== undefined) {
    opcoes.headers["Content-Type"] = "application/json";
    opcoes.body = JSON.stringify(corpo);
  }
  let r;
  try {
    r = await fetch(caminho, opcoes);
  } catch {
    throw new ErroApi(0, "Sem conexão. Confira a internet e tente de novo.");
  }
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && !caminho.endsWith("/entrar")) {
    estado.eu = null;
    location.hash = "#/entrar";
    throw new ErroApi(401, dados.erro || "Faça login para continuar.");
  }
  if (!r.ok) throw new ErroApi(r.status, dados.erro || "Algo deu errado. Tente de novo.");
  return dados;
}

function definirCorNicho(cor) {
  document.documentElement.style.setProperty("--nicho", cor || "#39ff14");
}

function nichoDoUsuario() {
  return estado.eu?.nichos.find((n) => n.id === estado.eu.usuario.nicho) || null;
}

function carregando() {
  tela.innerHTML = '<div class="carregando"><div class="girando" aria-label="Carregando"></div></div>';
}

function abrirJanela(html) {
  const fundo = document.createElement("div");
  fundo.className = "fundo-janela";
  fundo.innerHTML = `<div class="janela" role="dialog" aria-modal="true">${html}</div>`;
  const fechar = () => fundo.remove();
  fundo.addEventListener("click", (e) => {
    if (e.target === fundo || e.target.closest("[data-fechar]")) fechar();
  });
  document.body.appendChild(fundo);
  fundo.querySelector("textarea, input")?.focus();
  return { el: fundo, fechar };
}

function topo(extra = "") {
  const n = nichoDoUsuario();
  return `<header class="topo">
    <a class="logo" href="#/inicio">VGA<span>.</span><small>ÁREA DO CLIENTE</small></a>
    <div class="espaco"></div>
    ${extra}
    ${n ? `<a class="chip-nicho" href="#/nicho" title="Trocar nicho">${n.icone} ${esc(n.curto)}</a>` : ""}
    ${estado.eu ? `<a class="botao-conta" href="#/conta" aria-label="Sua conta" title="Conta">${icone.conta}</a>` : ""}
  </header>`;
}

function desenharMenu(rota) {
  if (!estado.eu || rota === "entrar" || rota === "nicho") {
    menu.hidden = true;
    document.body.classList.add("sem-menu");
    return;
  }
  document.body.classList.remove("sem-menu");
  menu.hidden = false;
  const pend = estado.dados?.pendencias;
  const admin = estado.eu.usuario.papel === "admin";
  // No celular: Início, Semana, Enviar, Calendário e Insights. A equipe VGA troca "Enviar" pelo Painel.
  const itens = [
    ["inicio", "Início", 0],
    ["semana", "Semana", pend ? pend.para_aprovar : 0],
    ...(admin ? [] : [["enviar", "Enviar", 0]]),
    ["calendario", "Calendário", 0],
    ["insights", "Insights", 0],
    ...(admin ? [["painel", "Painel", 0]] : []),
  ];
  menu.innerHTML = `<nav aria-label="Menu principal">${itens
    .map(([id, nome, n]) => `<a href="#/${id}" ${rota === id ? 'aria-current="page"' : ""}>${icone[id]}${nome}${n ? `<span class="bolinha">${n}</span>` : ""}</a>`)
    .join("")}</nav>`;
}

// ---------- rotas ----------
async function rotear() {
  const rota = (location.hash.replace(/^#\/?/, "") || "inicio").split("?")[0];
  if (!estado.eu && rota !== "entrar") {
    try {
      estado.eu = await api("/api/eu");
    } catch (e) {
      if (e.status !== 401) return erroTela(e);
      return;
    }
  }
  if (estado.eu && !estado.eu.usuario.nicho && rota !== "nicho" && rota !== "entrar") {
    location.hash = "#/nicho";
    return;
  }
  definirCorNicho(nichoDoUsuario()?.cor);
  desenharMenu(rota);
  document.body.classList.toggle("largo", rota === "inicio" || rota === "insights" || rota === "");
  window.scrollTo(0, 0);
  const p = parametros();
  if (rota === "semana" && (p.item || p.filtro)) {
    estado.irPara = p.item || null;
    estado.filtro = p.filtro || null;
  }
  const telas = { entrar: telaEntrar, nicho: telaNicho, inicio: telaInicio, semana: telaSemana, enviar: telaEnviar, calendario: telaCalendario, insights: telaInsights, conta: telaConta, painel: telaPainel };
  const fn = telas[rota] || telaInicio;
  try {
    await fn();
  } catch (e) {
    if (e.status !== 401) erroTela(e);
  }
  desenharMenu(rota);
}

function erroTela(e) {
  tela.innerHTML = `${estado.eu ? topo() : ""}<div class="vazio"><p>${esc(e.message)}</p><p style="margin-top:12px"><button class="btn btn-contorno btn-pequeno" onclick="location.reload()">Tentar de novo</button></p></div>`;
}

// ---------- login ----------
function telaEntrar() {
  tela.innerHTML = `<section class="entrada">
    <div class="logo">VGA<span>.</span><small>GESTÃO DE NEGÓCIOS</small></div>
    <h1>Sua estratégia da semana, <span class="destaque">pronta para aprovar.</span></h1>
    <p class="sub">Entre com o e-mail e a senha que a VGA te enviou.</p>
    <form id="form-entrar" novalidate>
      <div class="campo"><label for="email">E-mail</label><input id="email" type="email" autocomplete="username" inputmode="email" required></div>
      <div class="campo"><label for="senha">Senha</label><input id="senha" type="password" autocomplete="current-password" required></div>
      <p class="erro" id="erro-entrar"></p>
      <button class="btn btn-verde btn-bloco" type="submit">Entrar</button>
    </form>
    <p class="ajuda" style="margin-top:20px">Esqueceu a senha? Fale com a equipe VGA pelo WhatsApp.</p>
  </section>`;
  const form = document.getElementById("form-entrar");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      await api("/api/entrar", { metodo: "POST", corpo: { email: form.email.value, senha: form.senha.value } });
      estado.eu = await api("/api/eu");
      location.hash = estado.eu.usuario.nicho ? "#/inicio" : "#/nicho";
    } catch (err) {
      document.getElementById("erro-entrar").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- escolha do nicho ----------
function telaNicho() {
  const atual = estado.eu.usuario.nicho;
  tela.innerHTML = `${atual ? topo() : `<header class="topo"><span class="logo">VGA<span>.</span><small>ÁREA DO CLIENTE</small></span></header>`}
    <div class="secao"><h2><span class="marca"></span>Qual é o seu nicho?</h2>
    <p>A estratégia da semana é montada para o seu tipo de negócio. Você pode trocar depois.</p></div>
    <div class="grade-nichos">${estado.eu.nichos
      .map((n) => `<button class="nicho-cartao" style="--c:${esc(n.cor)}" data-nicho="${esc(n.id)}" aria-pressed="${n.id === atual}">
        <span class="ic">${n.icone}</span><strong>${esc(n.nome)}</strong><span>${esc(n.objetivo)}</span></button>`)
      .join("")}</div>`;
  tela.querySelectorAll("[data-nicho]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await api("/api/eu/nicho", { metodo: "PUT", corpo: { nicho: b.dataset.nicho } });
        estado.eu.usuario.nicho = b.dataset.nicho;
        estado.dados = null;
        location.hash = "#/inicio";
      } catch (e) {
        aviso(e.message, true);
      }
    }),
  );
}

// ---------- semana ----------
async function carregarSemana() {
  const q = estado.semana ? `?semana=${estado.semana}` : "";
  estado.dados = await api(`/api/semana${q}`);
  estado.semana = estado.dados.semana;
  return estado.dados;
}

function navSemana(d) {
  const atual = d.semana === d.semanaAtual ? "Esta semana" : d.semana > d.semanaAtual ? "Próxima semana" : "Semana passada";
  return `<div class="semana-nav">
    <button class="redondo" data-ir="${esc(d.anterior || "")}" ${d.anterior ? "" : "disabled"} aria-label="Semana anterior">${icone.esq}</button>
    <div class="titulo"><strong>${atual}</strong><span>${ddmm(d.semana)} a ${ddmm(d.fim)}</span></div>
    <button class="redondo" data-ir="${esc(d.proxima || "")}" ${d.proxima ? "" : "disabled"} aria-label="Próxima semana">${icone.dir}</button>
  </div>`;
}

function ligarNavSemana(redesenhar) {
  tela.querySelectorAll("[data-ir]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!b.dataset.ir) return;
      estado.semana = b.dataset.ir;
      estado.filtro = null;
      carregando();
      await carregarSemana();
      redesenhar();
    }),
  );
}

function painelPendencias(p0) {
  const p = { ...p0, aprovado: (p0.aprovado || 0) + (p0.agendado || 0) + (p0.publicado || 0) };
  const total = p.falta_material + p.para_aprovar + p.ajuste + p.aprovado;
  const pct = total ? Math.round((p.aprovado / total) * 100) : 0;
  const caixa = (chave, classe, nome) =>
    `<button class="pend ${classe}" data-filtro="${chave}" aria-pressed="${estado.filtro === chave}"><b>${p[chave]}</b><span>${nome}</span></button>`;
  return `<div class="pendencias" role="group" aria-label="Pendências da semana">
      ${caixa("falta_material", "falta", "Falta enviar")}
      ${caixa("para_aprovar", "aprovar", "Para aprovar")}
      ${caixa("ajuste", "ajuste", "Em ajuste")}
      ${caixa("aprovado", "ok", "Aprovados")}
    </div>
    <div class="barra-progresso" aria-label="${pct}% aprovado"><i style="width:${pct}%"></i></div>
    <p class="ajuda" style="margin-top:6px;font-size:13px">${p.aprovado} de ${total} pautas aprovadas. Nada é publicado sem a sua aprovação.</p>`;
}

function resumoNicho(n) {
  const m = n.mes;
  return `<section class="cartao resumo-nicho" aria-label="Resumo do nicho">
    <div class="cab"><div class="ic">${n.icone}</div><div><span class="rotulo">Seu nicho</span><h1>${esc(n.nome)}</h1></div></div>
    <p class="obj"><strong>Objetivo:</strong> ${esc(n.objetivo)}</p>
    <div class="pilares">${n.pilares
      .map((p) => `<div class="pilar"><div class="topo-pilar"><b>${esc(p.nome)}</b><span>${p.pct}%</span></div>
        <div class="barra"><i style="width:${p.pct * 2.5}%"></i></div><p>${esc(p.descricao)}</p></div>`)
      .join("")}</div>
    <span class="rotulo">No mês</span>
    <div class="numeros">
      <div><b>${m.feed}</b><span>posts</span></div><div><b>${m.reels}</b><span>Reels</span></div>
      <div><b>${m.carrosseis}</b><span>carrosséis</span></div><div><b>${m.stories}</b><span>Stories</span></div>
    </div>
    ${m.extras?.length ? `<ul class="extras">${m.extras.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <div class="semana-tipo">${n.semanaTipo.map((s) => `<span>${esc(s)}</span>`).join("")}</div>
    ${n.compliance ? `<div class="aviso"><strong>Regras da profissão:</strong> ${esc(n.compliance)}</div>` : ""}
  </section>`;
}

function focoSemana(d) {
  const e = d.estrategia;
  const nesta = d.datas.filter((x) => x.nestaSemana);
  return `<section class="cartao foco" aria-label="Foco da semana">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="rotulo">Foco da semana</span>
      <span class="origem ${e.origem === "ia" ? "ia" : ""}">${e.origem === "ia" ? `✨ Atualizada pela IA ${dataHora(e.gerado_em)}` : "Modelo VGA do nicho"}</span>
    </div>
    <h3>${esc(e.tema)}</h3>
    <p>${esc(e.foco)}</p>
    ${e.tendencias?.length ? `<ul>${e.tendencias.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    ${e.fontes?.length ? `<details class="fontes"><summary>Fontes da pesquisa (${e.fontes.length})</summary>${e.fontes.map((f) => `<div><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.titulo)}</a></div>`).join("")}</details>` : ""}
    ${d.datas.length ? `<div class="datas-prox">${d.datas
      .map((x) => `<div class="data-chip ${x.nestaSemana ? "agora" : ""}"><b>${ddmm(x.inicio)}${x.fim ? `–${ddmm(x.fim)}` : ""}</b>${esc(x.nome)}</div>`)
      .join("")}</div>` : ""}
    ${nesta.length ? `<p class="ajuda" style="margin-top:8px;font-size:13px">Nesta semana: ${nesta.map((x) => esc(x.nome)).join(", ")}.</p>` : ""}
  </section>`;
}

function blocoMaterial(i) {
  if (i.arquivo) {
    const a = i.arquivo;
    const mini = a.miniatura ? `<img src="${esc(a.miniatura)}" alt="">` : a.tipo === "video" ? "🎬" : "🖼️";
    return `<div class="material">
      <a class="mini" href="${esc(a.url)}" target="_blank" rel="noopener" aria-label="Abrir arquivo">${mini}${a.tipo === "video" ? `<span class="play">▶ ${a.duracao ? `${Math.round(a.duracao)}s` : ""}</span>` : ""}</a>
      <div class="info"><strong>${a.tipo === "video" ? "Vídeo escolhido" : "Foto escolhida"}</strong>${esc(a.nome)}
        ${i.motivoIa ? `<div class="motivo">✨ ${esc(i.motivoIa)}</div>` : ""}
        ${a.analise?.observacao ? `<div>${esc(a.analise.observacao)}</div>` : ""}</div>
    </div>`;
  }
  if (!i.precisaMaterial) return `<div class="material"><div class="mini">✍️</div><div class="info"><strong>A VGA cria a arte</strong>${esc(i.material)}</div></div>`;
  return `<div class="material"><div class="mini">${i.formato === "reels" || i.formato === "stories" ? "🎥" : "📷"}</div><div class="info"><strong>O que enviar</strong>${esc(i.material)}</div></div>`;
}

function cartaoPauta(i) {
  const aberto = estado.abertos.has(i.id);
  const editavel = !TRAVADOS.includes(i.status);
  const legenda = i.legendaFinal;
  const detalhes = [
    i.roteiro?.length && `<div class="bloco"><span class="rotulo">Roteiro</span><ol>${i.roteiro.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></div>`,
    i.textoTela && `<div class="bloco"><span class="rotulo">Texto na tela</span><div class="texto-tela">${esc(i.textoTela)}</div></div>`,
    i.laminas?.length && `<div class="bloco"><span class="rotulo">Lâminas do carrossel</span><ol>${i.laminas.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></div>`,
    i.sequencia?.length && `<div class="bloco"><span class="rotulo">Sequência de Stories</span><div class="seq">${i.sequencia
      .map((s) => `<div><b>${esc(s.momento)}</b>${esc(s.ideia)}<em>${esc(s.recurso)}</em></div>`)
      .join("")}</div></div>`,
    legenda && `<div class="bloco"><span class="rotulo">Legenda pronta</span>
      <div class="legenda-box" data-legenda>${esc(legenda)}</div>
      <div class="linha-botoes" style="margin-top:8px">
        <button class="btn btn-contorno btn-pequeno" data-acao="copiar">${icone.copiar}Copiar legenda</button>
        ${editavel ? '<button class="btn btn-contorno btn-pequeno" data-acao="editar">Editar legenda e horário</button>' : ""}
      </div></div>`,
    !legenda && editavel && `<div class="bloco"><button class="btn btn-contorno btn-pequeno" data-acao="editar">Mudar horário</button></div>`,
    i.palavrasChave?.length && `<div class="bloco"><span class="rotulo">Palavras-chave para a legenda</span><div class="tags">${i.palavrasChave.map((p) => `<span>${esc(p)}</span>`).join("")}</div></div>`,
    i.audio && `<div class="bloco"><span class="rotulo">Áudio</span><p style="font-size:14px">${esc(i.audio)}</p></div>`,
    i.dica && `<p class="dica">💡 ${esc(i.dica)}</p>`,
    /\[[^\]]+\]/.test(legenda || "") && editavel && `<p class="dica">✏️ Troque o que está entre colchetes [ ] antes de aprovar (em "Editar legenda").</p>`,
  ].filter(Boolean).join("");

  let acoes;
  if (i.status === "agendado" || i.status === "publicado") {
    acoes = `<p class="ajuda" style="flex:1 1 100%;font-size:13px">${i.status === "publicado" ? "🚀 Publicado" : "🗓️ Agendado pela VGA"} para ${NOMES_DIAS[i.dia].toLowerCase()} às ${esc(i.horarioFinal)}.</p>`;
  } else if (i.status === "aprovado") {
    acoes = `<p class="ajuda" style="flex:1 1 100%;font-size:13px">✅ Aprovado ${i.aprovadoEm ? `em ${dataHora(i.aprovadoEm)}` : ""}. A VGA agenda para ${NOMES_DIAS[i.dia].toLowerCase()} às ${esc(i.horarioFinal)}.</p>
      ${i.versaoAnterior ? '<span class="versao-anterior">Pauta de uma versão anterior da estratégia.</span>' : '<button class="btn btn-contorno btn-pequeno" data-acao="desfazer">Desfazer aprovação</button>'}`;
  } else {
    acoes = `${i.precisaMaterial || i.arquivo ? `<button class="btn btn-contorno btn-pequeno" data-acao="arquivo">${icone.camera}${i.arquivo ? "Trocar arquivo" : "Enviar arquivo"}</button>` : ""}
      <button class="btn btn-contorno btn-pequeno" data-acao="ajuste">Pedir ajuste</button>
      <button class="btn btn-verde btn-pequeno" data-acao="aprovar">${icone.check}${i.status === "falta_material" ? "Aprovar pauta" : "Aprovar"}</button>`;
  }

  return `<article class="cartao pauta ${i.status}" id="pauta-${esc(i.id)}" data-item="${esc(i.id)}">
    <div class="corpo">
      <div class="meta"><span class="formato ${i.formato}">${FORMATOS[i.formato]}</span><span class="hora">🕒 ${esc(i.horarioFinal)}</span>
        <span class="status ${i.status}">${STATUS[i.status]}</span></div>
      <div class="pilar-tag">${esc(i.pilar)}${i.quadro ? ` · ${esc(i.quadro)}` : ""}</div>
      <h4>${esc(i.titulo)}</h4>
      ${i.gancho ? `<div class="gancho"><small>Gancho</small>${esc(i.gancho)}</div>` : ""}
      ${blocoMaterial(i)}
      ${i.status === "ajuste" && i.comentario ? `<div class="comentario"><strong>Seu pedido de ajuste:</strong> ${esc(i.comentario)}<br><span class="ajuda" style="font-size:12px">A equipe VGA vai ajustar e te avisar.</span></div>` : ""}
      ${detalhes ? `<details ${aberto ? "open" : ""}><summary>${i.formato === "stories" ? "Ver a sequência" : "Ver roteiro e legenda"}</summary>${detalhes}</details>` : ""}
    </div>
    <div class="acoes">${acoes}</div>
  </article>`;
}

function listaDias(d) {
  const bate = (i) => (estado.filtro === "aprovado" ? TRAVADOS.includes(i.status) : i.status === estado.filtro);
  const itens = estado.filtro ? d.itens.filter(bate) : d.itens;
  if (!itens.length) return `<div class="vazio">Nenhuma pauta com “${STATUS[estado.filtro]}”. <button class="link" data-limpar>Ver todas</button></div>`;
  const hoje = estado.eu.hoje;
  return DIAS.map((dia, idx) => {
    const doDia = itens.filter((i) => i.dia === dia);
    if (!doDia.length) return "";
    const data = somarDias(d.semana, idx);
    return `<section class="dia"><div class="dia-cab"><h3>${NOMES_DIAS[dia]}</h3><span>${ddmm(data)}</span>${data === hoje ? '<span class="hoje">HOJE</span>' : ""}</div>
      ${doDia.map(cartaoPauta).join("")}</section>`;
  }).join("");
}

async function telaSemana() {
  if (!estado.dados || estado.dados.nicho?.id !== estado.eu.usuario.nicho) {
    carregando();
    await carregarSemana();
  }
  desenharSemana();
}

function desenharSemana({ manterRolagem = false } = {}) {
  const y = window.scrollY;
  const d = estado.dados;
  definirCorNicho(d.nicho.cor);
  tela.innerHTML = `${topo()}
    ${navSemana(d)}
    ${painelPendencias(d.pendencias)}
    ${resumoNicho(d.nicho)}
    ${focoSemana(d)}
    <div class="secao" id="estrategia"><h2><span class="marca"></span>Estratégia da semana</h2>
      <p>Pauta de cada dia com ganchos, roteiros e legendas prontas. Envie o material, confira e aprove.</p>
      ${estado.filtro ? `<p style="margin-top:8px"><span class="chip" aria-pressed="true">Mostrando: ${STATUS[estado.filtro]}</span> <button class="link" data-limpar>Ver todas</button></p>` : ""}
    </div>
    <div id="dias">${listaDias(d)}</div>
    <input type="file" id="arquivo-pauta" accept="image/*,video/*" hidden>`;
  ligarNavSemana(() => desenharSemana());
  tela.querySelectorAll("[data-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      estado.filtro = estado.filtro === b.dataset.filtro ? null : b.dataset.filtro;
      desenharSemana({ manterRolagem: true });
      if (estado.filtro) document.getElementById("estrategia").scrollIntoView({ behavior: "smooth" });
    }),
  );
  tela.querySelectorAll("[data-limpar]").forEach((b) => b.addEventListener("click", () => {
    estado.filtro = null;
    desenharSemana({ manterRolagem: true });
  }));
  tela.querySelectorAll(".pauta details").forEach((det) =>
    det.addEventListener("toggle", () => {
      const id = det.closest("[data-item]").dataset.item;
      det.open ? estado.abertos.add(id) : estado.abertos.delete(id);
    }),
  );
  tela.querySelector("#dias").addEventListener("click", acaoPauta);
  if (manterRolagem) window.scrollTo(0, y);
  if (estado.irPara) {
    const alvo = document.getElementById(`pauta-${estado.irPara}`);
    estado.irPara = null;
    if (alvo) {
      alvo.querySelector("details")?.setAttribute("open", "");
      requestAnimationFrame(() => {
        window.scrollTo(0, alvo.getBoundingClientRect().top + window.scrollY - 80);
        alvo.animate?.([{ boxShadow: "0 0 0 3px var(--verde)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1600 });
      });
    }
  } else if (estado.filtro && !manterRolagem) {
    requestAnimationFrame(() => document.getElementById("estrategia")?.scrollIntoView());
  }
  desenharMenu("semana");
}

async function recarregarSemana() {
  await carregarSemana();
  desenharSemana({ manterRolagem: true });
}

async function acaoPauta(e) {
  const b = e.target.closest("[data-acao]");
  if (!b) return;
  const id = b.closest("[data-item]").dataset.item;
  const item = estado.dados.itens.find((i) => i.id === id);
  const corpo = { semana: estado.semana, item_id: id };
  const acao = b.dataset.acao;
  try {
    if (acao === "copiar") {
      await navigator.clipboard.writeText(item.legendaFinal);
      return aviso("Legenda copiada!");
    }
    if (acao === "aprovar") {
      if (/\[[^\]]+\]/.test(item.legendaFinal || "") && !confirm("A legenda ainda tem trechos entre colchetes [ ] para preencher. Aprovar mesmo assim? A VGA completa com você.")) return;
      b.disabled = true;
      await api("/api/itens/aprovar", { metodo: "POST", corpo });
      aviso("Aprovado! ✅");
      return recarregarSemana();
    }
    if (acao === "desfazer") {
      b.disabled = true;
      await api("/api/itens/desfazer", { metodo: "POST", corpo });
      aviso("Aprovação desfeita.");
      return recarregarSemana();
    }
    if (acao === "ajuste") return janelaAjuste(item);
    if (acao === "editar") return janelaEditar(item);
    if (acao === "arquivo") {
      const input = document.getElementById("arquivo-pauta");
      input.value = "";
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        aviso("Enviando arquivo…");
        try {
          await enviarArquivo(f, { item: id });
          aviso("Arquivo enviado! Confira e aprove.");
          await recarregarSemana();
        } catch (err) {
          aviso(err.message, true);
        }
      };
      input.click();
    }
  } catch (err) {
    b.disabled = false;
    aviso(err.message, true);
  }
}

function janelaAjuste(item) {
  const j = abrirJanela(`<h3>Pedir ajuste</h3><p class="ajuda" style="margin-bottom:12px">${esc(item.titulo)}</p>
    <div class="campo"><label for="txt-ajuste">O que você quer mudar?</label>
    <textarea id="txt-ajuste" maxlength="1000" placeholder="Ex.: trocar o prato por um de frutos do mar; prefiro postar às 18h."></textarea></div>
    <p class="erro" id="erro-ajuste"></p>
    <div class="linha-botoes"><button class="btn btn-contorno" data-fechar>Cancelar</button><button class="btn btn-laranja" id="enviar-ajuste">Enviar pedido</button></div>`);
  j.el.querySelector("#enviar-ajuste").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    try {
      await api("/api/itens/ajuste", { metodo: "POST", corpo: { semana: estado.semana, item_id: item.id, comentario: j.el.querySelector("#txt-ajuste").value } });
      j.fechar();
      aviso("Pedido enviado para a equipe VGA.");
      recarregarSemana();
    } catch (err) {
      ev.target.disabled = false;
      j.el.querySelector("#erro-ajuste").textContent = err.message;
    }
  });
}

function janelaEditar(item) {
  const temLegenda = Boolean(item.legenda);
  const j = abrirJanela(`<h3>${temLegenda ? "Editar legenda e horário" : "Mudar horário"}</h3><p class="ajuda" style="margin-bottom:12px">${esc(item.titulo)}</p>
    ${temLegenda ? `<div class="campo"><label for="txt-legenda">Legenda</label><textarea id="txt-legenda" maxlength="2200" style="min-height:220px">${esc(item.legendaFinal)}</textarea></div>` : ""}
    <div class="campo"><label for="txt-horario">Horário de postagem (${NOMES_DIAS[item.dia]})</label><input id="txt-horario" type="time" value="${esc(item.horarioFinal)}"></div>
    <p class="erro" id="erro-editar"></p>
    <div class="linha-botoes"><button class="btn btn-contorno" data-fechar>Cancelar</button><button class="btn btn-verde" id="salvar-editar">Salvar</button></div>
    ${temLegenda ? '<p style="margin-top:10px"><button class="link" id="voltar-original">Voltar para a legenda original</button></p>' : ""}`);
  j.el.querySelector("#voltar-original")?.addEventListener("click", () => (j.el.querySelector("#txt-legenda").value = item.legenda));
  j.el.querySelector("#salvar-editar").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    const corpo = { semana: estado.semana, item_id: item.id, horario: j.el.querySelector("#txt-horario").value };
    if (temLegenda) corpo.legenda = j.el.querySelector("#txt-legenda").value;
    try {
      await api("/api/itens", { metodo: "PUT", corpo });
      j.fechar();
      aviso("Alterações salvas.");
      recarregarSemana();
    } catch (err) {
      ev.target.disabled = false;
      j.el.querySelector("#erro-editar").textContent = err.message;
    }
  });
}

// ---------- envio de arquivos ----------
// Gera no celular uma prévia leve (JPEG) + dimensões e duração. É o que a IA analisa.
function gerarPrevia(file) {
  const LADO = 1024;
  const desenhar = (fonte, w, h) =>
    new Promise((ok) => {
      const escala = Math.min(1, LADO / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.round(w * escala);
      c.height = Math.round(h * escala);
      c.getContext("2d").drawImage(fonte, 0, 0, c.width, c.height);
      c.toBlob((b) => ok(b), "image/jpeg", 0.8);
    });
  if (file.type.startsWith("video/")) {
    return new Promise((ok) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      let feito = false;
      const fim = (r) => {
        if (feito) return;
        feito = true;
        URL.revokeObjectURL(url);
        ok(r);
      };
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
      };
      v.onseeked = async () => {
        const blob = v.videoWidth ? await desenhar(v, v.videoWidth, v.videoHeight).catch(() => null) : null;
        fim({ largura: v.videoWidth, altura: v.videoHeight, duracao: v.duration, blob });
      };
      v.onerror = () => fim({});
      setTimeout(() => fim({ largura: v.videoWidth || null, altura: v.videoHeight || null, duracao: v.duration || null, blob: null }), 10000);
      v.src = url;
    });
  }
  return createImageBitmap(file)
    .then(async (bmp) => {
      const blob = await desenhar(bmp, bmp.width, bmp.height);
      const r = { largura: bmp.width, altura: bmp.height, blob };
      bmp.close?.();
      return r;
    })
    .catch(() => ({}));
}

function enviarArquivo(file, { item = "", aoProgredir = () => {} } = {}) {
  return gerarPrevia(file).then(
    (previa) =>
      new Promise((ok, falha) => {
        const p = new URLSearchParams({ semana: estado.semana, nome: file.name.slice(0, 160) });
        if (item) p.set("item", item);
        if (previa.largura) p.set("largura", previa.largura);
        if (previa.altura) p.set("altura", previa.altura);
        if (previa.duracao && Number.isFinite(previa.duracao)) p.set("duracao", previa.duracao.toFixed(1));
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/arquivos?${p}`);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => e.lengthComputable && aoProgredir(e.loaded / e.total);
        xhr.onerror = () => falha(new Error("Falha de conexão no envio."));
        xhr.onload = async () => {
          let r = {};
          try {
            r = JSON.parse(xhr.responseText);
          } catch {}
          if (xhr.status === 401) {
            location.hash = "#/entrar";
            return falha(new Error("Faça login de novo."));
          }
          if (xhr.status >= 300) return falha(new Error(r.erro || "Não foi possível enviar."));
          if (previa.blob) {
            await fetch(`/api/arquivos/${r.arquivo.id}/miniatura`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: previa.blob }).catch(() => {});
          }
          ok(r.arquivo);
        };
        xhr.send(file);
      }),
  );
}

async function telaEnviar() {
  if (!estado.dados || estado.dados.nicho?.id !== estado.eu.usuario.nicho) {
    carregando();
    await carregarSemana();
  }
  desenharEnviar();
}

function desenharEnviar() {
  const d = estado.dados;
  const usadoEm = new Map();
  for (const i of d.itens) if (i.arquivo) usadoEm.set(i.arquivo.id, i);
  const falta = d.itens.filter((i) => i.status === "falta_material");
  const nota = (a) => {
    const n = a.analise?.nota;
    if (n === undefined || n === null) return "";
    return `<span class="nota ${n >= 7 ? "boa" : n >= 5 ? "media" : "ruim"}">${n}/10</span>`;
  };
  tela.innerHTML = `${topo()}
    ${navSemana(d)}
    <div class="secao"><h2><span class="marca"></span>Enviar fotos e vídeos</h2>
      <p>Envie o material da semana. A IA escolhe os melhores para cada pauta e define legenda e horário. Depois é só conferir e aprovar.</p></div>
    <label class="zona-envio" id="zona">${icone.nuvem}<strong>Toque para escolher</strong><span class="ajuda">Fotos e vídeos do celular · vídeo na vertical para Reels</span>
      <input type="file" id="arquivos" accept="image/*,video/*" multiple hidden></label>
    <div class="envios" id="envios"></div>
    ${falta.length ? `<div class="cartao" style="margin-top:16px"><span class="rotulo">Ainda falta material para</span>
      <ul style="padding-left:18px;margin-top:6px;font-size:14px;display:flex;flex-direction:column;gap:4px">${falta
        .map((i) => `<li><strong>${NOMES_DIAS[i.dia]} · ${FORMATOS[i.formato]}</strong> — ${esc(i.material)}</li>`)
        .join("")}</ul></div>` : ""}
    <div class="secao"><h2><span class="marca"></span>Material da semana (${d.arquivos.length})</h2></div>
    ${d.arquivos.length ? `<div class="galeria">${d.arquivos
      .map((a) => {
        const usado = usadoEm.get(a.id);
        return `<div class="arq" title="${esc(a.analise?.descricao || a.nome)}">
          <a href="${esc(a.url)}" target="_blank" rel="noopener">${a.miniatura ? `<img src="${esc(a.miniatura)}" alt="${esc(a.nome)}" loading="lazy">` : `<div class="sem-previa">${a.tipo === "video" ? "🎬" : "🖼️"}</div>`}</a>
          ${nota(a)}<span class="tipo">${a.tipo === "video" ? `▶ ${a.duracao ? `${Math.round(a.duracao)}s` : "vídeo"}` : "foto"}</span>
          ${usado ? `<span class="usado">${NOMES_DIAS[usado.dia].slice(0, 3)}</span>` : ""}
          ${TRAVADOS.includes(usado?.status) ? "" : `<button class="apagar" data-apagar="${esc(a.id)}" aria-label="Apagar ${esc(a.nome)}">×</button>`}
        </div>`;
      })
      .join("")}</div>` : '<div class="vazio">Nenhum arquivo enviado nesta semana ainda.</div>'}
    ${estado.ultimaAnalise ? `<div class="cartao resultado-ia" style="margin-top:16px"><span class="rotulo">${estado.ultimaAnalise.origem === "ia" ? "✨ Análise da IA" : "Análise automática"}</span>
      <p style="margin:6px 0 10px">${esc(estado.ultimaAnalise.resumo)}</p><a class="btn btn-verde btn-bloco" href="#/semana">Ver a semana e aprovar</a></div>` : ""}
    <div style="margin-top:16px">
      <button class="btn btn-nicho btn-bloco" id="analisar" ${d.arquivos.length ? "" : "disabled"}>${icone.brilho}${d.ia ? "Analisar com IA e montar a semana" : "Distribuir arquivos nas pautas"}</button>
      <p class="ajuda" style="margin-top:8px;font-size:13px;text-align:center">${d.ia ? "A IA olha cada arquivo, dá uma nota e escolhe o melhor para cada pauta." : "Sem a IA ligada, o sistema distribui os arquivos por formato (vídeo em Reels, foto no feed)."}</p>
    </div>`;
  ligarNavSemana(desenharEnviar);
  desenharEnvios();

  const input = document.getElementById("arquivos");
  const zona = document.getElementById("zona");
  input.addEventListener("change", () => enviarVarios([...input.files]));
  zona.addEventListener("dragover", (e) => {
    e.preventDefault();
    zona.classList.add("arrastando");
  });
  zona.addEventListener("dragleave", () => zona.classList.remove("arrastando"));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    zona.classList.remove("arrastando");
    enviarVarios([...e.dataTransfer.files]);
  });
  tela.querySelectorAll("[data-apagar]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Apagar este arquivo?")) return;
      try {
        await api(`/api/arquivos/${b.dataset.apagar}`, { metodo: "DELETE" });
        await carregarSemana();
        desenharEnviar();
      } catch (e) {
        aviso(e.message, true);
      }
    }),
  );
  document.getElementById("analisar").addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    b.innerHTML = '<span class="girando" style="width:20px;height:20px;border-width:2px"></span> Analisando… pode levar 1 minuto';
    try {
      const r = await api("/api/analisar", { metodo: "POST", corpo: { semana: estado.semana } });
      estado.dados = r.semana;
      estado.ultimaAnalise = r;
      aviso(r.escolhas ? `${r.escolhas} pauta(s) receberam arquivo.` : "Análise pronta.");
      desenharEnviar();
    } catch (e) {
      aviso(e.message, true);
      desenharEnviar();
    }
  });
}

function desenharEnvios() {
  const el = document.getElementById("envios");
  if (!el) return;
  el.innerHTML = estado.envios
    .map((e) => `<div class="envio ${e.erro ? "erro-envio" : ""}"><span>${e.tipo === "video" ? "🎬" : "🖼️"}</span><span class="nome">${esc(e.nome)}</span>
      ${e.erro ? `<span>${esc(e.erro)}</span>` : e.ok ? "<span>✅</span>" : `<div class="barra-progresso"><i style="width:${Math.round(e.p * 100)}%"></i></div>`}</div>`)
    .join("");
}

async function enviarVarios(arquivos) {
  if (!arquivos.length) return;
  const lote = arquivos.map((f) => ({ f, nome: f.name, tipo: f.type.startsWith("video/") ? "video" : "foto", p: 0, ok: false, erro: "" }));
  estado.envios = lote;
  desenharEnvios();
  for (const e of lote) {
    try {
      await enviarArquivo(e.f, {
        aoProgredir: (p) => {
          e.p = p;
          desenharEnvios();
        },
      });
      e.ok = true;
    } catch (err) {
      e.erro = err.message;
    }
    desenharEnvios();
  }
  const okTotal = lote.filter((e) => e.ok).length;
  if (okTotal) aviso(`${okTotal} arquivo(s) enviado(s).`);
  await carregarSemana();
  estado.envios = lote.filter((e) => e.erro);
  if (location.hash.startsWith("#/enviar")) desenharEnviar();
}

// ---------- calendário ----------
async function telaCalendario() {
  carregando();
  const c = await api("/api/calendario");
  const desenhar = () => {
    const lista = c.datas.filter((d) => !estado.cal.so_meu || d.doMeuNicho);
    const porMes = new Map();
    for (const d of lista) {
      const chave = d.inicio < c.hoje ? c.hoje.slice(0, 7) : d.inicio.slice(0, 7);
      if (!porMes.has(chave)) porMes.set(chave, []);
      porMes.get(chave).push(d);
    }
    const nomesNichos = new Map(c.nichos.map((n) => [n.id, n.curto]));
    tela.innerHTML = `${topo()}
      <div class="secao"><h2><span class="marca"></span>Calendário</h2>
      <p>Datas comerciais, feriados, datas de natureza e campanhas de saúde. Comece a divulgar as datas comerciais 2 a 3 semanas antes.</p></div>
      <div class="filtros"><button class="chip" data-cal="1" aria-pressed="${estado.cal.so_meu}">Do meu nicho</button>
        <button class="chip" data-cal="0" aria-pressed="${!estado.cal.so_meu}">Todas as datas</button></div>
      ${[...porMes.entries()]
        .map(([mes, ds]) => `<section class="mes"><h3>${MESES[Number(mes.slice(5, 7)) - 1].replace(/^./, (l) => l.toUpperCase())} de ${mes.slice(0, 4)}</h3>${ds
          .map((d) => {
            const nichos = d.nichos.includes("todos") ? "Todos os nichos" : d.nichos.map((n) => nomesNichos.get(n) || n).join(", ");
            const dia = d.fim ? `${d.inicio.slice(8, 10)}` : d.inicio.slice(8, 10);
            return `<div class="ev ${d.doMeuNicho ? "meu" : ""}"><div class="dt"><b>${d.fim ? "📅" : dia}</b><span>${d.fim ? "período" : MESES[Number(d.inicio.slice(5, 7)) - 1].slice(0, 3)}</span></div>
              <div class="txt"><strong>${esc(d.nome)}</strong><small>${d.fim ? `${ddmm(d.inicio)} a ${ddmm(d.fim)} · ` : ""}${esc(nichos)}</small>
              <span class="tipo-ev ${esc(d.tipo)}">${esc(d.tipo)}</span>
              ${d.divulgarDesde && d.divulgarDesde >= c.hoje ? `<span class="divulgar">📣 Comece a divulgar a partir de ${ddmm(d.divulgarDesde)}</span>` : ""}</div></div>`;
          })
          .join("")}</section>`)
        .join("") || '<div class="vazio">Nenhuma data por aqui.</div>'}
      <p class="ajuda" style="font-size:13px">Datas locais de Morretes entram numa próxima atualização.</p>`;
    tela.querySelectorAll("[data-cal]").forEach((b) =>
      b.addEventListener("click", () => {
        estado.cal.so_meu = b.dataset.cal === "1";
        desenhar();
      }),
    );
  };
  desenhar();
}

// ---------- conta ----------
function telaConta() {
  const u = estado.eu.usuario;
  const n = nichoDoUsuario();
  tela.innerHTML = `${topo()}
    <div class="secao"><h2><span class="marca"></span>Sua conta</h2></div>
    <div class="cartao">
      <p><strong>${esc(u.nome)}</strong></p><p class="ajuda">${esc(u.email)}</p>
      ${u.negocio || u.cidade ? `<p style="margin-top:8px">${esc(u.negocio)}${u.cidade ? ` · ${esc(u.cidade)}` : ""}</p>` : ""}
      <p class="ajuda" style="font-size:13px;margin-top:4px">Para mudar o nome do negócio ou a cidade, fale com a VGA.</p>
    </div>
    <div class="cartao"><span class="rotulo">Nicho</span>
      <p style="margin:6px 0 10px;font-size:18px">${n ? `${n.icone} ${esc(n.nome)}` : "Não escolhido"}</p>
      <a class="btn btn-contorno btn-pequeno" href="#/nicho">Trocar nicho</a></div>
    <form class="cartao" id="form-senha"><span class="rotulo">Trocar senha</span>
      <div class="campo" style="margin-top:10px"><label for="s-atual">Senha atual</label><input id="s-atual" type="password" autocomplete="current-password" required></div>
      <div class="campo"><label for="s-nova">Nova senha (mínimo 8 caracteres)</label><input id="s-nova" type="password" autocomplete="new-password" minlength="8" required></div>
      <p class="erro" id="erro-senha"></p>
      <button class="btn btn-contorno btn-pequeno" type="submit">Salvar nova senha</button></form>
    <button class="btn btn-perigo btn-bloco" id="sair" style="margin-top:8px">Sair</button>`;
  document.getElementById("form-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      await api("/api/eu/senha", { metodo: "PUT", corpo: { atual: f["s-atual"].value, nova: f["s-nova"].value } });
      f.reset();
      document.getElementById("erro-senha").textContent = "";
      aviso("Senha alterada.");
    } catch (err) {
      document.getElementById("erro-senha").textContent = err.message;
    }
  });
  document.getElementById("sair").addEventListener("click", async () => {
    await api("/api/sair", { metodo: "POST" }).catch(() => {});
    estado.eu = null;
    estado.dados = null;
    estado.semana = null;
    estado.insights.mes = null;
    location.hash = "#/entrar";
  });
}

// ---------- painel VGA ----------
let timerPainel;
async function telaPainel() {
  if (estado.eu.usuario.papel !== "admin") {
    location.hash = "#/semana";
    return;
  }
  clearTimeout(timerPainel);
  const abas = [["estrategias", "Estratégias"], ["fila", "Aprovados e ajustes"], ["insights", "Insights"], ["clientes", "Clientes"]];
  const cab = `${topo()}<div class="secao"><h2><span class="marca"></span>Painel VGA</h2><p>Atualização semanal, fila de agendamento e acessos dos clientes.</p></div>
    <div class="filtros">${abas.map(([id, nome]) => `<button class="chip" data-aba="${id}" aria-pressed="${estado.painel === id}">${nome}</button>`).join("")}</div>`;
  tela.innerHTML = `${cab}<div id="painel-corpo"><div class="carregando" style="min-height:30dvh"><div class="girando"></div></div></div>`;
  tela.querySelectorAll("[data-aba]").forEach((b) =>
    b.addEventListener("click", () => {
      estado.painel = b.dataset.aba;
      telaPainel();
    }),
  );
  const corpo = document.getElementById("painel-corpo");
  if (estado.painel === "estrategias") return painelEstrategias(corpo);
  if (estado.painel === "fila") return painelFila(corpo);
  if (estado.painel === "insights") return painelInsights(corpo);
  return painelClientes(corpo);
}

function pillSemana(s) {
  if (!s) return '<span class="pill">não gerada</span>';
  return `<span class="pill ${s.origem === "ia" ? "ia" : ""}">${s.origem === "ia" ? `IA · ${dataHora(s.gerado_em)}` : "modelo pronto"}</span>`;
}

async function painelEstrategias(corpo) {
  const r = await api("/api/admin/estrategias");
  const algumRodando = r.nichos.some((n) => n.rodando.length);
  corpo.innerHTML = `${r.ia ? "" : '<div class="aviso" style="margin-bottom:12px"><strong>IA desligada:</strong> configure a variável ANTHROPIC_API_KEY no servidor para gerar as estratégias com pesquisa de tendências.</div>'}
    <p class="ajuda" style="margin-bottom:12px;font-size:13px">A IA atualiza sozinha: a semana atual (se ainda estiver no modelo e ninguém começou) e, a partir de sexta, a próxima semana. Os botões forçam uma nova geração agora.</p>
    <div class="lista-adm">${r.nichos
      .map((n) => `<div class="cartao" style="border-left:4px solid ${esc(n.cor)}"><div class="adm-linha"><span class="ic">${n.icone}</span>
        <div class="txt"><strong>${esc(n.nome)}</strong><small>${n.clientes} cliente(s)</small></div></div>
        <table class="tabela" style="margin-top:8px"><tr><th>Semana</th><th>Situação</th></tr>
          <tr><td>Atual (${ddmm(r.atual)})</td><td>${n.rodando.includes(r.atual) ? '<span class="pill rodando">gerando…</span>' : pillSemana(n.atual)}${n.atual?.tema ? `<br><small class="ajuda">${esc(n.atual.tema)}</small>` : ""}</td></tr>
          <tr><td>Próxima (${ddmm(r.proxima)})</td><td>${n.rodando.includes(r.proxima) ? '<span class="pill rodando">gerando…</span>' : pillSemana(n.proxima)}${n.proxima?.tema ? `<br><small class="ajuda">${esc(n.proxima.tema)}</small>` : ""}</td></tr>
        </table>
        ${n.ultima ? `<p class="ajuda" style="font-size:12px;margin-top:6px">Última geração (${ddmm(n.ultima.semana)}): <span class="pill ${n.ultima.status === "erro" ? "erro" : n.ultima.status === "rodando" ? "rodando" : "ia"}">${esc(n.ultima.status)}</span> ${esc(n.ultima.mensagem)}</p>` : ""}
        <div class="linha-botoes" style="margin-top:10px">
          <button class="btn btn-contorno btn-pequeno" data-gerar="${esc(n.id)}" data-semana="atual" ${r.ia ? "" : "disabled"}>Gerar esta semana</button>
          <button class="btn btn-contorno btn-pequeno" data-gerar="${esc(n.id)}" data-semana="proxima" ${r.ia ? "" : "disabled"}>Gerar próxima</button>
        </div></div>`)
      .join("")}</div>`;
  corpo.querySelectorAll("[data-gerar]").forEach((b) =>
    b.addEventListener("click", async () => {
      const pedir = (forcar) => api("/api/admin/estrategias/gerar", { metodo: "POST", corpo: { nicho: b.dataset.gerar, semana: b.dataset.semana, forcar } });
      b.disabled = true;
      try {
        await pedir(false);
        aviso("Gerando… leva de 2 a 5 minutos.");
      } catch (e) {
        if (e.status === 409 && /começaram/.test(e.message) && confirm(`${e.message}\n\nGerar mesmo assim? As pautas já aprovadas ficam guardadas; as não aprovadas são substituídas.`)) {
          await pedir(true).catch((x) => aviso(x.message, true));
          aviso("Gerando… leva de 2 a 5 minutos.");
        } else {
          aviso(e.message, true);
        }
      }
      setTimeout(() => painelEstrategias(corpo), 1200);
    }),
  );
  if (algumRodando) timerPainel = setTimeout(() => location.hash === "#/painel" && estado.painel === "estrategias" && painelEstrategias(corpo), 6000);
}

async function painelFila(corpo) {
  const r = await api("/api/admin/fila");
  if (!r.itens.length) {
    corpo.innerHTML = '<div class="vazio">Nenhuma pauta aprovada ou com pedido de ajuste ainda.</div>';
    return;
  }
  corpo.innerHTML = `<p class="ajuda" style="margin-bottom:12px;font-size:13px">Pautas aprovadas prontas para agendar (publicação automática pelo Metricool fica para a próxima fase) e pedidos de ajuste dos clientes.</p>
    ${r.itens
      .map((i, n) => `<div class="cartao pauta ${i.status}" style="padding:14px">
        <div class="meta"><span class="formato ${esc(i.formato)}">${FORMATOS[i.formato] || ""}</span><span class="hora">${i.data ? `${NOMES_DIAS[i.dia]} ${ddmm(i.data)}` : ""} · ${esc(i.horario || "")}</span><span class="status ${i.status}">${STATUS[i.status]}</span></div>
        <p style="font-size:13px;color:var(--texto-2)">${esc(i.cliente)}${i.negocio ? ` · ${esc(i.negocio)}` : ""}</p>
        <h4>${esc(i.titulo)}</h4>
        ${i.status === "ajuste" ? `<div class="comentario"><strong>Pedido:</strong> ${esc(i.comentario)}</div>` : ""}
        ${i.arquivo ? `<div class="material"><a class="mini" href="${esc(i.arquivo.url)}" target="_blank" rel="noopener">${i.arquivo.miniatura ? `<img src="${esc(i.arquivo.miniatura)}" alt="">` : "📎"}</a>
          <div class="info"><strong>${esc(i.arquivo.nome)}</strong><a class="link" href="${esc(i.arquivo.url)}?baixar=1">Baixar arquivo</a></div></div>` : ""}
        ${i.legenda ? `<div class="legenda-box" style="margin-top:10px">${esc(i.legenda)}</div><button class="btn btn-contorno btn-pequeno" style="margin-top:8px" data-copiar="${n}">${icone.copiar}Copiar legenda</button>` : ""}
        ${i.sequencia?.length ? `<div class="seq" style="margin-top:10px">${i.sequencia.map((s) => `<div><b>${esc(s.momento)}</b>${esc(s.ideia)}<em>${esc(s.recurso)}</em></div>`).join("")}</div>` : ""}
        ${TRAVADOS.includes(i.status) ? `<div class="linha-botoes" style="margin-top:10px">
          ${i.status === "aprovado" ? `<button class="btn btn-contorno btn-pequeno" data-marcar="${n}" data-status="agendado">🗓️ Marcar como agendado</button>` : ""}
          ${i.status !== "publicado" ? `<button class="btn btn-verde btn-pequeno" data-marcar="${n}" data-status="publicado">🚀 Marcar como publicado</button>` : `<button class="btn btn-contorno btn-pequeno" data-marcar="${n}" data-status="agendado">Voltar para agendado</button>`}
        </div>` : ""}
      </div>`)
      .join("")}`;
  corpo.querySelectorAll("[data-copiar]").forEach((b) =>
    b.addEventListener("click", async () => {
      await navigator.clipboard.writeText(r.itens[Number(b.dataset.copiar)].legenda);
      aviso("Legenda copiada!");
    }),
  );
  corpo.querySelectorAll("[data-marcar]").forEach((b) =>
    b.addEventListener("click", async () => {
      const i = r.itens[Number(b.dataset.marcar)];
      try {
        await api("/api/admin/fila/status", { metodo: "POST", corpo: { usuario_id: i.usuario_id, semana: i.semana, item_id: i.item_id, status: b.dataset.status } });
        aviso(b.dataset.status === "publicado" ? "Marcado como publicado." : "Marcado como agendado.");
        painelFila(corpo);
      } catch (e) {
        aviso(e.message, true);
      }
    }),
  );
}

function senhaAleatoria() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const v = crypto.getRandomValues(new Uint32Array(10));
  return [...v].map((x) => letras[x % letras.length]).join("");
}

async function painelClientes(corpo) {
  const r = await api("/api/admin/clientes");
  const opcoesNicho = (sel) => `<option value="">— escolher depois —</option>${estado.eu.nichos.map((n) => `<option value="${n.id}" ${n.id === sel ? "selected" : ""}>${n.icone} ${esc(n.nome)}</option>`).join("")}`;
  corpo.innerHTML = `<form class="cartao" id="novo-cliente"><span class="rotulo">Novo acesso</span>
      <div class="campo" style="margin-top:10px"><label for="c-nome">Nome do cliente</label><input id="c-nome" required></div>
      <div class="campo"><label for="c-email">E-mail (login)</label><input id="c-email" type="email" required></div>
      <div class="campo"><label for="c-senha">Senha inicial</label><input id="c-senha" value="${senhaAleatoria()}" required minlength="8"></div>
      <div class="campo"><label for="c-negocio">Nome do negócio (entra nas legendas)</label><input id="c-negocio" placeholder="Ex.: Restaurante Ponte Velha"></div>
      <div class="campo"><label for="c-cidade">Cidade</label><input id="c-cidade" value="Morretes"></div>
      <div class="campo"><label for="c-nicho">Nicho</label><select id="c-nicho">${opcoesNicho("")}</select></div>
      <div class="campo"><label for="c-papel">Tipo de acesso</label><select id="c-papel"><option value="cliente">Cliente</option><option value="admin">Equipe VGA</option></select></div>
      <p class="erro" id="erro-cliente"></p>
      <button class="btn btn-verde btn-bloco" type="submit">Criar acesso</button></form>
    <div class="secao"><h2><span class="marca"></span>Acessos (${r.clientes.length})</h2><p>Números da semana de ${ddmm(r.semana)}.</p></div>
    ${r.clientes
      .map((c) => {
        const n = estado.eu.nichos.find((x) => x.id === c.nicho);
        return `<div class="cartao" data-cliente="${c.id}"><div class="adm-linha"><span class="ic">${n ? n.icone : "👤"}</span>
          <div class="txt"><strong>${esc(c.nome)}</strong> ${c.papel === "admin" ? '<span class="pill ia">equipe VGA</span>' : ""} ${c.ativo ? "" : '<span class="pill erro">desativado</span>'}
          <small>${esc(c.email)}${c.negocio ? ` · ${esc(c.negocio)}` : ""}${c.cidade ? ` · ${esc(c.cidade)}` : ""}</small>
          <small>${n ? esc(n.nome) : "sem nicho"} · ${c.arquivos} arquivo(s) · ${c.aprovados} aprovada(s) · ${c.ajustes} ajuste(s)</small></div></div>
          <div class="linha-botoes" style="margin-top:10px">
            <button class="btn btn-contorno btn-pequeno" data-c="editar">Editar</button>
            <button class="btn btn-contorno btn-pequeno" data-c="senha">Nova senha</button>
            ${c.id === estado.eu.usuario.id ? "" : `<button class="btn ${c.ativo ? "btn-perigo" : "btn-contorno"} btn-pequeno" data-c="ativo">${c.ativo ? "Desativar" : "Reativar"}</button>`}
          </div></div>`;
      })
      .join("")}`;

  corpo.querySelector("#novo-cliente").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const dados = {
      nome: f["c-nome"].value, email: f["c-email"].value, senha: f["c-senha"].value,
      negocio: f["c-negocio"].value, cidade: f["c-cidade"].value, nicho: f["c-nicho"].value, papel: f["c-papel"].value,
    };
    try {
      await api("/api/admin/clientes", { metodo: "POST", corpo: dados });
      abrirJanela(`<h3>Acesso criado ✅</h3><p class="ajuda" style="margin-bottom:12px">Envie para o cliente:</p>
        <div class="legenda-box" id="msg-acesso">Olá, ${esc(dados.nome)}! Sua Área do Cliente VGA está pronta.\n\nEndereço: ${esc(location.origin)}\nE-mail: ${esc(dados.email)}\nSenha: ${esc(dados.senha)}\n\nLá você vê a estratégia da semana, envia fotos e vídeos e aprova os posts.</div>
        <div class="linha-botoes" style="margin-top:12px"><button class="btn btn-verde" id="copiar-acesso">${icone.copiar}Copiar mensagem</button><button class="btn btn-contorno" data-fechar>Fechar</button></div>`)
        .el.querySelector("#copiar-acesso").addEventListener("click", async () => {
          await navigator.clipboard.writeText(document.getElementById("msg-acesso").textContent);
          aviso("Mensagem copiada!");
        });
      painelClientes(corpo);
    } catch (err) {
      document.getElementById("erro-cliente").textContent = err.message;
    }
  });

  corpo.querySelectorAll("[data-c]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = Number(b.closest("[data-cliente]").dataset.cliente);
      const c = r.clientes.find((x) => x.id === id);
      try {
        if (b.dataset.c === "ativo") {
          await api(`/api/admin/clientes/${id}`, { metodo: "PUT", corpo: { ativo: !c.ativo } });
          aviso(c.ativo ? "Acesso desativado." : "Acesso reativado.");
          return painelClientes(corpo);
        }
        if (b.dataset.c === "senha") {
          const nova = senhaAleatoria();
          if (!confirm(`Definir a nova senha "${nova}" para ${c.nome}?`)) return;
          await api(`/api/admin/clientes/${id}`, { metodo: "PUT", corpo: { senha: nova } });
          await navigator.clipboard.writeText(nova).catch(() => {});
          return aviso(`Nova senha: ${nova} (copiada)`);
        }
        const j = abrirJanela(`<h3>Editar acesso</h3>
          <div class="campo"><label for="e-nome">Nome</label><input id="e-nome" value="${esc(c.nome)}"></div>
          <div class="campo"><label for="e-negocio">Negócio</label><input id="e-negocio" value="${esc(c.negocio)}"></div>
          <div class="campo"><label for="e-cidade">Cidade</label><input id="e-cidade" value="${esc(c.cidade)}"></div>
          <div class="campo"><label for="e-nicho">Nicho</label><select id="e-nicho">${opcoesNicho(c.nicho)}</select></div>
          <p class="erro" id="erro-e"></p>
          <div class="linha-botoes"><button class="btn btn-contorno" data-fechar>Cancelar</button><button class="btn btn-verde" id="salvar-e">Salvar</button></div>`);
        j.el.querySelector("#salvar-e").addEventListener("click", async () => {
          try {
            await api(`/api/admin/clientes/${id}`, {
              metodo: "PUT",
              corpo: { nome: j.el.querySelector("#e-nome").value, negocio: j.el.querySelector("#e-negocio").value, cidade: j.el.querySelector("#e-cidade").value, nicho: j.el.querySelector("#e-nicho").value },
            });
            j.fechar();
            aviso("Acesso atualizado.");
            if (id === estado.eu.usuario.id) estado.eu = await api("/api/eu");
            painelClientes(corpo);
          } catch (err) {
            j.el.querySelector("#erro-e").textContent = err.message;
          }
        });
      } catch (err) {
        aviso(err.message, true);
      }
    }),
  );
}

// ---------- números, variações e gráficos ----------
const num = (v, casas = 0) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1].replace(/^./, (l) => l.toUpperCase())} de ${m.slice(0, 4)}`;
const mesCurto = (m) => MESES_CURTOS[Number(m.slice(5, 7)) - 1];

function seta(v, { decimal = false, absoluto = false, sufixo = "vs mês anterior" } = {}) {
  if (!v) return `<span class="var sem">sem comparação</span>`;
  if (v.sentido === "igual") return `<span class="var igual">= igual ao mês anterior</span>`;
  const subiu = v.delta > 0;
  const quanto = v.pct !== null && !decimal && !absoluto ? `${num(Math.abs(v.pct), 1)}%` : num(Math.abs(v.delta), decimal ? 1 : 0);
  return `<span class="var ${v.sentido}" title="${v.sentido === "melhor" ? "Melhorou" : "Piorou"}">${subiu ? "▲" : "▼"} ${quanto} <span style="font-weight:500;color:var(--texto-2)">${sufixo}</span></span>`;
}

// Gráfico de linha simples em SVG. pontos: [{mes, valor|null}]
function graficoLinha(pontos, { mini = false, decimal = false, menorMelhor = false, cor = "var(--nicho)" } = {}) {
  const val = pontos.map((p) => (typeof p.valor === "number" ? p.valor : null));
  const existentes = val.filter((v) => v !== null);
  if (!existentes.length) return "";
  const L = mini ? 120 : 320;
  const A = mini ? 30 : 140;
  const mx = mini ? 3 : 18;
  const topo = mini ? 3 : 22;
  const base = mini ? 3 : 24;
  let min = Math.min(...existentes);
  let max = Math.max(...existentes);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const x = (i) => mx + (i * (L - 2 * mx)) / Math.max(1, pontos.length - 1);
  const y = (v) => {
    const t = (v - min) / (max - min);
    return topo + (menorMelhor ? t : 1 - t) * (A - topo - base);
  };
  const trechos = [];
  let atual = [];
  val.forEach((v, i) => {
    if (v === null) {
      if (atual.length) trechos.push(atual);
      atual = [];
    } else atual.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (atual.length) trechos.push(atual);
  const linhas = trechos.map((t) => (t.length > 1 ? `<polyline points="${t.join(" ")}" fill="none" stroke="${cor}" stroke-width="${mini ? 2 : 2.5}" stroke-linejoin="round" stroke-linecap="round"/>` : "")).join("");
  const pontosSvg = val
    .map((v, i) => (v === null ? "" : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${mini ? 0 : i === val.length - 1 ? 4.5 : 3}" fill="${i === val.length - 1 ? cor : "var(--preto-2)"}" stroke="${cor}" stroke-width="2"/>`))
    .join("");
  const texto = pontos.map((p, i) => `${mesCurto(p.mes)}: ${val[i] === null ? "sem dado" : num(val[i], decimal ? 1 : 0)}`).join(", ");
  if (mini) return `<svg class="mini" viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="Evolução: ${esc(texto)}">${linhas}${pontosSvg}</svg>`;
  const rotulos = pontos.map((p, i) => `<text class="eixo" x="${x(i).toFixed(1)}" y="${A - 6}" text-anchor="middle">${mesCurto(p.mes)}</text>`).join("");
  const valores = val.map((v, i) => (v === null ? "" : `<text class="rotulo-valor" x="${x(i).toFixed(1)}" y="${(y(v) - 9).toFixed(1)}" text-anchor="middle">${num(v, decimal ? 1 : 0)}</text>`)).join("");
  return `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Evolução nos últimos meses: ${esc(texto)}">
    <line x1="${mx}" x2="${L - mx}" y1="${A - base}" y2="${A - base}" stroke="var(--borda)"/>${linhas}${pontosSvg}${valores}${rotulos}</svg>`;
}

function estrelas(n) {
  const r = Math.round(n);
  return "★".repeat(r) + "☆".repeat(Math.max(0, 5 - r));
}

function vazioCartao(icone, texto, acao = "") {
  return `<div class="vazio-cartao"><span class="ic">${icone}</span><span>${texto}</span>${acao}</div>`;
}

// ---------- Início (Dashboard) ----------
async function telaInicio() {
  carregando();
  const d = await api("/api/inicio");
  definirCorNicho(d.saudacao.nicho.cor);
  const p = d.pendencias;
  const totalPend = p.para_aprovar.total + p.ajuste.total + p.falta_material.total;
  const acao = (classe, n, titulo, texto, botao, link) =>
    n ? `<div class="acao"><span class="num ${classe}">${n}</span><div class="txt"><strong>${titulo}</strong>${texto}</div><a class="btn btn-contorno btn-pequeno" href="${link}">${botao}</a></div>` : "";
  const sem = d.semana;
  const pct = (v) => (sem.planejados ? (v / sem.planejados) * 100 : 0);
  const px = sem.proximo;

  const ind = d.indicadores;
  const cartaoInd = (i) => {
    const decimal = Boolean(i.decimal);
    const sub = i.id === "contatos" && i.detalhe
      ? [i.detalhe.whatsapp !== null && `${num(i.detalhe.whatsapp)} WhatsApp`, i.detalhe.ligacoes !== null && `${num(i.detalhe.ligacoes)} ligações`, i.detalhe.rotas !== null && `${num(i.detalhe.rotas)} rotas`].filter(Boolean).join(" · ")
      : i.avaliacoes !== null && i.avaliacoes !== undefined ? `${num(i.avaliacoes)} avaliações` : "";
    return `<div class="ind"><span class="nome">${esc(i.nome)}</span><span class="valor">${decimal ? `⭐ ${num(i.valor, 1)}` : num(i.valor)}</span>
      ${sub ? `<span class="sub">${esc(sub)}</span>` : ""}${seta(i.variacao, { decimal, sufixo: "" })}${graficoLinha(i.serie, { mini: true, decimal })}</div>`;
  };

  const dest = d.destaque;
  tela.innerHTML = `${topo()}
    <div class="grade">
      <section class="cartao saudacao largura-toda" aria-label="Saudação">
        <span class="ola">${saudacaoHora()},</span>
        <h1>${esc(d.saudacao.negocio)}</h1>
        <div class="linha"><span class="chip-nicho" style="cursor:default">${d.saudacao.nicho.icone} ${esc(d.saudacao.nicho.nome)}</span>
          <span>Semana de ${ddmm(sem.semana)} a ${ddmm(sem.fim)}</span></div>
        ${sem.tema ? `<p class="ajuda" style="margin-top:10px">Foco da semana: <strong style="color:var(--texto)">${esc(sem.tema)}</strong></p>` : ""}
      </section>

      <section class="cartao acoes-pend ${totalPend ? "" : "tudo-ok"} largura-toda" aria-label="Ações pendentes">
        <h2><span class="marca" style="background:${totalPend ? "var(--laranja)" : "var(--verde)"}"></span>${totalPend ? "Ações pendentes" : "Tudo em dia"}</h2>
        ${totalPend
          ? `${acao("aprovar", p.para_aprovar.total, p.para_aprovar.total === 1 ? "post para aprovar" : "posts para aprovar", "Confira e aprove para a VGA agendar.", "Aprovar", `#/semana?filtro=para_aprovar${p.para_aprovar.item_id ? `&item=${encodeURIComponent(p.para_aprovar.item_id)}` : ""}`)}
             ${acao("ajuste", p.ajuste.total, p.ajuste.total === 1 ? "ajuste pedido" : "ajustes pedidos", "A equipe VGA está cuidando. Veja o andamento.", "Ver", `#/semana?filtro=ajuste${p.ajuste.item_id ? `&item=${encodeURIComponent(p.ajuste.item_id)}` : ""}`)}
             ${acao("falta", p.falta_material.total, p.falta_material.total === 1 ? "pauta sem foto ou vídeo" : "pautas sem foto ou vídeo", "Envie o material e a IA escolhe o melhor.", "Enviar", "#/enviar")}`
          : vazioCartao("🎉", "Nenhuma ação pendente. Tudo aprovado ou com a VGA.")}
      </section>

      <section class="cartao largura-toda" aria-label="Resumo da semana">
        <div class="cab-cartao"><h2><span class="marca"></span>Resumo da semana</h2><a class="link" href="#/semana">Ver semana</a></div>
        <div class="etapas"><div><b>${sem.planejados}</b><span>planejados</span></div><div><b>${sem.aprovados}</b><span>aprovados</span></div>
          <div><b>${sem.agendados}</b><span>agendados</span></div><div><b>${sem.publicados}</b><span>publicados</span></div></div>
        <div class="barra-etapas" role="img" aria-label="${sem.aprovados} de ${sem.planejados} aprovados, ${sem.agendados} agendados, ${sem.publicados} publicados">
          <i class="pub" style="width:${pct(sem.publicados)}%"></i><i class="age" style="width:${pct(sem.agendados - sem.publicados)}%"></i><i class="apr" style="width:${pct(sem.aprovados - sem.agendados)}%"></i></div>
        <div class="legenda-barra"><span><i style="background:var(--verde)"></i>publicado</span><span><i style="background:color-mix(in srgb, var(--verde) 55%, var(--preto-3))"></i>agendado</span><span><i style="background:var(--nicho)"></i>aprovado</span></div>
        ${px
          ? `<a class="proximo" href="#/semana?item=${encodeURIComponent(px.id)}"><div class="mini">${px.miniatura ? `<img src="${esc(px.miniatura)}" alt="">` : px.formato === "reels" || px.formato === "stories" ? "🎥" : "📷"}</div>
              <div class="txt"><span class="rotulo">Próximo post · ${NOMES_DIAS[px.dia]} ${ddmm(px.data)} às ${esc(px.horario)}</span><strong>${FORMATOS[px.formato]}: ${esc(px.titulo)}</strong><em>${esc(px.previa)}</em>
              <span class="status ${px.status}" style="margin-left:0;display:inline-block;margin-top:4px">${STATUS[px.status]}</span></div></a>`
          : vazioCartao("✅", "Não há mais posts previstos nesta semana.")}
      </section>

      <section class="cartao largura-toda" aria-label="Indicadores principais">
        <div class="cab-cartao"><h2><span class="marca"></span>Indicadores${ind ? ` · ${esc(nomeMes(ind.mes))}` : ""}</h2></div>
        ${ind && ind.lista.length
          ? `<div class="indicadores seis">${ind.lista.map(cartaoInd).join("")}</div>`
          : vazioCartao("📊", "Os números do mês aparecem aqui assim que a equipe VGA lançar os seus resultados.")}
        <a class="btn btn-contorno btn-bloco" style="margin-top:12px" href="#/insights">${icone.insights}Ver insights completos</a>
      </section>

      <section class="cartao" aria-label="Destaque do mês">
        <h2><span class="marca"></span>Destaque do mês</h2>
        ${dest
          ? `<div class="destaque-post"><span class="rotulo">🏆 Post que mais engajou${dest.tipo ? ` · ${esc(dest.tipo)}` : ""}</span><span class="titulo-post">${esc(dest.titulo)}</span>
              <div class="numeros-post"><span><b>${num(dest.interacoes)}</b>interações</span><span><b>${num(dest.alcance)}</b>alcance</span></div>
              ${dest.link ? `<a class="link" href="${esc(dest.link)}" target="_blank" rel="noopener noreferrer">Abrir no Instagram</a>` : ""}</div>`
          : vazioCartao("🏆", "Quando houver números do Instagram, o post campeão do mês aparece aqui.")}
      </section>

      <section class="cartao" aria-label="Próximas datas">
        <div class="cab-cartao"><h2><span class="marca"></span>Próximas datas</h2><a class="link" href="#/calendario">Calendário</a></div>
        ${d.datas.length
          ? `<div class="data-lista">${d.datas.map((x) => `<div class="ev meu"><div class="dt"><b>${x.inicio.slice(8, 10)}</b><span>${MESES[Number(x.inicio.slice(5, 7)) - 1].slice(0, 3)}</span></div>
              <div class="txt"><strong>${esc(x.nome)}</strong><span class="tipo-ev ${esc(x.tipo)}">${esc(x.tipo)}</span>
              ${x.divulgarDesde ? `<span class="divulgar">${x.divulgarAgora ? "📣 Já é hora de divulgar!" : `📣 Comece a divulgar em ${ddmm(x.divulgarDesde)}`}</span>` : ""}</div></div>`).join("")}</div>`
          : vazioCartao("🗓️", "Sem datas especiais do seu nicho nas próximas semanas.")}
      </section>

      <section class="cartao largura-toda" aria-label="Dica da semana" style="border-color:var(--verde)">
        <h2><span class="marca" style="background:var(--verde)"></span>Dica da semana</h2>
        <p style="font-size:16px">💡 ${esc(d.dica.texto)}</p>
        ${d.dica.item_id ? `<a class="btn btn-verde btn-pequeno" style="margin-top:12px" href="#/semana?item=${encodeURIComponent(d.dica.item_id)}">Ver o post na estratégia</a>` : ""}
      </section>
    </div>`;
}

function saudacaoHora() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// ---------- Insights ----------
async function telaInsights() {
  carregando();
  const q = estado.insights.mes ? `?mes=${estado.insights.mes}` : "";
  const d = await api(`/api/insights${q}`);
  estado.insights.mes = d.mes;
  const r = d.resumo;
  const fonte = d.fontes[estado.insights.fonte] || d.fontes.meta;
  const idx = d.meses.indexOf(d.mes);
  const anteriorMes = d.meses[idx + 1] || null;
  const proximoMes = idx > 0 ? d.meses[idx - 1] : null;

  const caixaResumo = (rotulo, valor, sub, variacaoHtml) => `<div class="ind"><span class="nome">${rotulo}</span><span class="valor">${valor}</span>${sub ? `<span class="sub">${sub}</span>` : ""}${variacaoHtml || ""}</div>`;
  tela.innerHTML = `${topo()}
    <div class="semana-nav">
      <button class="redondo" data-mes="${esc(anteriorMes || "")}" ${anteriorMes ? "" : "disabled"} aria-label="Mês anterior">${icone.esq}</button>
      <div class="titulo"><strong>Insights</strong><span>${esc(nomeMes(d.mes))}</span></div>
      <button class="redondo" data-mes="${esc(proximoMes || "")}" ${proximoMes ? "" : "disabled"} aria-label="Próximo mês">${icone.dir}</button>
    </div>
    <section class="cartao largura-toda" aria-label="Resumo geral" style="margin-top:8px">
      <h2><span class="marca"></span>Resumo geral</h2>
      <div class="indicadores grade-3" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        ${caixaResumo("Nota média", r.nota ? `⭐ ${num(r.nota.valor, 1)}` : "—", r.nota ? `${num(r.nota.avaliacoes)} avaliações (${r.nota.fontes.join(" + ")})` : "sem avaliações lançadas")}
        ${caixaResumo("Seguidores", r.seguidores ? num(r.seguidores.valor) : "—", r.seguidores?.variacao ? `${r.seguidores.variacao.delta >= 0 ? "+" : "−"}${num(Math.abs(r.seguidores.variacao.delta))} no mês` : "", r.seguidores ? seta(r.seguidores.variacao, { sufixo: "" }) : "")}
        ${caixaResumo("Contatos gerados", r.contatos ? num(r.contatos.valor) : "—", "WhatsApp, link, ligações, rotas e site", r.contatos ? seta(r.contatos.variacao, { sufixo: "" }) : "")}
      </div>
    </section>
    <div class="filtros abas-fontes" role="tablist">${Object.values(d.fontes)
      .map((f) => `<button class="chip" role="tab" data-fonte="${f.id}" aria-pressed="${f.id === fonte.id}">${f.icone} ${esc(f.id === "meta" ? "Instagram/Facebook" : f.id === "google" ? "Google" : "TripAdvisor")}</button>`)
      .join("")}</div>
    ${secaoFonte(fonte, d)}`;

  tela.querySelectorAll("[data-mes]").forEach((b) => b.addEventListener("click", () => {
    if (!b.dataset.mes) return;
    estado.insights.mes = b.dataset.mes;
    telaInsights();
  }));
  tela.querySelectorAll("[data-fonte]").forEach((b) => b.addEventListener("click", () => {
    estado.insights.fonte = b.dataset.fonte;
    telaInsights();
  }));
  tela.querySelectorAll("[data-grafico]").forEach((b) => b.addEventListener("click", () => {
    const g = fonte.graficos[Number(b.dataset.grafico)];
    tela.querySelectorAll("[data-grafico]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    tela.querySelector("#grafico").innerHTML = graficoLinha(g.pontos, { decimal: /nota/.test(g.id), menorMelhor: g.menorMelhor });
  }));
}

function secaoFonte(f, d) {
  const origem = f.origem === "api" ? "pela API oficial" : f.origem === "csv" ? "por planilha" : "pela equipe VGA";
  const cab = `<div class="fonte-cab"><span class="ic">${f.icone}</span><div><h2>${esc(f.nome)}</h2>
    <small>${f.temDados ? `Atualizado ${origem}${f.atualizado_em ? ` em ${dataHora(f.atualizado_em)}` : ""}` : esc(d.conexoes[f.id])}</small></div></div>`;
  if (!f.temDados) {
    return `${cab}<div class="cartao">${vazioCartao(f.icone, `A equipe VGA ainda não lançou os números de ${esc(f.nome)} em ${esc(nomeMes(d.mes).toLowerCase())}.`, '<span class="ajuda" style="font-size:13px">Assim que lançar, eles aparecem aqui com a comparação do mês anterior.</span>')}</div>`;
  }
  const cartoes = f.cartoes.map((c) => `<div class="ind"><span class="nome">${esc(c.nome)}</span>
    <span class="valor">${c.id.startsWith("nota") ? `⭐ ${num(c.valor, 1)}` : c.id === "ranking_posicao" ? `${num(c.valor)}º` : num(c.valor, c.decimal ? 1 : 0)}</span>
    ${seta(c.variacao, { decimal: c.decimal, absoluto: c.id === "ranking_posicao", sufixo: c.id === "ranking_posicao" ? "posição(ões)" : "" })}</div>`).join("");
  const g0 = f.graficos[0];
  const L = f.listas;
  const blocoLista = (titulo, conteudo) => (conteudo ? `<section class="cartao"><h2><span class="marca"></span>${titulo}</h2>${conteudo}</section>` : "");
  const barras = (itens, rotulo) => (itens?.length ? `<div class="barras">${itens.map((i) => {
    const max = Math.max(...itens.map((x) => x.valor)) || 1;
    return `<div class="linha-barra"><span title="${esc(i[rotulo])}">${esc(i[rotulo])}</span><div class="trilho"><i style="width:${(i.valor / max) * 100}%"></i></div><b>${num(i.valor)}${i.valor <= 100 ? "%" : ""}</b></div>`;
  }).join("")}</div>` : "");
  const avaliacoes = (lista) => (lista?.length ? lista.map((a) => `<div class="avaliacao"><span class="estrelas" aria-label="${a.nota} de 5">${estrelas(a.nota)}</span> <strong>${esc(a.autor)}</strong> <small>${a.data ? ddmm(a.data) : ""}</small>
    ${a.respondida ? "" : ' <span class="sem-resp">· sem resposta</span>'}<p>${esc(a.texto)}</p></div>`).join("") : "");
  const posts = L.melhores_posts?.length ? L.melhores_posts.map((p, i) => `<div class="avaliacao"><strong>${i + 1}. ${esc(p.titulo)}</strong> <small>${esc(p.tipo)}</small>
    <p class="ajuda" style="font-size:13px">${num(p.interacoes)} interações · ${num(p.alcance)} de alcance ${p.link ? `· <a class="link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">abrir</a>` : ""}</p></div>`).join("") : "";

  return `${cab}
    <div class="grade">
      <section class="cartao largura-toda" aria-label="Números do mês"><h2><span class="marca"></span>Números do mês</h2>
        <div class="indicadores seis">${cartoes}</div>
        ${f.mesAnteriorTemDados ? "" : '<p class="ajuda" style="font-size:12px;margin-top:8px">Sem números do mês anterior para comparar.</p>'}</section>
      ${g0 ? `<section class="cartao grafico" aria-label="Evolução"><h2><span class="marca"></span>Evolução (6 meses)</h2>
        <div class="filtros" style="margin:0 0 8px">${f.graficos.map((g, i) => `<button class="chip" data-grafico="${i}" aria-pressed="${i === 0}" style="padding:6px 12px;font-size:13px">${esc(g.nome)}</button>`).join("")}</div>
        <div id="grafico">${graficoLinha(g0.pontos, { decimal: /nota/.test(g0.id), menorMelhor: g0.menorMelhor })}</div></section>` : ""}
      <section class="cartao significa" aria-label="O que isso significa"><h2><span class="marca"></span>O que isso significa</h2>
        <ul>${f.leituras.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        ${f.recomendacao ? `<div class="recomenda"><strong>Recomendação para esta semana</strong>${esc(f.recomendacao.texto)}
          ${f.recomendacao.item_id ? `<div style="margin-top:8px"><a class="link" href="#/semana?item=${encodeURIComponent(f.recomendacao.item_id)}">Ver o post na estratégia da semana →</a></div>` : ""}</div>` : ""}
        ${f.nota_equipe ? `<div class="nota-equipe">💬 <strong>Equipe VGA:</strong> ${esc(f.nota_equipe)}</div>` : ""}
      </section>
      ${blocoLista("Melhores posts", posts)}
      ${blocoLista("Horários com mais seguidores online", barras(L.horarios_online, "faixa"))}
      ${blocoLista("Cidades do público", barras(L.cidades, "nome"))}
      ${blocoLista("Idade do público", barras(L.idades, "faixa"))}
      ${f.id === "tripadvisor" && L.selos?.length ? blocoLista("Selos", `<div class="selos">${L.selos.map((s) => `<span>🏅 ${esc(s.nome)}</span>`).join("")}</div>`) : ""}
      ${blocoLista("Últimas avaliações", avaliacoes(L.ultimas_avaliacoes))}
    </div>
    ${f.id === "tripadvisor" ? '<p class="ajuda" style="font-size:12px;margin-top:10px">Dados do TripAdvisor copiados do painel do estabelecimento pela equipe VGA.</p>' : ""}`;
}

// ---------- Painel VGA: Insights (formulário por cliente e mês + CSV) ----------
async function painelInsights(corpo) {
  const clientes = (await api("/api/admin/clientes")).clientes.filter((c) => c.papel !== "admin");
  const ai = estado.adminInsights;
  if (!ai.usuario && clientes[0]) ai.usuario = clientes[0].id;
  if (!ai.mes) {
    const hoje = estado.eu.hoje;
    const [a, m] = hoje.split("-").map(Number);
    ai.mes = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  }
  if (!clientes.length) {
    corpo.innerHTML = '<div class="vazio">Crie um cliente primeiro (aba Clientes).</div>';
    return;
  }
  const d = await api(`/api/admin/insights?usuario_id=${ai.usuario}&mes=${ai.mes}`);
  const F = d.campos[ai.fonte];
  const atual = d.fontes[ai.fonte];
  const con = d.conectores[ai.fonte];
  corpo.innerHTML = `<div class="cartao">
      <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:0">
        <div class="campo"><label for="ai-cliente">Cliente</label><select id="ai-cliente">${clientes.map((c) => `<option value="${c.id}" ${c.id === ai.usuario ? "selected" : ""}>${esc(c.negocio || c.nome)}</option>`).join("")}</select></div>
        <div class="campo"><label for="ai-mes">Mês</label><input id="ai-mes" type="month" value="${esc(ai.mes)}"></div>
      </div>
      <div class="filtros" style="margin:4px 0 0">${Object.values(d.campos).map((f) => `<button class="chip" data-ai-fonte="${f.id}" aria-pressed="${f.id === ai.fonte}">${f.icone} ${esc(f.curto)}</button>`).join("")}</div>
      ${d.meses.length ? `<p class="ajuda" style="font-size:12px;margin-top:8px">Meses já lançados: ${d.meses.map((m) => esc(m)).join(", ")}</p>` : ""}
    </div>
    <form class="cartao form-insights" id="form-insights">
      <span class="rotulo">${esc(F.nome)} · ${esc(nomeMes(ai.mes))}</span>
      ${atual.origem ? `<p class="ajuda" style="font-size:12px">Última atualização (${esc(atual.origem)}): ${dataHora(atual.atualizado_em)}</p>` : '<p class="ajuda" style="font-size:12px">Ainda sem números neste mês. Deixe em branco o que não tiver.</p>'}
      <fieldset><legend>Números do mês</legend><div class="duas">
        ${F.numeros.map((n) => `<div class="campo"><label for="n-${n.id}">${esc(n.nome)}</label><input id="n-${n.id}" name="${n.id}" inputmode="decimal" value="${atual.dados[n.id] ?? ""}" placeholder="${n.decimal ? "ex.: 4,7" : "ex.: 1.250"}" ${n.ajuda ? `title="${esc(n.ajuda)}"` : ""}></div>`).join("")}
        ${(F.textos || []).map((t) => `<div class="campo" style="grid-column:1/-1"><label for="t-${t.id}">${esc(t.nome)}</label><input id="t-${t.id}" name="${t.id}" value="${esc(atual.dados[t.id] || "")}" placeholder="${esc(t.ajuda || "")}"></div>`).join("")}
      </div></fieldset>
      ${F.listas.map((l) => `<fieldset><legend>${esc(l.nome)}</legend><p class="ajuda" style="font-size:12px;margin-bottom:6px">Um por linha: ${esc(l.ajuda)}</p>
        <textarea name="${l.id}" aria-label="${esc(l.nome)}">${esc(atual.textos[l.id] || "")}</textarea></fieldset>`).join("")}
      <div class="campo"><label for="nota-equipe">Comentário da equipe VGA (aparece para o cliente)</label><textarea id="nota-equipe" name="nota_equipe" style="min-height:70px">${esc(atual.nota_equipe || "")}</textarea></div>
      <p class="erro" id="erro-insights"></p>
      <button class="btn btn-verde btn-bloco" type="submit">Salvar ${esc(F.curto)} de ${esc(nomeMes(ai.mes).toLowerCase())}</button>
      <p class="ajuda" style="font-size:12px;margin-top:10px">${con.manual ? "🦉 " : "🔌 "}<strong>${esc(con.nome)}:</strong> ${con.manual ? "sem API com dados do dono; preenchimento manual." : con.configurado ? "credenciais configuradas (Fase 2)." : "conexão automática chega na Fase 2."}</p>
    </form>
    <div class="cartao"><span class="rotulo">Importar planilha (CSV)</span>
      <p class="ajuda" style="font-size:13px;margin:6px 0 10px">Uma informação por linha: <code>email;mes;fonte;campo;valor</code>. Serve para vários clientes e meses de uma vez.</p>
      <div class="linha-botoes" style="margin-bottom:10px"><a class="btn btn-contorno btn-pequeno" href="/api/admin/insights/modelo.csv">Baixar modelo</a>
        <label class="btn btn-contorno btn-pequeno">Escolher arquivo<input type="file" id="csv-arquivo" accept=".csv,text/csv" hidden></label></div>
      <textarea id="csv-texto" placeholder="ou cole aqui o conteúdo do CSV" style="min-height:100px;font-size:13px"></textarea>
      <div class="linha-botoes" style="margin-top:10px"><button class="btn btn-contorno btn-pequeno" id="csv-conferir">Conferir</button><button class="btn btn-verde btn-pequeno" id="csv-importar" disabled>Importar</button></div>
      <div class="resultado-csv" id="csv-resultado"></div>
    </div>`;

  corpo.querySelector("#ai-cliente").addEventListener("change", (e) => { ai.usuario = Number(e.target.value); painelInsights(corpo); });
  corpo.querySelector("#ai-mes").addEventListener("change", (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { ai.mes = e.target.value; painelInsights(corpo); } });
  corpo.querySelectorAll("[data-ai-fonte]").forEach((b) => b.addEventListener("click", () => { ai.fonte = b.dataset.aiFonte; painelInsights(corpo); }));
  corpo.querySelector("#form-insights").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const dados = {};
    for (const n of F.numeros) dados[n.id] = f.elements[n.id].value;
    for (const t of F.textos || []) dados[t.id] = f.elements[t.id].value;
    for (const l of F.listas) dados[l.id] = f.elements[l.id].value;
    try {
      const r = await api("/api/admin/insights", { metodo: "PUT", corpo: { usuario_id: ai.usuario, mes: ai.mes, fonte: ai.fonte, dados, nota_equipe: f.elements.nota_equipe.value } });
      aviso(r.apagado ? "Mês sem números: registro removido." : "Números salvos. O cliente já vê na aba Insights.");
      painelInsights(corpo);
    } catch (err) {
      corpo.querySelector("#erro-insights").textContent = err.message;
    }
  });
  const txt = corpo.querySelector("#csv-texto");
  corpo.querySelector("#csv-arquivo").addEventListener("change", async (e) => {
    const arq = e.target.files[0];
    if (arq) txt.value = await arq.text();
  });
  const btnImportar = corpo.querySelector("#csv-importar");
  const enviar = async (aplicar) => {
    const saida = corpo.querySelector("#csv-resultado");
    try {
      const r = await api("/api/admin/insights/importar", { metodo: "POST", corpo: { csv: txt.value, aplicar } });
      btnImportar.disabled = Boolean(r.erros.length) || !r.grupos.length || r.aplicado;
      saida.innerHTML = `${r.aplicado ? "<p><strong style='color:var(--verde)'>✅ Importado!</strong></p>" : ""}
        <p>${r.grupos.length} conjunto(s): ${r.grupos.map((g) => `${esc(g.nome)} · ${esc(g.fonte)} · ${esc(g.mes)} (${g.campos} campos)`).join("; ") || "nenhum"}</p>
        ${r.erros.length ? `<p class="erro">Corrija antes de importar:</p>${r.erros.slice(0, 20).map((x) => `<span class="erro">${x.linha ? `Linha ${x.linha}: ` : ""}${esc(x.erro)}</span>`).join("")}` : r.aplicado ? "" : "<p class='ajuda'>Tudo certo. Toque em Importar para gravar.</p>"}`;
      if (r.aplicado) aviso("Planilha importada.");
    } catch (err) {
      saida.innerHTML = `<span class="erro">${esc(err.message)}</span>`;
    }
  };
  corpo.querySelector("#csv-conferir").addEventListener("click", () => enviar(false));
  btnImportar.addEventListener("click", () => enviar(true));
}

window.addEventListener("hashchange", rotear);
rotear();
