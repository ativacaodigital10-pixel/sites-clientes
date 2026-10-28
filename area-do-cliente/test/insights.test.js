import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { criarApp, garantirAdmin } = await import("../server.js");
const { lerNumero, normalizarDados, mesAnterior, ultimosMeses } = await import("../src/insights/campos.js");
const { variacao, analisarFonte, resumoGeral } = await import("../src/insights/analise.js");
const { lerCSV } = await import("../src/insights/repositorio.js");
const { meta, google, tripadvisor, buscarMes } = await import("../src/insights/conectores.js");
const { semanaAtual, hojeSP } = await import("../src/datas.js");

let pasta, servidor, base, db;

class Sessao {
  constructor() {
    this.cookie = "";
  }
  async req(caminho, { metodo = "GET", corpo } = {}) {
    const headers = this.cookie ? { cookie: this.cookie } : {};
    if (corpo !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(base + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const c = r.headers.get("set-cookie");
    if (c) this.cookie = c.split(";")[0];
    const t = r.headers.get("content-type") || "";
    return { status: r.status, dados: t.includes("json") ? await r.json() : await r.text() };
  }
}
const admin = new Sessao();
const cliente = new Sessao();
let clienteId;

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "vga-insights-"));
  const r = criarApp({ pastaDados: pasta });
  db = r.db;
  garantirAdmin(db, { email: "vga@teste.com", senha: "senha-forte-1" });
  await new Promise((ok) => (servidor = r.app.listen(0, ok)));
  base = `http://127.0.0.1:${servidor.address().port}`;
  await admin.req("/api/entrar", { metodo: "POST", corpo: { email: "vga@teste.com", senha: "senha-forte-1" } });
  const c = await admin.req("/api/admin/clientes", {
    metodo: "POST",
    corpo: { nome: "Ponte Velha", email: "pv@teste.com", senha: "cliente-123", negocio: "Restaurante Ponte Velha", cidade: "Morretes", nicho: "gastronomia" },
  });
  clienteId = c.dados.id;
  await cliente.req("/api/entrar", { metodo: "POST", corpo: { email: "pv@teste.com", senha: "cliente-123" } });
});

