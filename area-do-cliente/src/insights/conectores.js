// FASE 2 — conexão automática com as APIs oficiais.
// Na Fase 1 os números são lançados pela equipe VGA (formulário ou CSV). Este arquivo deixa pronto:
//  - quais chamadas fazer em cada API (montarPedidos);
//  - como transformar a resposta nos mesmos campos do formulário (converter).
// Assim, ligar a Fase 2 é: guardar o token de cada cliente com segurança, chamar buscarMes() uma vez
// por mês (ou por dia) e salvar com origem "api". Os nomes das métricas seguem a documentação oficial
// de 2026; confira no changelog de cada plataforma antes de ligar, porque a Meta muda nomes com frequência.

const VERSAO_META = "v25.0";

function periodoDoMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  const inicio = new Date(Date.UTC(a, m - 1, 1));
  const fim = new Date(Date.UTC(a, m, 0));
  return { a, m, ultimoDia: fim.getUTCDate(), since: Math.floor(inicio / 1000), until: Math.floor(fim / 1000) + 86399 };
}

function totalDe(resposta, nome) {
  const item = (resposta?.data || []).find((d) => d.name === nome);
  if (!item) return undefined;
  if (item.total_value && typeof item.total_value.value === "number") return item.total_value.value;
  if (Array.isArray(item.values)) return item.values.reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);
  return undefined;
}

function quebrasDe(resposta, nome) {
  const item = (resposta?.data || []).find((d) => d.name === nome);
  return item?.total_value?.breakdowns?.[0]?.results || [];
}

// ---------- Meta (Instagram) ----------
export const meta = {
  id: "meta",
  nome: "Meta Graph API (Instagram/Facebook)",
  configurado: () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  requisitos: [
    "Conta do Instagram do cliente como Profissional (Empresa ou Criador), ligada a uma Página do Facebook.",
    "App da VGA no developers.facebook.com (tipo Empresa) com o produto Instagram.",
    "Permissões: instagram_basic e instagram_manage_insights (+ pages_show_list e pages_read_engagement) pelo Login do Facebook; ou instagram_business_basic e instagram_business_manage_insights pelo Login do Instagram.",
    "Verificação da empresa no Gerenciador de Negócios da Meta e Análise do App (App Review) com vídeo mostrando a tela de Insights.",
    "Política de privacidade publicada e cada cliente autorizando uma vez (botão 'Conectar Instagram').",
    "Dados demográficos e horários online só aparecem com 100 seguidores ou mais.",
  ],
  montarPedidos({ contaId, mes }) {
    const base = `https://graph.facebook.com/${VERSAO_META}/${contaId}`;
    const { since, until } = periodoDoMes(mes);
    const periodo = `period=day&metric_type=total_value&since=${since}&until=${until}`;
    return {
      perfil: `${base}?fields=followers_count`,
      conta: `${base}/insights?metric=reach,accounts_engaged,total_interactions,profile_views&${periodo}`,
      links: `${base}/insights?metric=profile_links_taps&breakdown=contact_button_type&${periodo}`,
      midias: `${base}/media?fields=id,caption,media_product_type,permalink,timestamp,insights.metric(reach,views,total_interactions)&since=${since}&until=${until}&limit=100`,
      online: `${base}/insights?metric=online_followers&period=lifetime`,
      cidades: `${base}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=city`,
      idades: `${base}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age`,
    };
  },
  converter(r) {
    const dados = {};
    if (typeof r.perfil?.followers_count === "number") dados.seguidores = r.perfil.followers_count;
    const mapa = { alcance: "reach", contas_engajadas: "accounts_engaged", interacoes: "total_interactions", visitas_perfil: "profile_views" };
    for (const [campo, metrica] of Object.entries(mapa)) {
      const v = totalDe(r.conta, metrica);
      if (v !== undefined) dados[campo] = v;
    }
    const links = quebrasDe(r.links, "profile_links_taps");
    if (links.length) {
      const whats = links.filter((x) => /WHATSAPP|TEXT|MESSAGE/i.test(x.dimension_values?.[0] || "")).reduce((s, x) => s + x.value, 0);
      dados.cliques_whatsapp = whats;
      dados.cliques_link = links.reduce((s, x) => s + x.value, 0) - whats;
    }
    const midias = (r.midias?.data || []).map((m) => {
      const ins = Object.fromEntries((m.insights?.data || []).map((i) => [i.name, i.values?.[0]?.value ?? 0]));
      return { ...m, reach: ins.reach || 0, views: ins.views || 0, interacoes: ins.total_interactions || 0 };
    });
    if (midias.length) {
      dados.visualizacoes_reels = midias.filter((m) => m.media_product_type === "REELS").reduce((s, m) => s + m.views, 0);
      const tipo = { REELS: "Reels", FEED: "Post", STORY: "Stories" };
      dados.melhores_posts = midias
        .sort((a, b) => b.interacoes - a.interacoes)
        .slice(0, 3)
        .map((m) => ({ titulo: (m.caption || "Post").split("\n")[0].slice(0, 80), tipo: tipo[m.media_product_type] || "Post", alcance: m.reach, interacoes: m.interacoes, link: m.permalink || "" }));
    }
    // online_followers: valor por hora (0 a 23) no fuso da conta; pega as 3 horas mais fortes.
    const online = (r.online?.data || []).find((d) => d.name === "online_followers")?.values?.[0]?.value;
    if (online && typeof online === "object") {
      dados.horarios_online = Object.entries(online).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, v]) => ({ faixa: `${h}h`, valor: v }));
    }
    const pct = (lista) => {
      const total = lista.reduce((s, x) => s + x.value, 0) || 1;
      return lista.sort((a, b) => b.value - a.value).slice(0, 5).map((x) => ({ nome: x.dimension_values?.[0] || "", faixa: x.dimension_values?.[0] || "", valor: Math.round((x.value / total) * 100) }));
    };
    const cidades = quebrasDe(r.cidades, "follower_demographics");
    if (cidades.length) dados.cidades = pct(cidades).map(({ nome, valor }) => ({ nome: nome.split(",")[0], valor }));
    const idades = quebrasDe(r.idades, "follower_demographics");
    if (idades.length) dados.idades = pct(idades).map(({ faixa, valor }) => ({ faixa, valor }));
    return dados;
  },
};

