// Campos de cada fonte de Insights. É a "forma" única dos dados, venha do formulário da VGA,
// de planilha CSV (Fase 1) ou das APIs oficiais (Fase 2).

export const FONTES = {
  meta: {
    id: "meta",
    nome: "Instagram/Facebook",
    curto: "Instagram",
    icone: "📸",
    numeros: [
      { id: "seguidores", nome: "Seguidores", ajuda: "Total no fim do mês" },
      { id: "alcance", nome: "Alcance", ajuda: "Contas únicas que viram seu conteúdo" },
      { id: "contas_engajadas", nome: "Contas com engajamento", ajuda: "Contas que curtiram, comentaram, salvaram ou compartilharam" },
      { id: "interacoes", nome: "Interações", ajuda: "Curtidas + comentários + salvamentos + compartilhamentos" },
      { id: "visualizacoes_reels", nome: "Visualizações de Reels" },
      { id: "visitas_perfil", nome: "Visitas ao perfil" },
      { id: "cliques_link", nome: "Cliques no link" },
      { id: "cliques_whatsapp", nome: "Cliques no WhatsApp" },
    ],
    listas: [
      { id: "melhores_posts", nome: "Melhores posts", colunas: ["titulo", "tipo", "alcance", "interacoes", "link"], ajuda: "título | tipo (Reels, carrossel, foto) | alcance | interações | link" },
      { id: "horarios_online", nome: "Horários com mais seguidores online", colunas: ["faixa", "valor"], ajuda: "horário | % ou número de seguidores online (ex.: 19h | 82)" },
      { id: "cidades", nome: "Cidades do público", colunas: ["nome", "valor"], ajuda: "cidade | % do público" },
      { id: "idades", nome: "Idade do público", colunas: ["faixa", "valor"], ajuda: "faixa | % do público (ex.: 25-34 | 38)" },
    ],
    grafico: ["seguidores", "alcance", "interacoes"],
  },
  google: {
    id: "google",
    nome: "Google (Perfil da Empresa)",
    curto: "Google",
    icone: "📍",
    numeros: [
      { id: "visualizacoes_maps", nome: "Visualizações no Maps" },
      { id: "visualizacoes_pesquisa", nome: "Visualizações na Pesquisa" },
      { id: "ligacoes", nome: "Ligações" },
      { id: "rotas", nome: "Pedidos de rota" },
      { id: "cliques_site", nome: "Cliques no site" },
      { id: "nota_media", nome: "Nota média", decimal: true, max: 5 },
      { id: "total_avaliacoes", nome: "Número de avaliações" },
    ],
    listas: [
      { id: "ultimas_avaliacoes", nome: "Últimas avaliações", colunas: ["autor", "nota", "data", "texto", "respondida"], ajuda: "autor | nota (1 a 5) | data (AAAA-MM-DD) | texto | respondida (sim/não)" },
    ],
    grafico: ["visualizacoes", "contatos", "nota_media"],
  },
  tripadvisor: {
    id: "tripadvisor",
    nome: "TripAdvisor",
    curto: "TripAdvisor",
    icone: "🦉",
    numeros: [
      { id: "nota", nome: "Nota", decimal: true, max: 5 },
      { id: "total_avaliacoes", nome: "Número de avaliações" },
      { id: "ranking_posicao", nome: "Posição no ranking", menorMelhor: true, ajuda: "Ex.: 3 (3º lugar)" },
      { id: "ranking_total", nome: "Total no ranking", ajuda: "Ex.: 58 (de 58 restaurantes)" },
    ],
    textos: [{ id: "ranking_categoria", nome: "Categoria do ranking", ajuda: "Ex.: restaurantes em Morretes" }],
    listas: [
      { id: "selos", nome: "Selos", colunas: ["nome"], ajuda: "um por linha (ex.: Travellers' Choice 2026)" },
      { id: "ultimas_avaliacoes", nome: "Últimas avaliações", colunas: ["autor", "nota", "data", "texto", "respondida"], ajuda: "autor | nota (1 a 5) | data (AAAA-MM-DD) | texto | respondida (sim/não)" },
    ],
    grafico: ["nota", "total_avaliacoes", "ranking_posicao"],
  },
};

