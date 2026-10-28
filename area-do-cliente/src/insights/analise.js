// Transforma os números do mês em: variação contra o mês anterior, histórico para o gráfico,
// resumo geral e leituras em linguagem simples ("O que isso significa"),
// com uma recomendação ligada à estratégia da semana.
import { FONTES } from "./campos.js";

const NOMES_DIAS = { seg: "segunda", ter: "terça", qua: "quarta", qui: "quinta", sex: "sexta", sab: "sábado", dom: "domingo" };
const FORMATOS = { reels: "Reel", carrossel: "carrossel", feed: "post de feed", stories: "Stories" };

const fmt = (n, casas = 0) =>
  n === null || n === undefined ? "–" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pctTexto = (p) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${fmt(Math.abs(p), 1)}%`;
const tem = (v) => typeof v === "number" && Number.isFinite(v);
const soma = (...vs) => (vs.some(tem) ? vs.reduce((s, v) => s + (tem(v) ? v : 0), 0) : null);

// Métricas calculadas a partir das que a VGA lança.
export function derivados(fonteId, d = {}) {
  if (!d) return {};
  if (fonteId === "meta") {
    return {
      ...d,
      contatos: soma(d.cliques_link, d.cliques_whatsapp),
      taxa_engajamento: tem(d.contas_engajadas) && d.alcance ? Math.round((d.contas_engajadas / d.alcance) * 1000) / 10 : null,
    };
  }
  if (fonteId === "google") {
    return { ...d, visualizacoes: soma(d.visualizacoes_maps, d.visualizacoes_pesquisa), contatos: soma(d.ligacoes, d.rotas, d.cliques_site) };
  }
  return { ...d };
}

export const NOMES_DERIVADOS = {
  contatos: "Contatos gerados",
  taxa_engajamento: "Taxa de engajamento (%)",
  visualizacoes: "Visualizações (Maps + Pesquisa)",
};

export function variacao(atual, anterior, { menorMelhor = false } = {}) {
  if (!tem(atual) || !tem(anterior)) return null;
  const delta = Math.round((atual - anterior) * 10) / 10;
  const pct = anterior ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null;
  const sentido = delta === 0 ? "igual" : (delta > 0) !== menorMelhor ? "melhor" : "pior";
  return { delta, pct, sentido };
}

function nomeMetrica(fonteId, id) {
  return FONTES[fonteId].numeros.find((n) => n.id === id)?.nome || NOMES_DERIVADOS[id] || id;
}

// ---------- ligação com a estratégia da semana ----------
function descreverPauta(i) {
  return `${FORMATOS[i.formato] || i.formato} de ${NOMES_DIAS[i.dia]} ("${i.titulo}")`;
}
function acharPauta(itens, filtro) {
  return (itens || []).find(filtro) || null;
}
const ePost = (i) => i.formato !== "stories";
const pautaReels = (itens) => acharPauta(itens, (i) => i.formato === "reels");
const pautaProva = (itens) => acharPauta(itens, (i) => ePost(i) && /prova|depoimento|avalia|hóspede conta|cliente/i.test(`${i.pilar} ${i.quadro}`)) || acharPauta(itens, (i) => ePost(i) && i.formato === "feed");
const pautaStoriesConversa = (itens) => acharPauta(itens, (i) => i.formato === "stories" && i.sequencia?.some((s) => /enquete|caixinha|quiz/i.test(s.recurso)));
const pautaOferta = (itens) => acharPauta(itens, (i) => ePost(i) && /oferta|convite|reserva|matr[ií]cula|agend|conversão|contato|datas/i.test(`${i.pilar} ${i.quadro}`));

function recomendacao(texto, pauta) {
  return { texto, item_id: pauta?.id || null };
}

// ---------- leituras por fonte ----------
function leiturasMeta(d, a, itens) {
  const L = [];
  const vSeg = variacao(d.seguidores, a?.seguidores);
  if (vSeg) {
    L.push(vSeg.delta >= 0
      ? `Você ganhou ${fmt(vSeg.delta)} seguidores no mês${vSeg.pct !== null ? ` (${pctTexto(vSeg.pct)})` : ""}. Seu perfil está crescendo.`
      : `Você perdeu ${fmt(-vSeg.delta)} seguidores${vSeg.pct !== null ? ` (${pctTexto(vSeg.pct)})` : ""}. Oscilar é normal; o que importa é a tendência dos próximos meses.`);
  } else if (tem(d.seguidores)) {
    L.push(`Você terminou o mês com ${fmt(d.seguidores)} seguidores.`);
  }
  const razao = tem(d.alcance) && d.seguidores ? d.alcance / d.seguidores : null;
  if (razao !== null) {
    L.push(razao >= 1
      ? `Seu conteúdo chegou a ${fmt(d.alcance)} contas, mais que o número de seguidores: gente nova está descobrindo o seu negócio.`
      : `O alcance (${fmt(d.alcance)} contas) ficou abaixo do número de seguidores: o conteúdo está circulando mais entre quem já te segue.`);
  }
  if (tem(d.taxa_engajamento)) {
    const t = d.taxa_engajamento;
    L.push(`${fmt(t, 1)}% de quem viu interagiu com você. ${t >= 5 ? "É uma taxa boa: o público gosta do que vê." : t >= 2 ? "É uma taxa razoável; dá para subir com mais conversa." : "Está baixa: o público vê, mas pouca gente responde."}`);
  }
  const vCont = variacao(d.contatos, a?.contatos);
  if (tem(d.contatos) && L.length < 3) {
    L.push(`${fmt(d.contatos)} pessoas clicaram no link ou no WhatsApp${vCont?.pct !== null && vCont ? ` (${pctTexto(vCont.pct)} contra o mês anterior)` : ""}. Esses são contatos de quem quer comprar.`);
  }

  const melhorHora = (d.horarios_online || []).slice().sort((x, y) => y.valor - x.valor)[0]?.faixa;
  const vAlc = variacao(d.alcance, a?.alcance);
  const reel = pautaReels(itens);
  const stories = pautaStoriesConversa(itens);
  const oferta = pautaOferta(itens);
  let rec;
  if ((vAlc && vAlc.sentido === "pior") || (razao !== null && razao < 1)) {
    rec = recomendacao(
      `Para chegar a gente nova, capriche no ${reel ? descreverPauta(reel) : "Reel da semana"}: gancho forte nos 3 primeiros segundos${melhorHora ? ` e postagem perto das ${melhorHora}, quando seus seguidores estão mais online` : ""}.`,
      reel,
    );
  } else if (tem(d.taxa_engajamento) && d.taxa_engajamento < 3) {
    rec = recomendacao(`Para o público conversar mais, use as enquetes e caixinhas dos ${stories ? `Stories de ${NOMES_DIAS[stories.dia]}` : "Stories da semana"} e responda todo mundo.`, stories);
  } else if (vCont && vCont.sentido === "pior") {
    rec = recomendacao(`Os cliques caíram: reforce a chamada para o WhatsApp no ${oferta ? descreverPauta(oferta) : "post de oferta da semana"} e deixe o link da bio sempre atualizado.`, oferta);
  } else {
    rec = recomendacao(`O caminho está certo. Mantenha o ritmo com o ${reel ? descreverPauta(reel) : "Reel da semana"}${melhorHora ? `, postando perto das ${melhorHora}` : ""}.`, reel);
  }
  return { leituras: L.slice(0, 3), recomendacao: rec };
}

function leiturasGoogle(d, a, itens) {
  const L = [];
  const vVis = variacao(d.visualizacoes, a?.visualizacoes);
  if (tem(d.visualizacoes)) {
    const maps = d.visualizacoes ? Math.round(((d.visualizacoes_maps || 0) / d.visualizacoes) * 100) : 0;
    L.push(`Seu perfil apareceu ${fmt(d.visualizacoes)} vezes no Google${vVis?.pct !== null && vVis ? ` (${pctTexto(vVis.pct)})` : ""}. ${maps >= 50 ? `${maps}% foi pelo Maps: gente por perto procurando onde ir.` : `${100 - maps}% foi pela Pesquisa: gente procurando pelo nome ou pelo tipo do seu negócio.`}`);
  }
  if (tem(d.contatos)) {
    const taxa = d.visualizacoes ? Math.round((d.contatos / d.visualizacoes) * 1000) / 10 : null;
    L.push(`${fmt(d.contatos)} pessoas ligaram, pediram rota ou clicaram no site${taxa !== null ? ` (${fmt(taxa, 1)}% de quem viu)` : ""}. ${tem(d.rotas) && d.rotas >= (d.ligacoes || 0) ? "A maioria pediu rota: o Google está trazendo gente até a sua porta." : "São clientes prontos para agir."}`);
  }
  const semResposta = (d.ultimas_avaliacoes || []).filter((r) => !r.respondida).length;
  const novas = tem(d.total_avaliacoes) && tem(a?.total_avaliacoes) ? d.total_avaliacoes - a.total_avaliacoes : null;
  if (tem(d.nota_media)) {
    L.push(`Nota ${fmt(d.nota_media, 1)} com ${fmt(d.total_avaliacoes)} avaliações${novas !== null ? ` (${novas >= 0 ? "+" : ""}${fmt(novas)} no mês)` : ""}. ${d.nota_media >= 4.5 ? "É uma nota excelente, que ajuda a aparecer antes dos concorrentes." : d.nota_media >= 4 ? "É uma boa nota; mais avaliações recentes ajudam a subir." : "A nota está pedindo atenção: responda com cuidado e peça avaliação a quem saiu satisfeito."}`);
  }
  const prova = pautaProva(itens);
  let rec;
  if (semResposta) {
    rec = recomendacao(`Responda as ${semResposta} avaliações sem resposta ainda esta semana. Depois, use a melhor delas no ${prova ? descreverPauta(prova) : "post de prova social da semana"}.`, prova);
  } else if ((novas !== null && novas < 5) || (tem(d.nota_media) && d.nota_media < 4.5)) {
    rec = recomendacao(`Peça avaliação no Google a quem sai satisfeito (QR code no balcão ou na conta) e reforce isso no ${prova ? descreverPauta(prova) : "post de prova social da semana"}.`, prova);
  } else {
    const feed = acharPauta(itens, (i) => i.formato === "feed") || prova;
    rec = recomendacao(`Publique no Google Perfil a mesma foto do ${feed ? descreverPauta(feed) : "post de feed da semana"}: post semanal no Google ajuda a aparecer no Maps.`, feed);
  }
  return { leituras: L.slice(0, 3), recomendacao: rec };
}

function leiturasTrip(d, a, itens) {
  const L = [];
  const novas = tem(d.total_avaliacoes) && tem(a?.total_avaliacoes) ? d.total_avaliacoes - a.total_avaliacoes : null;
  if (tem(d.nota)) {
    L.push(`Nota ${fmt(d.nota, 1)} de 5 com ${fmt(d.total_avaliacoes)} avaliações${novas !== null ? ` (${novas >= 0 ? "+" : ""}${fmt(novas)} no mês)` : ""}.`);
  }
  if (tem(d.ranking_posicao)) {
    const v = variacao(d.ranking_posicao, a?.ranking_posicao, { menorMelhor: true });
    const onde = `${fmt(d.ranking_posicao)}º${tem(d.ranking_total) ? ` de ${fmt(d.ranking_total)}` : ""}${d.ranking_categoria ? ` ${d.ranking_categoria}` : " no ranking da cidade"}`;
    L.push(v && v.sentido === "melhor"
      ? `Você subiu ${fmt(Math.abs(v.delta))} posição(ões) e está em ${onde}. Avaliações recentes e boas fazem a diferença.`
      : v && v.sentido === "pior"
        ? `Você caiu ${fmt(Math.abs(v.delta))} posição(ões) e está em ${onde}. O ranking valoriza avaliações novas: vale pedir mais.`
        : `Você está em ${onde}.`);
  }
  if (d.selos?.length) {
    L.push(`Você tem ${d.selos.length > 1 ? "os selos" : "o selo"} ${d.selos.map((s) => s.nome).join(", ")}. É prova de qualidade: mostre nos posts e no balcão.`);
  } else if (L.length < 3 && tem(d.nota)) {
    L.push("Ainda sem selo este ano. O Travellers' Choice considera a nota e a quantidade de avaliações dos últimos 12 meses.");
  }
  const prova = pautaProva(itens);
  const semResposta = (d.ultimas_avaliacoes || []).filter((r) => !r.respondida).length;
  const rec = semResposta
    ? recomendacao(`Responda as ${semResposta} avaliações sem resposta no TripAdvisor e use um trecho da melhor no ${prova ? descreverPauta(prova) : "post de prova social da semana"}.`, prova)
    : recomendacao(`Use uma avaliação do TripAdvisor${d.selos?.length ? " e o seu selo" : ""} no ${prova ? descreverPauta(prova) : "post de prova social da semana"}: turista confia em quem já foi.`, prova);
  return { leituras: L.slice(0, 3), recomendacao: rec };
}

const LEITURAS = { meta: leiturasMeta, google: leiturasGoogle, tripadvisor: leiturasTrip };

// Monta tudo o que a tela de uma fonte precisa.
export function analisarFonte(fonteId, { atual, anterior, historico, itensSemana }) {
  const fonte = FONTES[fonteId];
  const d = atual ? derivados(fonteId, atual.dados) : null;
  const a = anterior ? derivados(fonteId, anterior.dados) : null;
  const ids = [...fonte.numeros.map((n) => n.id), ...(fonteId === "tripadvisor" ? [] : ["contatos"])];
  const cartoes = d
    ? ids.filter((id) => tem(d[id])).map((id) => {
      const def = fonte.numeros.find((n) => n.id === id) || {};
      return { id, nome: nomeMetrica(fonteId, id), valor: d[id], decimal: Boolean(def.decimal), variacao: variacao(d[id], a?.[id], { menorMelhor: def.menorMelhor }) };
    })
    : [];
  const graficos = fonte.grafico.map((id) => ({
    id,
    nome: nomeMetrica(fonteId, id),
    menorMelhor: Boolean(fonte.numeros.find((n) => n.id === id)?.menorMelhor),
    pontos: historico.map((h) => ({ mes: h.mes, valor: h.dados ? derivados(fonteId, h.dados)[id] ?? null : null })),
  })).filter((g) => g.pontos.some((p) => tem(p.valor)));
  const { leituras, recomendacao: rec } = d ? LEITURAS[fonteId](d, a, itensSemana) : { leituras: [], recomendacao: null };
  return {
    id: fonteId,
    nome: fonte.nome,
    icone: fonte.icone,
    temDados: Boolean(d && Object.keys(atual.dados).length),
    origem: atual?.origem || null,
    atualizado_em: atual?.atualizado_em || null,
    nota_equipe: atual?.nota_equipe || "",
    mesAnteriorTemDados: Boolean(a),
    cartoes,
    graficos,
    listas: d ? Object.fromEntries(fonte.listas.map((l) => [l.id, d[l.id] || []])) : {},
    ranking_categoria: d?.ranking_categoria || "",
    leituras,
    recomendacao: rec,
  };
}

// Resumo do topo: nota média das avaliações, crescimento de seguidores, contatos gerados.
export function resumoGeral({ atual, anterior }) {
  const m = derivados("meta", atual.meta?.dados);
  const g = derivados("google", atual.google?.dados);
  const t = atual.tripadvisor?.dados || {};
  const mA = derivados("meta", anterior.meta?.dados);
  const gA = derivados("google", anterior.google?.dados);

  const notas = [
    tem(g.nota_media) && tem(g.total_avaliacoes) && { nota: g.nota_media, total: g.total_avaliacoes, fonte: "Google" },
    tem(t.nota) && tem(t.total_avaliacoes) && { nota: t.nota, total: t.total_avaliacoes, fonte: "TripAdvisor" },
  ].filter(Boolean);
  const totalAval = notas.reduce((s, n) => s + n.total, 0);
  const notaMedia = totalAval ? Math.round((notas.reduce((s, n) => s + n.nota * n.total, 0) / totalAval) * 10) / 10 : null;

  const contatos = soma(m.contatos, g.contatos);
  const contatosAnt = soma(mA.contatos, gA.contatos);
  return {
    nota: notaMedia === null ? null : { valor: notaMedia, avaliacoes: totalAval, fontes: notas.map((n) => n.fonte) },
    seguidores: tem(m.seguidores) ? { valor: m.seguidores, variacao: variacao(m.seguidores, mA.seguidores) } : null,
    contatos: contatos === null ? null : { valor: contatos, variacao: variacao(contatos, contatosAnt) },
  };
}