// ---------- Google (Perfil da Empresa) ----------
const METRICAS_GOOGLE = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "WEBSITE_CLICKS",
];
const ESTRELAS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export const google = {
  id: "google",
  nome: "Google Business Profile Performance API + API de avaliações (v4)",
  configurado: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  requisitos: [
    "Projeto no Google Cloud Console com as APIs 'Business Profile Performance API', 'My Business Account Management API' e 'My Business Business Information API' ativadas.",
    "Pedido de acesso às APIs do Perfil da Empresa (formulário 'Application for Basic API Access'). Enquanto a cota aparecer como 0, o projeto não foi aprovado; a análise leva até cerca de 2 semanas.",
    "Perfil da empresa verificado e ativo há pelo menos 60 dias, com site; o e-mail do pedido precisa ser dono ou administrador do perfil.",
    "Tela de consentimento OAuth publicada, escopo https://www.googleapis.com/auth/business.manage e um ID de cliente OAuth (Aplicativo da Web).",
    "A VGA como administradora de cada perfil (ou o cliente autorizando uma vez).",
  ],
  montarPedidos({ contaId, localId, mes }) {
    const { a, m, ultimoDia } = periodoDoMes(mes);
    const faixa = `dailyRange.start_date.year=${a}&dailyRange.start_date.month=${m}&dailyRange.start_date.day=1` +
      `&dailyRange.end_date.year=${a}&dailyRange.end_date.month=${m}&dailyRange.end_date.day=${ultimoDia}`;
    return {
      desempenho: `https://businessprofileperformance.googleapis.com/v1/locations/${localId}:fetchMultiDailyMetricsTimeSeries?${METRICAS_GOOGLE.map((x) => `dailyMetrics=${x}`).join("&")}&${faixa}`,
      avaliacoes: `https://mybusiness.googleapis.com/v4/accounts/${contaId}/locations/${localId}/reviews?pageSize=5&orderBy=updateTime%20desc`,
    };
  },
  converter(r) {
    const total = {};
    for (const grupo of r.desempenho?.multiDailyMetricTimeSeries || []) {
      for (const serie of grupo.dailyMetricTimeSeries || []) {
        total[serie.dailyMetric] = (serie.timeSeries?.datedValues || []).reduce((s, v) => s + Number(v.value || 0), 0);
      }
    }
    const dados = {};
    const somar = (...ks) => (ks.some((k) => k in total) ? ks.reduce((s, k) => s + (total[k] || 0), 0) : undefined);
    const campos = {
      visualizacoes_maps: somar("BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS"),
      visualizacoes_pesquisa: somar("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"),
      ligacoes: somar("CALL_CLICKS"),
      rotas: somar("BUSINESS_DIRECTION_REQUESTS"),
      cliques_site: somar("WEBSITE_CLICKS"),
    };
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) dados[k] = v;
    if (r.avaliacoes) {
      if (typeof r.avaliacoes.averageRating === "number") dados.nota_media = Math.round(r.avaliacoes.averageRating * 10) / 10;
      if (typeof r.avaliacoes.totalReviewCount === "number") dados.total_avaliacoes = r.avaliacoes.totalReviewCount;
      dados.ultimas_avaliacoes = (r.avaliacoes.reviews || []).slice(0, 5).map((v) => ({
        autor: v.reviewer?.displayName || "Cliente",
        nota: ESTRELAS[v.starRating] || 0,
        data: String(v.createTime || "").slice(0, 10),
        texto: String(v.comment || "").slice(0, 800),
        respondida: Boolean(v.reviewReply),
      }));
    }
    return dados;
  },
};

// ---------- TripAdvisor ----------
// A Content API antiga foi desligada em 31/08/2026. A substituta (Terra API) só entrega dados PÚBLICOS
// do local (nota, número de avaliações, ranking e até 5 avaliações), exige contrato/ordem para alguns usos
// e regras de exibição (logo e link do TripAdvisor, sem reordenar). Não existe API com os dados do dono
// (painel do Management Center). Por isso o TripAdvisor continua no preenchimento manual.
export const tripadvisor = {
  id: "tripadvisor",
  nome: "TripAdvisor",
  configurado: () => false,
  manual: true,
  requisitos: [
    "Sem API com dados do dono: a equipe VGA copia do painel do TripAdvisor (Management Center) a nota, o número de avaliações, a posição no ranking, os selos e as últimas avaliações.",
    "Se no futuro for usar a Terra API para os dados públicos: chave própria (a chave antiga não funciona), exibir logo e link do TripAdvisor e não reordenar avaliações.",
  ],
};

export const CONECTORES = { meta, google, tripadvisor };

// Executa as chamadas de um conector e devolve os campos prontos para salvar (origem "api").
export async function buscarMes(conector, { token, mes, ...ids }, { fetch: f = globalThis.fetch } = {}) {
  if (!conector.montarPedidos) throw new Error(`${conector.nome}: preenchimento manual.`);
  const pedidos = conector.montarPedidos({ ...ids, mes });
  const respostas = {};
  for (const [nome, url] of Object.entries(pedidos)) {
    const r = await f(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${conector.nome}: ${nome} respondeu ${r.status}`);
    respostas[nome] = await r.json();
  }
  return conector.converter(respostas);
}
