// IA da Área do Cliente (Claude):
// 1) pesquisa as tendências da semana de cada nicho na web;
// 2) gera a estratégia da semana (pauta diária, ganchos, roteiros, legendas e horários);
// 3) analisa as fotos e vídeos do cliente, escolhe os melhores para cada pauta e define legenda e horário.
// Sem chave de API, tudo continua funcionando com o modelo pronto de cada nicho e uma análise simples.
import Anthropic from "@anthropic-ai/sdk";
import { REGRAS_GERAIS } from "../conteudo/nichos.js";
import { DIAS, NOMES_DIAS, curta, horarioValido } from "./datas.js";

const MODELO = "claude-opus-5-5";
// Se o modelo principal recusar, a API tenta automaticamente um modelo alternativo.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

export function iaDisponivel() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let cliente = null;
function obterCliente() {
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

function textoDaResposta(resposta) {
  return resposta.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

function descreverNicho(n) {
  return [
    `Nicho: ${n.nome}`,
    `Objetivo: ${n.objetivo}`,
    `Pilares (porcentagem do conteúdo): ${n.pilares.map((p) => `${p.nome} ${p.pct}% (${p.descricao} Quadros fixos: ${p.quadros.join(", ")})`).join("; ")}`,
    `Volume do mês: ${n.mes.feed} posts no feed (${n.mes.reels} Reels, ${n.mes.carrosseis} carrosséis, ${n.mes.fotos} fotos), ${n.mes.stories} Stories. ${n.mes.extras.join(". ")}`,
    `Semana-tipo: ${n.semanaTipo.join(" · ")}`,
    `Tendências já mapeadas: ${n.tendencias.join(" ")}`,
    n.compliance ? `REGRAS OBRIGATÓRIAS DO CONSELHO PROFISSIONAL: ${n.compliance}` : "",
  ].filter(Boolean).join("\n");
}

function descreverDatas(datas) {
  if (!datas?.length) return "Nenhuma data especial nas próximas 5 semanas.";
  return datas.map((d) => `- ${curta(d.inicio)}${d.fim ? ` a ${curta(d.fim)}` : ""}: ${d.nome} (${d.tipo})`).join("\n");
}

// ---------- 1) Pesquisa de tendências ----------

export async function pesquisarTendencias({ nicho, semana, datas }) {
  if (!iaDisponivel()) return null;
  const pedido = `Você é estrategista de redes sociais de uma agência no litoral do Paraná (Morretes e região, perto de Curitiba).
Pesquise na web o que está em alta AGORA (semana de ${curta(semana)}) para perfis de Instagram do nicho "${nicho.nome}" no Brasil:
- formatos e tipos de Reels que estão performando (ganchos, trends, estilos de edição);
- áudios ou trends do momento que combinam com o nicho, se houver;
- temas e dúvidas que o público está buscando;
- mudanças recentes no Instagram, no Google Perfil ou nas regras do conselho profissional que afetem o nicho;
- oportunidades ligadas a estas datas:
${descreverDatas(datas)}

Responda em português do Brasil, em até 12 tópicos curtos e práticos, citando o que é recente. No fim, liste as fontes usadas (título e link).`;

  const messages = [{ role: "user", content: pedido }];
  const fontes = [];
  let texto = "";
  for (let rodada = 0; rodada < 4; rodada++) {
    const resposta = await obterCliente().beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      messages,
      ...FALLBACK,
    });
    for (const bloco of resposta.content) {
      if (bloco.type === "web_search_tool_result" && Array.isArray(bloco.content)) {
        for (const r of bloco.content) if (r.url) fontes.push({ titulo: r.title || r.url, url: r.url });
      }
    }
    texto = textoDaResposta(resposta) || texto;
    if (resposta.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: resposta.content });
  }
  const unicas = [...new Map(fontes.map((f) => [f.url, f])).values()].slice(0, 10);
  return texto ? { texto, fontes: unicas } : null;
}

// ---------- 2) Estratégia da semana ----------