after(() => {
  servidor?.close();
  db?.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test("números no formato brasileiro", () => {
  assert.equal(lerNumero("1.234"), 1234);
  assert.equal(lerNumero("4,7"), 4.7);
  assert.equal(lerNumero("1.234,5"), 1234.5);
  assert.equal(lerNumero("4.7"), 4.7);
  assert.equal(lerNumero("82%"), 82);
  assert.equal(lerNumero("abc"), null);
  assert.equal(mesAnterior("2026-01"), "2025-12");
  assert.deepEqual(ultimosMeses("2026-02", 3), ["2025-12", "2026-01", "2026-02"]);
});

test("validação dos campos de cada fonte", () => {
  const ok = normalizarDados("google", {
    nota_media: "4,7", ligacoes: "32", visualizacoes_maps: "", rotas: undefined,
    ultimas_avaliacoes: "Maria | 5 | 2026-10-12 | Ótimo | sim\nJoão | 3 | 2026-10-10 | Demorou | não\n",
  });
  assert.deepEqual(ok.erros, []);
  assert.equal(ok.dados.nota_media, 4.7);
  assert.equal(ok.dados.ligacoes, 32);
  assert.ok(!("visualizacoes_maps" in ok.dados), "campo vazio não vira zero");
  assert.equal(ok.dados.ultimas_avaliacoes.length, 2);
  assert.equal(ok.dados.ultimas_avaliacoes[0].respondida, true);
  assert.equal(ok.dados.ultimas_avaliacoes[1].respondida, false);
  assert.equal(normalizarDados("google", { nota_media: "6" }).erros.length, 1);
  assert.equal(normalizarDados("meta", { seguidores: "-3" }).erros.length, 1);
  assert.equal(normalizarDados("meta", { seguidores: "muitos" }).erros.length, 1);
});

test("variação: verde quando melhora, laranja quando piora (ranking ao contrário)", () => {
  assert.deepEqual(variacao(110, 100), { delta: 10, pct: 10, sentido: "melhor" });
  assert.equal(variacao(90, 100).sentido, "pior");
  assert.equal(variacao(3, 5, { menorMelhor: true }).sentido, "melhor");
  assert.equal(variacao(100, 100).sentido, "igual");
  assert.equal(variacao(100, undefined), null);
});

test("leituras em linguagem simples com recomendação ligada à semana", () => {
  const itensSemana = [
    { id: "p1", dia: "qua", formato: "reels", titulo: "Prato que vale a viagem", pilar: "Desejo", quadro: "" },
    { id: "p6", dia: "sab", formato: "feed", titulo: "Avaliação de cliente", pilar: "Prova social", quadro: "Cliente Avaliou" },
    { id: "s-qua", dia: "qua", formato: "stories", titulo: "Stories", pilar: "Desejo", sequencia: [{ recurso: "Enquete: qual?" }] },
  ];
  const historico = [{ mes: "2026-09", dados: { seguidores: 2000, alcance: 3000 } }, { mes: "2026-10", dados: { seguidores: 2100, alcance: 1500 } }];
  const r = analisarFonte("meta", {
    atual: { dados: { seguidores: 2100, alcance: 1500, contas_engajadas: 30, horarios_online: [{ faixa: "19h", valor: 80 }] } },
    anterior: { dados: { seguidores: 2000, alcance: 3000 } },
    historico,
    itensSemana,
  });
  assert.ok(r.leituras.length >= 2 && r.leituras.length <= 3);
  assert.match(r.leituras[0], /ganhou 100 seguidores/);
  assert.equal(r.recomendacao.item_id, "p1", "alcance caiu: recomenda o Reel da semana");
  assert.match(r.recomendacao.texto, /19h/);
  assert.equal(r.cartoes.find((c) => c.id === "alcance").variacao.sentido, "pior");
  assert.equal(r.graficos[0].pontos.length, 2);

  const g = analisarFonte("google", {
    atual: { dados: { nota_media: 4.6, total_avaliacoes: 300, ultimas_avaliacoes: [{ autor: "A", nota: 4, respondida: false }] } },
    anterior: null, historico: [], itensSemana,
  });
  assert.match(g.recomendacao.texto, /Responda as 1 avaliações/);
  assert.equal(g.recomendacao.item_id, "p6", "liga à pauta de prova social");
  assert.equal(analisarFonte("tripadvisor", { atual: null, anterior: null, historico: [], itensSemana }).temDados, false);
});

test("resumo geral: nota média ponderada e contatos somados", () => {
  const r = resumoGeral({
    atual: { meta: { dados: { seguidores: 1000, cliques_whatsapp: 10, cliques_link: 5 } }, google: { dados: { nota_media: 5, total_avaliacoes: 100, ligacoes: 3, rotas: 2 } }, tripadvisor: { dados: { nota: 4, total_avaliacoes: 100 } } },
    anterior: { meta: { dados: { seguidores: 900, cliques_whatsapp: 5 } }, google: { dados: { ligacoes: 5 } } },
  });
  assert.equal(r.nota.valor, 4.5);
  assert.equal(r.nota.avaliacoes, 200);
  assert.equal(r.seguidores.variacao.delta, 100);
  assert.equal(r.contatos.valor, 20);
  assert.equal(r.contatos.variacao.sentido, "melhor");
});

test("CSV com ponto e vírgula, aspas e quebra de linha", () => {
  const l = lerCSV('email;mes;fonte;campo;valor\r\na@b.com;2026-10;google;ultimas_avaliacoes;"Ana | 5 | 2026-10-01 | Bom; muito ""bom"" | sim"\n');
  assert.equal(l.length, 2);
  assert.equal(l[1][4], 'Ana | 5 | 2026-10-01 | Bom; muito "bom" | sim');
  assert.equal(lerCSV("email,mes,fonte,campo,valor\nx,2026-10,meta,seguidores,10")[1][4], "10");
});

test("conectores da Fase 2 convertem as respostas oficiais nos mesmos campos", async () => {
  const dm = meta.converter({
    perfil: { followers_count: 2480 },
    conta: { data: [{ name: "reach", total_value: { value: 9800 } }, { name: "total_interactions", total_value: { value: 700 } }, { name: "accounts_engaged", total_value: { value: 480 } }] },
    links: { data: [{ name: "profile_links_taps", total_value: { breakdowns: [{ results: [{ dimension_values: ["CALL"], value: 20 }, { dimension_values: ["WHATSAPP"], value: 30 }] }] } }] },
    midias: { data: [
      { caption: "Reel do barreado\nlegenda", media_product_type: "REELS", permalink: "https://instagram.com/p/1", insights: { data: [{ name: "views", values: [{ value: 5000 }] }, { name: "reach", values: [{ value: 4000 }] }, { name: "total_interactions", values: [{ value: 300 }] }] } },
      { caption: "Foto", media_product_type: "FEED", insights: { data: [{ name: "total_interactions", values: [{ value: 100 }] }] } },
    ] },
    online: { data: [{ name: "online_followers", values: [{ value: { 12: 50, 19: 90, 21: 70 } }] }] },
    cidades: { data: [{ name: "follower_demographics", total_value: { breakdowns: [{ results: [{ dimension_values: ["Curitiba, Paraná"], value: 60 }, { dimension_values: ["Morretes, Paraná"], value: 40 }] }] } }] },
  });
  assert.equal(dm.seguidores, 2480);
  assert.equal(dm.alcance, 9800);
  assert.equal(dm.cliques_whatsapp, 30);
  assert.equal(dm.cliques_link, 20);
  assert.equal(dm.visualizacoes_reels, 5000);
  assert.equal(dm.melhores_posts[0].titulo, "Reel do barreado");
  assert.equal(dm.horarios_online[0].faixa, "19h");
  assert.deepEqual(dm.cidades[0], { nome: "Curitiba", valor: 60 });
  assert.deepEqual(normalizarDados("meta", dm).erros, [], "saída do conector passa na validação");

  const dg = google.converter({
    desempenho: { multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [
      { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", timeSeries: { datedValues: [{ value: "100" }, { value: "50" }] } },
      { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", timeSeries: { datedValues: [{ value: "10" }] } },
      { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ value: "7" }, {}] } },
      { dailyMetric: "BUSINESS_DIRECTION_REQUESTS", timeSeries: { datedValues: [{ value: "12" }] } },
    ] }] },
    avaliacoes: { averageRating: 4.66, totalReviewCount: 320, reviews: [{ reviewer: { displayName: "Maria" }, starRating: "FIVE", comment: "Ótimo", createTime: "2026-10-12T10:00:00Z", reviewReply: { comment: "Obrigado" } }] },
  });
  assert.equal(dg.visualizacoes_maps, 160);
  assert.equal(dg.ligacoes, 7);
  assert.equal(dg.rotas, 12);
  assert.ok(!("visualizacoes_pesquisa" in dg));
  assert.equal(dg.nota_media, 4.7);
  assert.deepEqual(dg.ultimas_avaliacoes[0], { autor: "Maria", nota: 5, data: "2026-10-12", texto: "Ótimo", respondida: true });

  const pedidos = google.montarPedidos({ contaId: "1", localId: "99", mes: "2026-02" });
  assert.match(pedidos.desempenho, /locations\/99:fetchMultiDailyMetricsTimeSeries/);
  assert.match(pedidos.desempenho, /dailyRange\.end_date\.day=28/);
  assert.equal(tripadvisor.manual, true);
  await assert.rejects(buscarMes(tripadvisor, { mes: "2026-10" }), /manual/);

  // buscarMes usa o fetch informado e manda o token no cabeçalho.
  const vistos = [];
  const falso = async (url, o) => {
    vistos.push([url, o.headers.Authorization]);
    return { ok: true, json: async () => (url.includes("reviews") ? { averageRating: 5, totalReviewCount: 1 } : {}) };
  };
  const r = await buscarMes(google, { token: "abc", contaId: "1", localId: "2", mes: "2026-10" }, { fetch: falso });
  assert.equal(r.nota_media, 5);
  assert.equal(vistos.length, 2);
  assert.equal(vistos[0][1], "Bearer abc");
});

