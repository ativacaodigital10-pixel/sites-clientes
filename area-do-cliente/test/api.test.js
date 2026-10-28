import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { criarApp, garantirAdmin } = await import("../server.js");
const { NICHOS } = await import("../conteudo/nichos.js");
const { montarModelo } = await import("../src/estrategia.js");
const { semanaAtual, segundaDaSemana, somarDias } = await import("../src/datas.js");
const { detectarTipo } = await import("../src/arquivos.js");
const { analisarMaterialModelo } = await import("../src/ia.js");

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
// Cabeçalho de MP4 ("ftyp isom") + bytes quaisquer.
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(300, 2)]);

let pasta, servidor, base, db;
const geracoes = [];
const geradorFalso = {
  disponivel: () => true,
  pesquisar: async () => ({ texto: "Tendência: Reels curtos de bastidores.", fontes: [{ titulo: "Fonte", url: "https://exemplo.com" }] }),
  gerar: async ({ nicho, semana }) => {
    geracoes.push([nicho.id, semana]);
    return {
      tema: `Semana gerada ${geracoes.length}`,
      foco: "Foco da IA.",
      tendencias: ["Tendência A"],
      itens: [
        { id: "p1", dia: "seg", horario: "19:00", formato: "reels", pilar: nicho.pilares[0].nome, titulo: "Reel IA", legenda: "Legenda IA no {negocio}", material: "Vídeo vertical." },
        { id: "p2", dia: "qua", horario: "12:00", formato: "carrossel", pilar: nicho.pilares[1].nome, titulo: "Carrossel IA", laminas: ["1", "2"], legenda: "Salve", material: "Não precisa de foto." },
        { id: "s-seg", dia: "seg", horario: "09:00", formato: "stories", pilar: nicho.pilares[2].nome, titulo: "Stories IA", sequencia: [{ momento: "Manhã", ideia: "Oi", recurso: "Enquete" }], material: "Não precisa de material novo." },
      ],
    };
  },
};

class Sessao {
  constructor() {
    this.cookie = "";
  }
  async req(caminho, { metodo = "GET", corpo, bruto, tipo } = {}) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    let body;
    if (bruto) {
      body = bruto;
      headers["content-type"] = tipo || "application/octet-stream";
    } else if (corpo !== undefined) {
      body = JSON.stringify(corpo);
      headers["content-type"] = "application/json";
    }
    const r = await fetch(base + caminho, { method: metodo, headers, body });
    const c = r.headers.get("set-cookie");
    if (c) this.cookie = c.split(";")[0];
    const t = r.headers.get("content-type") || "";
    return { status: r.status, dados: t.includes("json") ? await r.json() : null };
  }
  entrar(email, senha) {
    return this.req("/api/entrar", { metodo: "POST", corpo: { email, senha } });
  }
}

const admin = new Sessao();
const cliente = new Sessao();