const ESQUEMA_ITEM = {
  type: "object",
  properties: {
    id: { type: "string", description: "Identificador curto e único: p1, p2... para posts; s-seg, s-ter... para Stories" },
    dia: { type: "string", enum: DIAS },
    horario: { type: "string", description: "Horário sugerido de postagem, HH:MM (24h)" },
    formato: { type: "string", enum: ["reels", "carrossel", "feed", "stories"] },
    pilar: { type: "string", description: "Nome exato de um dos 5 pilares do nicho" },
    quadro: { type: "string", description: "Quadro fixo (série com nome) usado na pauta" },
    titulo: { type: "string" },
    gancho: { type: "string", description: "Gancho dos 3 primeiros segundos (ou primeira linha)" },
    roteiro: { type: "array", items: { type: "string" }, description: "Reels: cenas na ordem, com tempo. Vazio nos outros formatos." },
    textoTela: { type: "string", description: "Texto que aparece na tela ou na arte" },
    laminas: { type: "array", items: { type: "string" }, description: "Carrossel: texto de cada lâmina (5 a 8). Vazio nos outros formatos." },
    legenda: { type: "string", description: "Legenda pronta para copiar, com quebras de linha e chamada para ação. Vazia em Stories." },
    palavrasChave: { type: "array", items: { type: "string" }, description: "3 a 5 palavras-chave para a legenda (valem mais que hashtags)" },
    audio: { type: "string", description: "Sugestão de áudio para Reels; vazio nos outros" },
    material: { type: "string", description: "O que o cliente deve fotografar ou gravar. Comece com 'Não precisa' se a VGA faz a arte sem material." },
    precisaMaterial: { type: "boolean" },
    dica: { type: "string", description: "Dica prática ou alerta de regra; pode ser vazio" },
    sequencia: {
      type: "array",
      description: "Só Stories: 2 a 4 momentos do dia. Vazio nos outros formatos.",
      items: {
        type: "object",
        properties: { momento: { type: "string" }, ideia: { type: "string" }, recurso: { type: "string", description: "Enquete, caixinha, quiz, link, contagem regressiva..." } },
        required: ["momento", "ideia", "recurso"],
        additionalProperties: false,
      },
    },
  },
  required: ["id", "dia", "horario", "formato", "pilar", "quadro", "titulo", "gancho", "roteiro", "textoTela", "laminas", "legenda", "palavrasChave", "audio", "material", "precisaMaterial", "dica", "sequencia"],
  additionalProperties: false,
};

const ESQUEMA_ESTRATEGIA = {
  type: "object",
  properties: {
    tema: { type: "string", description: "Nome curto da semana" },
    foco: { type: "string", description: "A melhor linha de atuação da semana para o nicho, em 2 ou 3 frases simples" },
    tendencias: { type: "array", items: { type: "string" }, description: "3 a 5 tendências ou oportunidades da semana, em frases curtas" },
    itens: { type: "array", items: ESQUEMA_ITEM },
  },
  required: ["tema", "foco", "tendencias", "itens"],
  additionalProperties: false,
};

const SISTEMA_ESTRATEGIA = `Você é a estrategista-chefe de conteúdo da VGA Gestão de Negócios, agência do litoral do Paraná que atende pequenos e médios negócios locais.
Toda semana você entrega a ESTRATÉGIA DA SEMANA de um nicho: a pauta de cada dia com Reels, carrosséis, posts de feed e Stories, com textos prontos para o cliente aprovar.
Prioridade absoluta: o que é mais pertinente para aquele nicho NAQUELA semana e a melhor linha de atuação, cruzando tendências, datas e os pilares do nicho.
Regras de conteúdo:
- Português do Brasil, natural, sem clichês de marketing e sem exageros. Frases curtas.
- Respeite os pilares e as porcentagens do nicho ao longo da semana e use os quadros fixos.
- Siga a semana-tipo do nicho como base, adaptando aos temas e datas da semana.
- Por semana: 2 a 4 Reels, 1 a 2 carrosséis, 1 a 2 posts de feed (foto) e Stories nos dias de postagem.
- Reels: gancho forte nos 3 primeiros segundos, roteiro cena a cena com tempo, texto na tela, legenda e sugestão de áudio.
- Carrossel: tema, texto de cada lâmina (5 a 8) e legenda. Feed: ideia e legenda. Stories: sequência do dia com enquetes, caixinhas, quiz e chamada para ação.
- Legendas com primeira linha forte, parágrafos curtos, no máximo 3 emojis e chamada para ação clara.
- Use palavras-chave na legenda (valem mais que hashtags).
- Horários: almoço (11h30–13h) e noite (18h–20h) em dias de semana; manhã (9h–10h) aos sábados.
- Nunca invente preços, promoções, datas de eventos, números ou resultados. Quando precisar de um dado do cliente, use colchetes, por exemplo [nome do prato] ou [data do evento].
- Use {negocio} para o nome do negócio e {cidade} para a cidade; o sistema troca automaticamente.
- Se o nicho tiver regras do conselho profissional, siga à risca (sem preço, sem promessa de resultado, com nome e registro quando exigido).
- Varie em relação à semana anterior: não repita os mesmos títulos e ganchos.`;