test("dashboard sem dados mostra estados vazios (sem zeros inventados)", async () => {
  const { status, dados } = await cliente.req("/api/inicio");
  assert.equal(status, 200);
  assert.equal(dados.saudacao.negocio, "Restaurante Ponte Velha");
  assert.equal(dados.saudacao.nicho.id, "gastronomia");
  assert.equal(dados.indicadores, null);
  assert.equal(dados.destaque, null);
  assert.equal(dados.datas.length, 3);
  assert.ok(dados.datas.every((d) => d.inicio >= hojeSP()));
  assert.ok(dados.dica.texto.length > 20);
  assert.equal(dados.semana.semana, semanaAtual());
  assert.equal(dados.semana.planejados, dados.pendencias.para_aprovar.total + dados.pendencias.falta_material.total);
  const ins = (await cliente.req("/api/insights")).dados;
  assert.equal(ins.fontes.meta.temDados, false);
  assert.equal(ins.resumo.nota, null);
});

test("VGA lança os números; cliente vê variação, gráfico e leituras", async () => {
  assert.equal((await cliente.req("/api/admin/insights", { metodo: "PUT", corpo: { usuario_id: clienteId, mes: "2026-09", fonte: "meta", dados: { seguidores: 1 } } })).status, 403);
  const salvar = (mes, fonte, dados, extra = {}) => admin.req("/api/admin/insights", { metodo: "PUT", corpo: { usuario_id: clienteId, mes, fonte, dados, ...extra } });
  assert.equal((await salvar("2026-09", "meta", { seguidores: "2.000", alcance: "8.000", interacoes: "500", cliques_whatsapp: "40" })).status, 200);
  assert.equal((await salvar("2026-10", "meta", {
    seguidores: "2.200", alcance: "7.000", interacoes: "640", cliques_whatsapp: "50",
    melhores_posts: "Reel do barreado | Reels | 5.000 | 300 |\nCarrossel roteiro | carrossel | 3.000 | 200 |",
  })).status, 200);
  assert.equal((await salvar("2026-10", "google", { nota_media: "4,8", total_avaliacoes: "310", ligacoes: "20", rotas: "80" }, { nota_equipe: "Ótimo mês no Maps." })).status, 200);
  assert.equal((await salvar("2026-10", "meta", { seguidores: "-1" })).status, 400);

  const ins = (await cliente.req("/api/insights")).dados;
  assert.equal(ins.mes, "2026-10");
  assert.deepEqual(ins.meses, ["2026-10", "2026-09"]);
  const seg = ins.fontes.meta.cartoes.find((c) => c.id === "seguidores");
  assert.equal(seg.variacao.sentido, "melhor");
  assert.equal(seg.variacao.pct, 10);
  assert.equal(ins.fontes.meta.cartoes.find((c) => c.id === "alcance").variacao.sentido, "pior");
  assert.equal(ins.fontes.meta.graficos[0].pontos.length, 6);
  assert.ok(ins.fontes.meta.leituras.length >= 2);
  assert.ok(ins.fontes.meta.recomendacao.item_id, "recomendação aponta uma pauta da semana");
  assert.equal(ins.fontes.google.nota_equipe, "Ótimo mês no Maps.");
  assert.equal(ins.resumo.contatos.valor, 150);
  assert.equal(ins.resumo.nota.valor, 4.8);

  const ini = (await cliente.req("/api/inicio")).dados;
  assert.equal(ini.indicadores.mes, "2026-10");
  const ids = ini.indicadores.lista.map((i) => i.id);
  assert.deepEqual(ids, ["meta_seguidores", "meta_alcance", "meta_interacoes", "contatos", "google_nota_media"]);
  assert.equal(ini.indicadores.lista.find((i) => i.id === "contatos").detalhe.rotas, 80);
  assert.equal(ini.destaque.titulo, "Reel do barreado");

  // Formulário do painel devolve as listas em texto para editar.
  const form = (await admin.req(`/api/admin/insights?usuario_id=${clienteId}&mes=2026-10`)).dados;
  assert.match(form.fontes.meta.textos.melhores_posts, /^Reel do barreado \| Reels \| 5000 \| 300/);
  assert.equal(form.conectores.tripadvisor.manual, true);
});