before(async () => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "vga-cliente-"));
  const r = criarApp({ pastaDados: pasta, gerador: geradorFalso, maxFotoMB: 1, maxVideoMB: 2 });
  db = r.db;
  garantirAdmin(db, { email: "vga@teste.com", senha: "senha-forte-1" });
  await new Promise((ok) => {
    servidor = r.app.listen(0, ok);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor?.close();
  db?.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test("datas: semanas começam na segunda-feira", () => {
  assert.equal(segundaDaSemana("2026-10-28"), "2026-10-26");
  assert.equal(segundaDaSemana("2026-11-01"), "2026-10-26");
  assert.equal(segundaDaSemana("2026-11-02"), "2026-11-02");
  assert.equal(somarDias("2026-12-30", 3), "2027-01-02");
  assert.equal(semanaAtual(new Date("2026-10-28T12:00:00Z")), "2026-10-26");
  // Domingo 23h em Brasília ainda é a mesma semana (já é segunda em UTC).
  assert.equal(semanaAtual(new Date("2026-11-02T02:00:00Z")), "2026-10-26");
});

test("os 10 nichos têm modelo de semana completo", () => {
  assert.equal(NICHOS.length, 10);
  for (const n of NICHOS) {
    assert.equal(n.pilares.reduce((s, p) => s + p.pct, 0), 100, `${n.id}: pilares somam 100%`);
    const e = montarModelo(n.id, "2026-10-26");
    const formatos = new Set(e.itens.map((i) => i.formato));
    for (const f of ["reels", "carrossel", "feed", "stories"]) assert.ok(formatos.has(f), `${n.id} tem ${f}`);
    assert.equal(new Set(e.itens.map((i) => i.id)).size, e.itens.length, `${n.id}: ids únicos`);
    const nomesPilares = new Set(n.pilares.map((p) => p.nome));
    for (const i of e.itens) {
      assert.ok(nomesPilares.has(i.pilar), `${n.id}/${i.id}: pilar "${i.pilar}" existe no nicho`);
      if (i.formato !== "stories") assert.ok(i.legenda.length > 20, `${n.id}/${i.id}: legenda pronta`);
      if (i.formato === "reels") assert.ok(i.gancho && i.roteiro.length >= 3, `${n.id}/${i.id}: Reel com gancho e roteiro`);
      if (i.formato === "carrossel") assert.ok(i.laminas.length >= 5, `${n.id}/${i.id}: carrossel com lâminas`);
      if (i.formato === "stories") assert.ok(i.sequencia.length >= 1, `${n.id}/${i.id}: sequência de Stories`);
    }
  }
});

test("detecta tipo de arquivo pelos primeiros bytes", () => {
  assert.deepEqual(detectarTipo(JPEG), { tipo: "foto", ext: "jpg" });
  assert.deepEqual(detectarTipo(MP4), { tipo: "video", ext: "mp4" });
  assert.equal(detectarTipo(Buffer.from("<html>nada a ver</html>")), null);
});

test("login e criação de cliente pelo painel", async () => {
  assert.equal((await admin.entrar("vga@teste.com", "errada")).status, 401);
  assert.equal((await admin.entrar("vga@teste.com", "senha-forte-1")).status, 200);
  const r = await admin.req("/api/admin/clientes", {
    metodo: "POST",
    corpo: { nome: "Ponte Velha", email: "pv@teste.com", senha: "cliente-123", negocio: "Restaurante Ponte Velha", cidade: "Morretes" },
  });
  assert.equal(r.status, 201);
  assert.equal((await admin.req("/api/admin/clientes", { metodo: "POST", corpo: { nome: "X", email: "pv@teste.com", senha: "12345678" } })).status, 409);
  assert.equal((await cliente.entrar("pv@teste.com", "cliente-123")).status, 200);
  assert.equal((await cliente.req("/api/admin/clientes")).status, 403);
});

test("cliente escolhe o nicho e vê a semana personalizada", async () => {
  assert.equal((await cliente.req("/api/semana")).status, 409);
  assert.equal((await cliente.req("/api/eu/nicho", { metodo: "PUT", corpo: { nicho: "inexistente" } })).status, 400);
  assert.equal((await cliente.req("/api/eu/nicho", { metodo: "PUT", corpo: { nicho: "gastronomia" } })).status, 200);
  const { status, dados } = await cliente.req("/api/semana");
  assert.equal(status, 200);
  assert.equal(dados.nicho.id, "gastronomia");
  assert.equal(dados.semana, semanaAtual());
  assert.ok(dados.itens.length >= 10);
  const texto = JSON.stringify(dados);
  assert.ok(!texto.includes("{negocio}") && !texto.includes("{cidade}"));
  assert.ok(texto.includes("Restaurante Ponte Velha"));
  const total = Object.values(dados.pendencias).reduce((a, b) => a + b, 0);
  assert.equal(total, dados.itens.length);
  // Só até a próxima semana.
  assert.equal((await cliente.req(`/api/semana?semana=${somarDias(semanaAtual(), 14)}`)).status, 404);
});

test("envio de arquivos, análise automática e aprovação", async () => {
  const s = semanaAtual();
  const ruim = await cliente.req(`/api/arquivos?semana=${s}`, { metodo: "POST", bruto: Buffer.from("isto não é imagem nem vídeo") });
  assert.equal(ruim.status, 400);
  const grande = await cliente.req(`/api/arquivos?semana=${s}`, { metodo: "POST", bruto: Buffer.concat([JPEG, Buffer.alloc(1.5 * 1048576)]) });
  assert.equal(grande.status, 413);

  const foto = await cliente.req(`/api/arquivos?semana=${s}&nome=prato.jpg&largura=1080&altura=1350`, { metodo: "POST", bruto: JPEG, tipo: "image/jpeg" });
  assert.equal(foto.status, 201);
  assert.equal(foto.dados.arquivo.tipo, "foto");
  const video = await cliente.req(`/api/arquivos?semana=${s}&nome=reel.mp4&largura=1080&altura=1920&duracao=12`, { metodo: "POST", bruto: MP4, tipo: "video/mp4" });
  assert.equal(video.status, 201);
  assert.equal(video.dados.arquivo.tipo, "video");
  const mini = await cliente.req(`/api/arquivos/${foto.dados.arquivo.id}/miniatura`, { metodo: "POST", bruto: JPEG, tipo: "image/jpeg" });
  assert.equal(mini.status, 200);

  // Outro cliente não vê o arquivo.
  const outro = new Sessao();
  await admin.req("/api/admin/clientes", { metodo: "POST", corpo: { nome: "Outro", email: "outro@teste.com", senha: "outro-1234", nicho: "turismo" } });
  await outro.entrar("outro@teste.com", "outro-1234");
  assert.equal((await outro.req(`/api/arquivos/${foto.dados.arquivo.id}`)).status, 404);
  // A equipe VGA vê.
  assert.equal((await admin.req(`/api/arquivos/${foto.dados.arquivo.id}`)).status, 200);

  const a = await cliente.req("/api/analisar", { metodo: "POST", corpo: { semana: s } });
  assert.equal(a.status, 200);
  assert.equal(a.dados.origem, "modelo");
  assert.equal(a.dados.escolhas, 2);
  const comArquivo = a.dados.semana.itens.filter((i) => i.arquivo);
  assert.equal(comArquivo.length, 2);
  const reel = comArquivo.find((i) => i.formato === "reels");
  assert.equal(reel.arquivo.id, video.dados.arquivo.id, "vídeo vai para o Reel");
  assert.equal(reel.status, "para_aprovar");

  // Edita legenda e horário, depois aprova.
  assert.equal((await cliente.req("/api/itens", { metodo: "PUT", corpo: { semana: s, item_id: reel.id, horario: "25:00" } })).status, 400);
  assert.equal((await cliente.req("/api/itens", { metodo: "PUT", corpo: { semana: s, item_id: reel.id, legenda: "Minha legenda", horario: "18:30" } })).status, 200);
  assert.equal((await cliente.req("/api/itens/aprovar", { metodo: "POST", corpo: { semana: s, item_id: reel.id } })).status, 200);
  let sem = (await cliente.req("/api/semana")).dados;
  let item = sem.itens.find((i) => i.id === reel.id);
  assert.equal(item.status, "aprovado");
  assert.equal(item.legendaFinal, "Minha legenda");
  assert.equal(item.horarioFinal, "18:30");
  assert.equal(sem.pendencias.aprovado, 1);
  assert.equal((await cliente.req("/api/itens", { metodo: "PUT", corpo: { semana: s, item_id: reel.id, legenda: "x" } })).status, 409);
  assert.equal((await cliente.req(`/api/arquivos/${video.dados.arquivo.id}`, { metodo: "DELETE" })).status, 409);

  // Fila da VGA mostra o que foi aprovado.
  const fila = (await admin.req("/api/admin/fila")).dados.itens;
  assert.equal(fila.length, 1);
  assert.equal(fila[0].legenda, "Minha legenda");
  assert.equal(fila[0].horario, "18:30");
  assert.equal(fila[0].arquivo.id, video.dados.arquivo.id);

  // Pedido de ajuste precisa de comentário.
  const outra = sem.itens.find((i) => i.status !== "aprovado");
  assert.equal((await cliente.req("/api/itens/ajuste", { metodo: "POST", corpo: { semana: s, item_id: outra.id, comentario: "" } })).status, 400);
  assert.equal((await cliente.req("/api/itens/ajuste", { metodo: "POST", corpo: { semana: s, item_id: outra.id, comentario: "Trocar a foto" } })).status, 200);
  sem = (await cliente.req("/api/semana")).dados;
  assert.equal(sem.itens.find((i) => i.id === outra.id).status, "ajuste");

  // Desfazer aprovação.
  assert.equal((await cliente.req("/api/itens/desfazer", { metodo: "POST", corpo: { semana: s, item_id: reel.id } })).status, 200);
  sem = (await cliente.req("/api/semana")).dados;
  item = sem.itens.find((i) => i.id === reel.id);
  assert.equal(item.status, "para_aprovar");
  // Aprova de novo para o teste de geração.
  await cliente.req("/api/itens/aprovar", { metodo: "POST", corpo: { semana: s, item_id: reel.id } });
});

test("atualização semanal pela IA respeita o que já foi aprovado", async () => {
  const s = semanaAtual();
  // Cliente já trabalhou na semana: sem "forçar", recusa.
  const r1 = await admin.req("/api/admin/estrategias/gerar", { metodo: "POST", corpo: { nicho: "gastronomia", semana: "atual" } });
  assert.equal(r1.status, 409);
  // Próxima semana: pode gerar.
  const r2 = await admin.req("/api/admin/estrategias/gerar", { metodo: "POST", corpo: { nicho: "gastronomia", semana: "proxima" } });
  assert.equal(r2.status, 202);
  // Forçando a semana atual.
  const r3 = await admin.req("/api/admin/estrategias/gerar", { metodo: "POST", corpo: { nicho: "gastronomia", semana: "atual", forcar: true } });
  assert.equal(r3.status, 202);
  await new Promise((ok) => setTimeout(ok, 100));

  const est = (await admin.req("/api/admin/estrategias")).dados;
  const g = est.nichos.find((n) => n.id === "gastronomia");
  assert.equal(g.atual.origem, "ia");
  assert.equal(g.proxima.origem, "ia");

  const sem = (await cliente.req("/api/semana")).dados;
  assert.equal(sem.estrategia.origem, "ia");
  assert.equal(sem.estrategia.fontes.length, 1);
  assert.ok(sem.itens.some((i) => i.titulo === "Reel IA" && i.legendaFinal === "Legenda IA no Restaurante Ponte Velha"));
  // A pauta aprovada da versão anterior continua lá; o pedido de ajuste (não aprovado) saiu.
  const antiga = sem.itens.find((i) => i.versaoAnterior);
  assert.ok(antiga && antiga.status === "aprovado");
  assert.equal(sem.pendencias.ajuste, 0);
  assert.equal((await cliente.req(`/api/semana?semana=${somarDias(s, 7)}`)).dados.estrategia.tema.startsWith("Semana gerada"), true);
});

test("calendário marca as datas do nicho", async () => {
  const { dados } = await cliente.req("/api/calendario");
  assert.ok(dados.datas.length > 10);
  const bf = dados.datas.find((d) => d.nome === "Black Friday");
  assert.ok(bf.doMeuNicho);
  assert.equal(bf.divulgarDesde, somarDias(bf.inicio, -21));
  assert.ok(dados.datas.some((d) => !d.doMeuNicho));
});

test("análise sem IA prefere vídeo vertical para Reels", () => {
  const r = analisarMaterialModelo({
    itens: [{ id: "r", formato: "reels", precisaMaterial: true, legenda: "L", horario: "19:00" }],
    arquivos: [
      { id: "h", tipo: "video", largura: 1920, altura: 1080, duracao: 10 },
      { id: "v", tipo: "video", largura: 720, altura: 1280, duracao: 10 },
    ],
  });
  assert.equal(r.escolhas[0].arquivo_id, "v");
});

test("troca de senha e desativação de acesso", async () => {
  assert.equal((await cliente.req("/api/eu/senha", { metodo: "PUT", corpo: { atual: "errada", nova: "nova-senha-1" } })).status, 400);
  assert.equal((await cliente.req("/api/eu/senha", { metodo: "PUT", corpo: { atual: "cliente-123", nova: "nova-senha-1" } })).status, 200);
  const lista = (await admin.req("/api/admin/clientes")).dados.clientes;
  const pv = lista.find((c) => c.email === "pv@teste.com");
  assert.equal((await admin.req(`/api/admin/clientes/${pv.id}`, { metodo: "PUT", corpo: { ativo: false } })).status, 200);
  assert.equal((await cliente.req("/api/semana")).status, 401);
  assert.equal((await new Sessao().entrar("pv@teste.com", "nova-senha-1")).status, 403);
});