export async function gerarEstrategiaIA({ nicho, semana, datas, anterior, pesquisa }) {
  const contexto = [
    descreverNicho(nicho),
    `\nRegras gerais das plataformas em 2026:\n${REGRAS_GERAIS.map((r) => `- ${r}`).join("\n")}`,
    `\nSemana: segunda ${curta(semana)} a domingo. Datas especiais nas próximas 5 semanas (comece a divulgar datas comerciais 2 a 3 semanas antes):\n${descreverDatas(datas)}`,
    pesquisa?.texto ? `\nPesquisa de tendências feita hoje na web:\n${pesquisa.texto}` : "\n(Sem pesquisa na web nesta rodada: use seu conhecimento e as tendências já mapeadas.)",
    anterior?.itens?.length
      ? `\nSemana anterior (não repita): tema "${anterior.tema}"; pautas: ${anterior.itens.filter((i) => i.formato !== "stories").map((i) => `${NOMES_DIAS[i.dia]} ${i.formato} "${i.titulo}"`).join("; ")}`
      : "",
  ].join("\n");

  const stream = obterCliente().beta.messages.stream({
    model: MODELO,
    max_tokens: 64000,
    output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA_ESTRATEGIA } },
    system: SISTEMA_ESTRATEGIA,
    messages: [{ role: "user", content: `${contexto}\n\nMonte a estratégia completa desta semana para o nicho.` }],
    ...FALLBACK,
  });
  const resposta = await stream.finalMessage();
  if (resposta.stop_reason === "refusal") throw new Error("A IA recusou gerar a estratégia.");
  if (resposta.stop_reason === "max_tokens") throw new Error("Resposta da IA incompleta.");
  const dados = JSON.parse(textoDaResposta(resposta));
  if (!Array.isArray(dados.itens) || dados.itens.length < 3) throw new Error("A IA devolveu poucas pautas.");
  return { ...dados, fontes: pesquisa?.fontes || [] };
}

// ---------- 3) Análise das fotos e vídeos ----------

const ESQUEMA_ANALISE = {
  type: "object",
  properties: {
    resumo: { type: "string", description: "Em 1 ou 2 frases, o que o material permite fazer nesta semana" },
    arquivos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Referência do arquivo, ex.: A1" },
          descricao: { type: "string", description: "O que aparece, em 1 frase" },
          nota: { type: "integer", description: "Qualidade para postar, de 0 a 10 (luz, foco, enquadramento, formato)" },
          observacao: { type: "string", description: "Problema ou dica curta; vazio se estiver ótimo" },
        },
        required: ["ref", "descricao", "nota", "observacao"],
        additionalProperties: false,
      },
    },
    escolhas: {
      type: "array",
      description: "Uma escolha por pauta que tem material adequado. Cada arquivo em no máximo uma pauta de feed/Reels/carrossel.",
      items: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          ref: { type: "string", description: "Arquivo escolhido para a pauta" },
          legenda: { type: "string", description: "Legenda final, ajustada ao que aparece no arquivo. Vazia para Stories." },
          horario: { type: "string", description: "Horário de postagem HH:MM" },
          motivo: { type: "string", description: "Por que este arquivo e este horário, em 1 frase" },
        },
        required: ["item_id", "ref", "legenda", "horario", "motivo"],
        additionalProperties: false,
      },
    },
  },
  required: ["resumo", "arquivos", "escolhas"],
  additionalProperties: false,
};

const SISTEMA_ANALISE = `Você é a social media da VGA Gestão de Negócios. O cliente enviou fotos e vídeos da semana.
Sua tarefa: avaliar cada arquivo, escolher o mais indicado para cada pauta da estratégia da semana e definir a legenda final e o horário de postagem.
Regras:
- Reels e Stories pedem vídeo vertical; feed e carrossel aceitam foto (vertical 4:5 é o ideal). Vídeo horizontal só se não houver opção melhor.
- Prefira arquivos com boa luz, foco e o assunto da pauta visível. Arquivo ruim (escuro, tremido, cortado) não deve ser escolhido.
- Só escolha um arquivo para uma pauta se ele combinar com o que a pauta pede. É melhor deixar a pauta sem arquivo do que forçar.
- A legenda final parte da legenda da pauta e cita pelo menos um detalhe concreto que aparece no arquivo. Não invente preços, nomes ou promoções.
- Mantenha os textos entre colchetes que o cliente ainda precisa preencher.
- Siga as regras do conselho profissional do nicho, se houver.
- O horário final segue o sugerido na pauta, a não ser que haja um motivo claro para mudar.`;