test("importação de planilha CSV: confere antes, grava tudo ou nada", async () => {
  const csv = [
    "email;mes;fonte;campo;valor",
    "pv@teste.com;2026-10;tripadvisor;nota;4,5",
    "pv@teste.com;2026-10;tripadvisor;ranking_posicao;3",
    "pv@teste.com;2026-10;trip;selos;Travellers' Choice 2026",
    "ninguem@teste.com;2026-10;google;ligacoes;10",
    "pv@teste.com;2026-13;google;ligacoes;10",
    "pv@teste.com;2026-10;google;inventado;10",
  ].join("\n");
  const r1 = (await admin.req("/api/admin/insights/importar", { metodo: "POST", corpo: { csv, aplicar: true } })).dados;
  assert.equal(r1.aplicado, false, "com erro não grava nada");
  assert.equal(r1.erros.length, 3);
  assert.deepEqual(r1.erros.map((e) => e.linha), [5, 6, 7]);

  const bom = csv.split("\n").slice(0, 4).join("\n") + "\npv@teste.com;2026-10;google;ligacoes;25";
  const previa = (await admin.req("/api/admin/insights/importar", { metodo: "POST", corpo: { csv: bom } })).dados;
  assert.equal(previa.aplicado, false);
  assert.equal(previa.erros.length, 0);
  assert.equal(previa.grupos.length, 2);
  const r2 = (await admin.req("/api/admin/insights/importar", { metodo: "POST", corpo: { csv: bom, aplicar: true } })).dados;
  assert.equal(r2.aplicado, true);

  const ins = (await cliente.req("/api/insights?mes=2026-10")).dados;
  assert.equal(ins.fontes.tripadvisor.listas.selos[0].nome, "Travellers' Choice 2026");
  // Mescla com o que já existia: nota do Google continua, ligações foram atualizadas.
  const g = Object.fromEntries(ins.fontes.google.cartoes.map((c) => [c.id, c.valor]));
  assert.equal(g.nota_media, 4.8);
  assert.equal(g.ligacoes, 25);
  assert.equal(ins.fontes.tripadvisor.origem, "csv");

  const modelo = await admin.req("/api/admin/insights/modelo.csv");
  assert.match(modelo.dados, /email;mes;fonte;campo;valor/);
});