export const IDS_FONTES = Object.keys(FONTES);
const MAX_ITENS_LISTA = 12;

// Números no jeito brasileiro: "1.234" (mil), "4,7" (decimal), "12%".
export function lerNumero(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/[%\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function mesValido(m) {
  return typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

export function mesAnterior(m) {
  const [a, mm] = m.split("-").map(Number);
  return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, "0")}`;
}

export function ultimosMeses(m, n) {
  const lista = [m];
  while (lista.length < n) lista.unshift(mesAnterior(lista[0]));
  return lista;
}

function campoNumero(def, v) {
  const n = lerNumero(v);
  if (n === null) return { erro: `"${def.nome}" precisa ser um número.` };
  if (n < 0) return { erro: `"${def.nome}" não pode ser negativo.` };
  if (def.max !== undefined && n > def.max) return { erro: `"${def.nome}" vai de 0 a ${def.max}.` };
  return { valor: def.decimal ? Math.round(n * 10) / 10 : Math.round(n) };
}

// Uma linha de lista: array (CSV/formulário "a | b | c") ou objeto (APIs).
export function itemDeLista(def, bruto) {
  const partes = Array.isArray(bruto) ? bruto : typeof bruto === "string" ? bruto.split("|") : null;
  const obj = partes
    ? Object.fromEntries(def.colunas.map((c, i) => [c, String(partes[i] ?? "").trim()]))
    : Object.fromEntries(def.colunas.map((c) => [c, bruto?.[c] ?? ""]));
  const item = {};
  for (const c of def.colunas) {
    const v = obj[c];
    if (["valor", "alcance", "interacoes"].includes(c)) item[c] = lerNumero(String(v)) ?? 0;
    else if (c === "nota") item[c] = Math.max(0, Math.min(5, lerNumero(String(v)) ?? 0));
    else if (c === "respondida") item[c] = v === true || /^(sim|s|yes|y|1|true)$/i.test(String(v).trim());
    else if (c === "link") item[c] = /^https?:\/\//.test(String(v).trim()) ? String(v).trim().slice(0, 500) : "";
    else item[c] = String(v ?? "").trim().slice(0, c === "texto" ? 800 : 160);
  }
  const principal = def.colunas[0];
  return item[principal] ? item : null;
}

// Limpa e valida os dados de uma fonte. Campos vazios ficam de fora (não viram zero).
export function normalizarDados(fonteId, bruto = {}) {
  const fonte = FONTES[fonteId];
  if (!fonte) return { erros: ["Fonte inválida."] };
  const dados = {};
  const erros = [];
  for (const def of fonte.numeros) {
    const v = bruto[def.id];
    if (v === undefined || v === null || v === "") continue;
    const r = campoNumero(def, v);
    if (r.erro) erros.push(r.erro);
    else dados[def.id] = r.valor;
  }
  for (const def of fonte.textos || []) {
    if (typeof bruto[def.id] === "string" && bruto[def.id].trim()) dados[def.id] = bruto[def.id].trim().slice(0, 120);
  }
  for (const def of fonte.listas) {
    const v = bruto[def.id];
    if (v === undefined || v === null) continue;
    const linhas = typeof v === "string" ? v.split(/\r?\n/) : Array.isArray(v) ? v : [];
    dados[def.id] = linhas.map((l) => itemDeLista(def, l)).filter(Boolean).slice(0, MAX_ITENS_LISTA);
  }
  return { dados, erros };
}

// Lista -> texto "a | b | c" por linha (para o formulário da VGA).
export function listaParaTexto(def, itens = []) {
  return itens.map((i) => def.colunas.map((c) => (c === "respondida" ? (i[c] ? "sim" : "não") : i[c] ?? "")).join(" | ")).join("\n");
}