export async function analisarMaterialIA({ nicho, itens, arquivos }) {
  const conteudo = [];
  const refs = new Map();
  arquivos.forEach((a, i) => {
    const ref = `A${i + 1}`;
    refs.set(ref, a.id);
    const formato = a.largura && a.altura ? (a.altura > a.largura * 1.1 ? "vertical" : a.largura > a.altura * 1.1 ? "horizontal" : "quadrado") : "formato desconhecido";
    const info = `${ref}: ${a.tipo === "video" ? `vídeo${a.duracao ? ` de ${Math.round(a.duracao)}s` : ""}` : "foto"}, ${formato}${a.largura ? ` (${a.largura}x${a.altura})` : ""}, nome "${a.nome}"${a.miniatura ? "" : " (sem prévia disponível)"}`;
    conteudo.push({ type: "text", text: info });
    if (a.miniatura) conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: a.miniatura } });
  });

  const pautas = itens.map((i) => ({
    item_id: i.id, dia: NOMES_DIAS[i.dia], horario: i.horario, formato: i.formato, pilar: i.pilar,
    titulo: i.titulo, material: i.material, legenda: i.legenda, ja_tem_arquivo: Boolean(i.arquivo_id),
  }));
  conteudo.push({
    type: "text",
    text: `${descreverNicho(nicho)}\n\nPautas da semana que ainda podem receber arquivo:\n${JSON.stringify(pautas, null, 1)}\n\nAvalie os ${arquivos.length} arquivos acima e faça as escolhas.`,
  });

  const resposta = await obterCliente().beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA_ANALISE } },
    system: SISTEMA_ANALISE,
    messages: [{ role: "user", content: conteudo }],
    ...FALLBACK,
  });
  if (resposta.stop_reason === "refusal") throw new Error("A IA recusou analisar este material.");
  if (resposta.stop_reason === "max_tokens") throw new Error("Resposta da IA incompleta.");
  const dados = JSON.parse(textoDaResposta(resposta));

  const idsItens = new Set(itens.map((i) => i.id));
  return {
    resumo: String(dados.resumo || ""),
    origem: "ia",
    arquivos: (dados.arquivos || [])
      .filter((a) => refs.has(a.ref))
      .map((a) => ({ id: refs.get(a.ref), descricao: String(a.descricao || ""), nota: Math.max(0, Math.min(10, Number(a.nota) || 0)), observacao: String(a.observacao || "") })),
    escolhas: (dados.escolhas || [])
      .filter((e) => refs.has(e.ref) && idsItens.has(e.item_id))
      .map((e) => ({
        item_id: e.item_id,
        arquivo_id: refs.get(e.ref),
        legenda: String(e.legenda || ""),
        horario: horarioValido(e.horario) ? e.horario : null,
        motivo: String(e.motivo || ""),
      })),
  };
}

// Análise sem IA: vídeos verticais vão para Reels/Stories, fotos para feed/carrossel, na ordem da semana.
export function analisarMaterialModelo({ itens, arquivos }) {
  const vertical = (a) => a.largura && a.altura && a.altura > a.largura * 1.1;
  const notaDe = (a) => {
    let n = 6;
    const menor = Math.min(a.largura || 0, a.altura || 0);
    if (menor >= 1080) n += 2;
    else if (menor && menor < 600) n -= 2;
    if (a.tipo === "video" && vertical(a)) n += 1;
    if (a.tipo === "video" && a.duracao > 90) n -= 1;
    return Math.max(0, Math.min(10, n));
  };
  const avaliados = arquivos.map((a) => ({ ...a, nota: notaDe(a) })).sort((x, y) => y.nota - x.nota);
  const usados = new Set();
  const escolhas = [];
  for (const item of itens) {
    if (item.arquivo_id || !item.precisaMaterial) continue;
    const querVideo = item.formato === "reels" || item.formato === "stories";
    const livre = (a) => !usados.has(a.id);
    const candidato = querVideo
      ? avaliados.find((a) => livre(a) && a.tipo === "video" && vertical(a)) ||
        avaliados.find((a) => livre(a) && a.tipo === "video") ||
        (item.formato === "stories" ? avaliados.find(livre) : null)
      : avaliados.find((a) => livre(a) && a.tipo === "foto");
    if (!candidato) continue;
    usados.add(candidato.id);
    escolhas.push({
      item_id: item.id,
      arquivo_id: candidato.id,
      legenda: item.legenda,
      horario: item.horario,
      motivo: querVideo ? "Vídeo escolhido para o formato em movimento desta pauta." : "Foto com melhor resolução para o feed.",
    });
  }
  return {
    resumo: escolhas.length
      ? `Distribuímos ${escolhas.length} arquivo(s) nas pautas da semana. Confira e aprove.`
      : "Nenhum arquivo combinou com as pautas que faltam. Veja o que cada pauta pede.",
    origem: "modelo",
    arquivos: avaliados.map((a) => ({
      id: a.id,
      descricao: a.tipo === "video" ? `Vídeo ${vertical(a) ? "vertical" : "horizontal"}` : `Foto ${vertical(a) ? "vertical" : "horizontal"}`,
      nota: a.nota,
      observacao: a.tipo === "video" && !vertical(a) ? "Para Reels, prefira gravar com o celular em pé." : "",
    })),
    escolhas,
  };
}