test("agendado e publicado entram no resumo da semana e travam a pauta", async () => {
  const s = (await cliente.req("/api/semana")).dados;
  const [a, b] = s.itens.filter((i) => i.formato !== "stories");
  // A VGA só agenda o que o cliente aprovou.
  assert.equal((await admin.req("/api/admin/fila/status", { metodo: "POST", corpo: { usuario_id: clienteId, semana: s.semana, item_id: a.id, status: "agendado" } })).status, 409);
  await cliente.req("/api/itens/aprovar", { metodo: "POST", corpo: { semana: s.semana, item_id: a.id } });
  await cliente.req("/api/itens/aprovar", { metodo: "POST", corpo: { semana: s.semana, item_id: b.id } });
  assert.equal((await admin.req("/api/admin/fila/status", { metodo: "POST", corpo: { usuario_id: clienteId, semana: s.semana, item_id: a.id, status: "publicado" } })).status, 200);
  assert.equal((await admin.req("/api/admin/fila/status", { metodo: "POST", corpo: { usuario_id: clienteId, semana: s.semana, item_id: b.id, status: "agendado" } })).status, 200);
  const ini = (await cliente.req("/api/inicio")).dados;
  assert.equal(ini.semana.aprovados, 2);
  assert.equal(ini.semana.agendados, 2);
  assert.equal(ini.semana.publicados, 1);
  assert.notEqual(ini.semana.proximo?.id, a.id, "o publicado não é o próximo post");
  assert.equal((await cliente.req("/api/itens/desfazer", { metodo: "POST", corpo: { semana: s.semana, item_id: b.id } })).status, 409);
  assert.equal((await cliente.req("/api/itens", { metodo: "PUT", corpo: { semana: s.semana, item_id: b.id, legenda: "x" } })).status, 409);
});
