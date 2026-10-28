// VGA • Área do Cliente — servidor (Express + SQLite).
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirBanco } from "./src/db.js";
import {
  gerarHash, conferirSenha, criarSessao, encerrarSessao, encerrarSessoesDoUsuario, definirCookie, limparCookie,
  exigirLogin, exigirAdmin, criarLimitador, lerCookie,
} from "./src/auth.js";
import { NICHOS, buscarNicho, resumoNichos, REGRAS_GERAIS } from "./conteudo/nichos.js";
import { CALENDARIO, DIAS_ANTECEDENCIA, datasNoPeriodo, valeParaNicho } from "./conteudo/calendario.js";
import { semanaAtual, segundaDaSemana, somarDias, dataValida, horarioValido, hojeSP } from "./src/datas.js";
import { obterEstrategia, lerEstrategia, personalizar } from "./src/estrategia.js";
import { iaDisponivel, analisarMaterialIA, analisarMaterialModelo } from "./src/ia.js";
import { criarGerador, ErroGeracao } from "./src/gerador.js";
import { receberArquivo, ErroEnvio, MIME } from "./src/arquivos.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));

const MB = 1048576;
const MAX_ARQUIVOS_SEMANA = 60;
const MAX_ARQUIVOS_ANALISE = 20;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(v, max = 2000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function criarApp({
  pastaDados = path.join(aqui, "data"),
  analisador = null,
  gerador: opcoesGerador = {},
  maxFotoMB = Number(process.env.MAX_FOTO_MB) || 25,
  maxVideoMB = Number(process.env.MAX_VIDEO_MB) || 300,
} = {}) {
  const db = abrirBanco(pastaDados);
  const pastaArquivos = path.join(pastaDados, "arquivos");
  fs.mkdirSync(pastaArquivos, { recursive: true });
  const gerador = criarGerador(db, opcoesGerador);
  const analisar = analisador || ((dados) => (iaDisponivel() ? analisarMaterialIA(dados) : analisarMaterialModelo(dados)));

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });

  const login = exigirLogin(db);
  const limiteLogin = criarLimitador({ maximo: 10, janelaMs: 15 * 60e3 });
  const limiteEnvio = criarLimitador({ maximo: 120, janelaMs: 60 * 60e3 });
  const limiteAnalise = criarLimitador({ maximo: 20, janelaMs: 60 * 60e3 });
  const json = express.json({ limit: "200kb" });

  app.get("/api/saude", (req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ ok: true });
  });

  // ---------- Conta ----------
  app.post("/api/entrar", json, (req, res) => {
    const email = texto(req.body?.email, 200).toLowerCase();
    const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
    if (!limiteLogin(`${req.ip}|${email}`)) return res.status(429).json({ erro: "Muitas tentativas. Aguarde alguns minutos." });
    const u = db.prepare("SELECT id, senha_hash, ativo FROM usuarios WHERE email = ?").get(email);
    if (!u || !conferirSenha(senha, u.senha_hash)) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    if (!u.ativo) return res.status(403).json({ erro: "Acesso desativado. Fale com a VGA." });
    definirCookie(res, criarSessao(db, u.id), req.secure);
    res.json({ ok: true });
  });

  app.post("/api/sair", (req, res) => {
    encerrarSessao(db, lerCookie(req));
    limparCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/eu", login, (req, res) => {
    res.json({ usuario: req.usuario, nichos: resumoNichos(), ia: iaDisponivel(), hoje: hojeSP(), semanaAtual: semanaAtual() });
  });

  app.put("/api/eu/nicho", login, json, (req, res) => {
    const nicho = texto(req.body?.nicho, 40);
    if (!buscarNicho(nicho)) return res.status(400).json({ erro: "Escolha um dos 10 nichos." });
    db.prepare("UPDATE usuarios SET nicho = ? WHERE id = ?").run(nicho, req.usuario.id);
    res.json({ ok: true, nicho });
  });

  app.put("/api/eu/senha", login, json, (req, res) => {
    const atual = typeof req.body?.atual === "string" ? req.body.atual : "";
    const nova = typeof req.body?.nova === "string" ? req.body.nova : "";
    const u = db.prepare("SELECT senha_hash FROM usuarios WHERE id = ?").get(req.usuario.id);
    if (!conferirSenha(atual, u.senha_hash)) return res.status(400).json({ erro: "A senha atual não confere." });
    if (nova.length < 8) return res.status(400).json({ erro: "A nova senha precisa ter pelo menos 8 caracteres." });
    db.prepare("UPDATE usuarios SET senha_hash = ? WHERE id = ?").run(gerarHash(nova), req.usuario.id);
    encerrarSessoesDoUsuario(db, req.usuario.id, req.tokenSessao);
    res.json({ ok: true });
  });

  // ---------- Semana ----------
  const arquivoPublico = (a) =>
    a && {
      id: a.id, tipo: a.tipo, nome: a.nome, largura: a.largura, altura: a.altura, duracao: a.duracao, tamanho: a.tamanho,
      url: `/api/arquivos/${a.id}`,
      miniatura: a.tem_miniatura ? `/api/arquivos/${a.id}/miniatura` : null,
      analise: a.analise ? JSON.parse(a.analise) : null,
      criado_em: a.criado_em,
    };

  function semanaPedida(req) {
    const s = req.query.semana ?? req.body?.semana;
    if (!s) return semanaAtual();
    return dataValida(s) ? segundaDaSemana(s) : null;
  }

  function statusDoItem(item, e) {
    if (e?.status === "aprovado") return "aprovado";
    if (e?.status === "ajuste") return "ajuste";
    if (item.precisaMaterial && !e?.arquivo_id) return "falta_material";
    return "para_aprovar";
  }

  // Estratégia da semana já personalizada para o cliente, com a situação de cada pauta.
  function montarSemana(usuario, semana, { criar = true } = {}) {
    const nicho = buscarNicho(usuario.nicho);
    if (!nicho) return { erro: 409, mensagem: "Escolha o seu nicho primeiro." };
    const atual = semanaAtual();
    if (semana > somarDias(atual, 7)) return { erro: 404, mensagem: "Essa semana ainda não foi preparada." };
    const est = obterEstrategia(db, nicho.id, semana, { criar: criar && semana >= atual });
    if (!est) return { erro: 404, mensagem: "Não há estratégia guardada para essa semana." };

    const estados = new Map(
      db.prepare("SELECT * FROM itens_estado WHERE usuario_id = ? AND semana = ?").all(usuario.id, semana).map((e) => [e.item_id, e]),
    );
    const arquivos = db.prepare("SELECT * FROM arquivos WHERE usuario_id = ? AND semana = ? ORDER BY criado_em DESC").all(usuario.id, semana);
    const arqPorId = new Map(arquivos.map((a) => [a.id, a]));

    const juntar = (item, e, extra = {}) => ({
      ...item,
      ...extra,
      status: statusDoItem(item, e),
      legendaFinal: e?.legenda ?? item.legenda,
      horarioFinal: e?.horario ?? item.horario,
      comentario: e?.comentario || "",
      motivoIa: e?.motivo_ia || "",
      aprovadoEm: e?.aprovado_em || null,
      arquivo: arquivoPublico(arqPorId.get(e?.arquivo_id)),
    });

    const itensEst = personalizar(est.itens, usuario);
    const ids = new Set(itensEst.map((i) => i.id));
    const itens = itensEst.map((i) => juntar(i, estados.get(i.id)));
    // Pautas aprovadas de uma versão anterior da estratégia continuam aparecendo.
    for (const e of estados.values()) {
      if (!ids.has(e.item_id) && e.status === "aprovado" && e.snapshot) {
        itens.push(juntar(JSON.parse(e.snapshot), e, { versaoAnterior: true }));
      }
    }

    const pendencias = { falta_material: 0, para_aprovar: 0, ajuste: 0, aprovado: 0 };
    for (const i of itens) pendencias[i.status] += 1;

    const fimJanela = somarDias(semana, 34);
    const datas = datasNoPeriodo(semana, fimJanela, nicho.id).map((d) => ({
      ...d,
      nestaSemana: d.inicio <= somarDias(semana, 6) && (d.fim || d.inicio) >= semana,
    }));

    const temSemana = (s) => Boolean(lerEstrategia(db, nicho.id, s));
    const anterior = somarDias(semana, -7);
    const proxima = somarDias(semana, 7);
    return {
      semana,
      fim: somarDias(semana, 6),
      semanaAtual: atual,
      anterior: temSemana(anterior) ? anterior : null,
      // Dá para ver até a próxima semana (ela é preparada a partir de sexta).
      proxima: proxima <= somarDias(atual, 7) ? proxima : null,
      nicho: personalizar(nicho, usuario),
      estrategia: { tema: est.tema, foco: est.foco, tendencias: personalizar(est.tendencias, usuario), fontes: est.fontes || [], origem: est.origem, gerado_em: est.gerado_em },
      itens,
      pendencias,
      datas,
      arquivos: arquivos.map(arquivoPublico),
      regras: REGRAS_GERAIS,
      ia: iaDisponivel(),
    };
  }

  app.get("/api/nichos", login, (req, res) => res.json({ nichos: resumoNichos() }));

  app.get("/api/semana", login, (req, res) => {
    const semana = semanaPedida(req);
    if (!semana) return res.status(400).json({ erro: "Semana inválida." });
    const r = montarSemana(req.usuario, semana);
    if (r.erro) return res.status(r.erro).json({ erro: r.mensagem });
    res.json(r);
  });

  // ---------- Pautas: aprovar, pedir ajuste, editar ----------
  function pautaDoCliente(req) {
    const semana = semanaPedida(req);
    const itemId = texto(req.body?.item_id, 60);
    if (!semana || !itemId) return { erro: [400, "Pauta inválida."] };
    const s = montarSemana(req.usuario, semana, { criar: false });
    if (s.erro) return { erro: [s.erro, s.mensagem] };
    const item = s.itens.find((i) => i.id === itemId);
    if (!item) return { erro: [404, "Pauta não encontrada."] };
    return { semana, item };
  }

  const buscarEstado = db.prepare("SELECT * FROM itens_estado WHERE usuario_id = ? AND semana = ? AND item_id = ?");
  function salvarEstado(usuarioId, semana, itemId, campos) {
    const atual = buscarEstado.get(usuarioId, semana, itemId) || {};
    const v = { status: null, arquivo_id: null, legenda: null, horario: null, comentario: null, motivo_ia: null, snapshot: null, aprovado_em: null, ...atual, ...campos };
    db.prepare(`
      INSERT INTO itens_estado (usuario_id, semana, item_id, status, arquivo_id, legenda, horario, comentario, motivo_ia, snapshot, aprovado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(usuario_id, semana, item_id) DO UPDATE SET
        status = excluded.status, arquivo_id = excluded.arquivo_id, legenda = excluded.legenda, horario = excluded.horario,
        comentario = excluded.comentario, motivo_ia = excluded.motivo_ia, snapshot = excluded.snapshot,
        aprovado_em = excluded.aprovado_em, atualizado_em = excluded.atualizado_em
    `).run(usuarioId, semana, itemId, v.status, v.arquivo_id, v.legenda, v.horario, v.comentario, v.motivo_ia, v.snapshot, v.aprovado_em);
  }

  function lerLegendaHorario(body, item) {
    const legenda = body?.legenda !== undefined ? texto(body.legenda, 2200) : undefined;
    const horario = body?.horario !== undefined ? (horarioValido(body.horario) ? body.horario : null) : undefined;
    if (horario === null) return { erro: "Horário inválido. Use HH:MM." };
    return {
      ...(legenda !== undefined && { legenda: legenda === item.legenda ? null : legenda }),
      ...(horario !== undefined && { horario: horario === item.horario ? null : horario }),
    };
  }

  app.put("/api/itens", login, json, (req, res) => {
    const p = pautaDoCliente(req);
    if (p.erro) return res.status(p.erro[0]).json({ erro: p.erro[1] });
    if (p.item.status === "aprovado") return res.status(409).json({ erro: "Essa pauta já foi aprovada. Desfaça a aprovação para editar." });
    const campos = lerLegendaHorario(req.body, p.item);
    if (campos.erro) return res.status(400).json({ erro: campos.erro });
    salvarEstado(req.usuario.id, p.semana, p.item.id, campos);
    res.json({ ok: true });
  });

  app.post("/api/itens/aprovar", login, json, (req, res) => {
    const p = pautaDoCliente(req);
    if (p.erro) return res.status(p.erro[0]).json({ erro: p.erro[1] });
    if (p.item.status === "aprovado") return res.json({ ok: true });
    const campos = lerLegendaHorario(req.body, p.item);
    if (campos.erro) return res.status(400).json({ erro: campos.erro });
    const legendaFinal = campos.legenda !== undefined ? campos.legenda ?? p.item.legenda : p.item.legendaFinal;
    const horarioFinal = campos.horario !== undefined ? campos.horario ?? p.item.horario : p.item.horarioFinal;
    // Guarda uma cópia exata do que foi aprovado (é isso que a VGA agenda).
    const { status, legendaFinal: _l, horarioFinal: _h, comentario, motivoIa, aprovadoEm, arquivo, versaoAnterior, ...conteudo } = p.item;
    const snapshot = JSON.stringify({ ...conteudo, legendaFinal, horarioFinal, arquivo_id: arquivo?.id || null });
    salvarEstado(req.usuario.id, p.semana, p.item.id, { ...campos, status: "aprovado", comentario: null, snapshot, aprovado_em: new Date().toISOString() });
    res.json({ ok: true });
  });

  app.post("/api/itens/ajuste", login, json, (req, res) => {
    const p = pautaDoCliente(req);
    if (p.erro) return res.status(p.erro[0]).json({ erro: p.erro[1] });
    const comentario = texto(req.body?.comentario, 1000);
    if (!comentario) return res.status(400).json({ erro: "Conte o que você quer mudar." });
    if (p.item.status === "aprovado") return res.status(409).json({ erro: "Essa pauta já foi aprovada. Desfaça a aprovação antes." });
    salvarEstado(req.usuario.id, p.semana, p.item.id, { status: "ajuste", comentario });
    res.json({ ok: true });
  });

  app.post("/api/itens/desfazer", login, json, (req, res) => {
    const p = pautaDoCliente(req);
    if (p.erro) return res.status(p.erro[0]).json({ erro: p.erro[1] });
    if (p.item.versaoAnterior) return res.status(409).json({ erro: "Essa pauta é de uma versão anterior da estratégia e não pode ser reaberta." });
    salvarEstado(req.usuario.id, p.semana, p.item.id, { status: null, comentario: null, snapshot: null, aprovado_em: null });
    res.json({ ok: true });
  });

  app.put("/api/itens/arquivo", login, json, (req, res) => {
    const p = pautaDoCliente(req);
    if (p.erro) return res.status(p.erro[0]).json({ erro: p.erro[1] });
    if (p.item.status === "aprovado") return res.status(409).json({ erro: "Essa pauta já foi aprovada." });
    const arquivoId = req.body?.arquivo_id ? texto(req.body.arquivo_id, 60) : null;
    if (arquivoId && !db.prepare("SELECT 1 FROM arquivos WHERE id = ? AND usuario_id = ?").get(arquivoId, req.usuario.id)) {
      return res.status(404).json({ erro: "Arquivo não encontrado." });
    }
    salvarEstado(req.usuario.id, p.semana, p.item.id, { arquivo_id: arquivoId, motivo_ia: null });
    res.json({ ok: true });
  });

  // ---------- Fotos e vídeos ----------
  const pastaDoUsuario = (id) => {
    const p = path.join(pastaArquivos, String(id));
    fs.mkdirSync(p, { recursive: true });
    return p;
  };
  const caminhoArquivo = (a) => path.join(pastaArquivos, String(a.usuario_id), `${a.id}.${a.ext}`);
  const caminhoMiniatura = (a) => path.join(pastaArquivos, String(a.usuario_id), `${a.id}.mini.jpg`);
  const numero = (v, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= max ? n : null;
  };

  app.post("/api/arquivos", login, async (req, res) => {
    const semana = semanaPedida(req);
    if (!semana) return res.status(400).json({ erro: "Semana inválida." });
    if (!limiteEnvio(req.usuario.id)) return res.status(429).json({ erro: "Muitos envios em pouco tempo. Aguarde um pouco." });
    const total = db.prepare("SELECT COUNT(*) AS n FROM arquivos WHERE usuario_id = ? AND semana = ?").get(req.usuario.id, semana).n;
    if (total >= MAX_ARQUIVOS_SEMANA) return res.status(400).json({ erro: `Máximo de ${MAX_ARQUIVOS_SEMANA} arquivos por semana.` });

    const id = crypto.randomUUID();
    const temporario = path.join(pastaDoUsuario(req.usuario.id), `${id}.envio`);
    try {
      const r = await receberArquivo(req, temporario, { maxFoto: maxFotoMB * MB, maxVideo: maxVideoMB * MB });
      const linha = {
        id, usuario_id: req.usuario.id, semana, nome: texto(req.query.nome, 160) || `${r.tipo}.${r.ext}`, tipo: r.tipo, ext: r.ext, tamanho: r.tamanho,
        largura: numero(req.query.largura, 20000), altura: numero(req.query.altura, 20000), duracao: numero(req.query.duracao, 36000),
      };
      fs.renameSync(temporario, caminhoArquivo(linha));
      db.prepare(`
        INSERT INTO arquivos (id, usuario_id, semana, nome, tipo, ext, tamanho, largura, altura, duracao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, linha.usuario_id, semana, linha.nome, linha.tipo, linha.ext, linha.tamanho, linha.largura, linha.altura, linha.duracao);

      // Enviado direto num cartão: já fica ligado à pauta.
      const itemId = texto(req.query.item, 60);
      if (itemId) {
        const s = montarSemana(req.usuario, semana, { criar: false });
        const item = !s.erro && s.itens.find((i) => i.id === itemId);
        if (item && item.status !== "aprovado") salvarEstado(req.usuario.id, semana, itemId, { arquivo_id: id, motivo_ia: null });
      }
      res.status(201).json({ arquivo: arquivoPublico(db.prepare("SELECT * FROM arquivos WHERE id = ?").get(id)) });
    } catch (e) {
      fs.rm(temporario, { force: true }, () => {});
      if (e instanceof ErroEnvio) return res.status(e.status).json({ erro: e.message });
      console.error("Erro no envio:", e);
      res.status(500).json({ erro: "Não foi possível salvar o arquivo." });
    }
  });

  const buscarArquivoDono = db.prepare("SELECT * FROM arquivos WHERE id = ? AND usuario_id = ?");
  const buscarArquivo = db.prepare("SELECT * FROM arquivos WHERE id = ?");
  const arquivoVisivel = (req) =>
    req.usuario.papel === "admin" ? buscarArquivo.get(String(req.params.id)) : buscarArquivoDono.get(String(req.params.id), req.usuario.id);

  // Prévia leve (JPEG gerado no celular): é o que a IA olha e o que aparece nos cartões.
  app.post("/api/arquivos/:id/miniatura", login, express.raw({ type: "image/jpeg", limit: 2 * MB }), (req, res) => {
    const a = buscarArquivoDono.get(String(req.params.id), req.usuario.id);
    if (!a) return res.status(404).json({ erro: "Arquivo não encontrado." });
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf || buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) return res.status(400).json({ erro: "Prévia inválida." });
    fs.writeFileSync(caminhoMiniatura(a), buf);
    db.prepare("UPDATE arquivos SET tem_miniatura = 1 WHERE id = ?").run(a.id);
    res.json({ ok: true });
  });

  app.get("/api/arquivos/:id", login, (req, res) => {
    const a = arquivoVisivel(req);
    if (!a) return res.status(404).end();
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.type(MIME[a.ext] || "application/octet-stream");
    if (req.query.baixar) res.attachment(a.nome);
    res.sendFile(caminhoArquivo(a));
  });

  app.get("/api/arquivos/:id/miniatura", login, (req, res) => {
    const a = arquivoVisivel(req);
    if (!a || !a.tem_miniatura) return res.status(404).end();
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.type("image/jpeg");
    res.sendFile(caminhoMiniatura(a));
  });

  app.delete("/api/arquivos/:id", login, (req, res) => {
    const a = buscarArquivoDono.get(String(req.params.id), req.usuario.id);
    if (!a) return res.status(404).json({ erro: "Arquivo não encontrado." });
    const emAprovada = db.prepare("SELECT 1 FROM itens_estado WHERE arquivo_id = ? AND status = 'aprovado'").get(a.id);
    if (emAprovada) return res.status(409).json({ erro: "Esse arquivo está numa pauta aprovada. Desfaça a aprovação antes de apagar." });
    db.prepare("DELETE FROM arquivos WHERE id = ?").run(a.id);
    fs.rm(caminhoArquivo(a), { force: true }, () => {});
    fs.rm(caminhoMiniatura(a), { force: true }, () => {});
    res.json({ ok: true });
  });

  // ---------- Análise por IA: escolhe arquivos, legendas e horários ----------
  app.post("/api/analisar", login, json, async (req, res) => {
    const semana = semanaPedida(req);
    if (!semana) return res.status(400).json({ erro: "Semana inválida." });
    if (!limiteAnalise(req.usuario.id)) return res.status(429).json({ erro: "Limite de análises por hora atingido. Tente mais tarde." });
    const s = montarSemana(req.usuario, semana, { criar: false });
    if (s.erro) return res.status(s.erro).json({ erro: s.mensagem });

    const linhas = db
      .prepare("SELECT * FROM arquivos WHERE usuario_id = ? AND semana = ? ORDER BY criado_em DESC LIMIT ?")
      .all(req.usuario.id, semana, MAX_ARQUIVOS_ANALISE);
    if (!linhas.length) return res.status(400).json({ erro: "Envie fotos ou vídeos antes de pedir a análise." });
    const usadosAprovados = new Set(s.itens.filter((i) => i.status === "aprovado" && i.arquivo).map((i) => i.arquivo.id));
    const arquivos = linhas
      .filter((a) => !usadosAprovados.has(a.id))
      .map((a) => ({
        id: a.id, tipo: a.tipo, nome: a.nome, largura: a.largura, altura: a.altura, duracao: a.duracao,
        miniatura: a.tem_miniatura ? fs.readFileSync(caminhoMiniatura(a)).toString("base64") : null,
      }));
    const itens = s.itens
      .filter((i) => i.status !== "aprovado" && !i.versaoAnterior)
      .map((i) => ({ ...i, arquivo_id: i.arquivo?.id || null }));
    if (!arquivos.length || !itens.length) return res.status(400).json({ erro: "Não há pautas ou arquivos livres para analisar." });

    let r;
    try {
      r = await analisar({ nicho: s.nicho, itens, arquivos });
    } catch (e) {
      console.error("Erro na análise:", e?.status || "", e?.message || e);
      return res.status(502).json({ erro: "Não foi possível analisar agora. Tente de novo em instantes." });
    }

    const porItem = new Map(itens.map((i) => [i.id, i]));
    db.exec("BEGIN");
    try {
      for (const a of r.arquivos) {
        db.prepare("UPDATE arquivos SET analise = ? WHERE id = ? AND usuario_id = ?")
          .run(JSON.stringify({ descricao: a.descricao, nota: a.nota, observacao: a.observacao }), a.id, req.usuario.id);
      }
      for (const e of r.escolhas) {
        const item = porItem.get(e.item_id);
        if (!item) continue;
        salvarEstado(req.usuario.id, semana, item.id, {
          arquivo_id: e.arquivo_id,
          legenda: item.formato === "stories" || !e.legenda || e.legenda === item.legenda ? null : texto(e.legenda, 2200),
          horario: e.horario && e.horario !== item.horario ? e.horario : null,
          motivo_ia: texto(e.motivo, 400),
          ...(item.status === "ajuste" ? {} : { status: null }),
        });
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ resumo: r.resumo, origem: r.origem, escolhas: r.escolhas.length, semana: montarSemana(req.usuario, semana, { criar: false }) });
  });

  // ---------- Calendário ----------
  app.get("/api/calendario", login, (req, res) => {
    const hoje = hojeSP();
    const nicho = req.usuario.nicho;
    const datas = CALENDARIO.filter((d) => (d.fim || d.inicio) >= hoje).map((d) => ({
      ...d,
      doMeuNicho: nicho ? valeParaNicho(d, nicho) : false,
      divulgarDesde: d.tipo === "Comercial" || d.tipo === "Feriado" ? somarDias(d.inicio, -DIAS_ANTECEDENCIA) : null,
    }));
    res.json({ hoje, nicho, datas, nichos: resumoNichos() });
  });

  // ---------- Painel VGA ----------
  const admin = [login, exigirAdmin];

  app.get("/api/admin/clientes", admin, (req, res) => {
    const semana = semanaAtual();
    const clientes = db.prepare(`
      SELECT u.id, u.nome, u.email, u.papel, u.nicho, u.negocio, u.cidade, u.ativo, u.criado_em,
        (SELECT COUNT(*) FROM itens_estado e WHERE e.usuario_id = u.id AND e.semana = ? AND e.status = 'aprovado') AS aprovados,
        (SELECT COUNT(*) FROM itens_estado e WHERE e.usuario_id = u.id AND e.semana = ? AND e.status = 'ajuste') AS ajustes,
        (SELECT COUNT(*) FROM arquivos a WHERE a.usuario_id = u.id AND a.semana = ?) AS arquivos
      FROM usuarios u ORDER BY u.papel DESC, u.nome COLLATE NOCASE
    `).all(semana, semana, semana);
    res.json({ clientes, semana });
  });

  function dadosCliente(b, parcial = false) {
    const v = {};
    if (!parcial || b.nome !== undefined) v.nome = texto(b.nome, 120);
    if (!parcial || b.negocio !== undefined) v.negocio = texto(b.negocio, 120);
    if (!parcial || b.cidade !== undefined) v.cidade = texto(b.cidade, 80);
    if (!parcial || b.nicho !== undefined) v.nicho = b.nicho ? texto(b.nicho, 40) : null;
    if (!parcial || b.papel !== undefined) v.papel = b.papel === "admin" ? "admin" : "cliente";
    if (b.ativo !== undefined) v.ativo = b.ativo ? 1 : 0;
    if (v.nome === "") return { erro: "Informe o nome." };
    if (v.nicho && !buscarNicho(v.nicho)) return { erro: "Nicho inválido." };
    return { v };
  }

  app.post("/api/admin/clientes", admin, json, (req, res) => {
    const b = req.body || {};
    const email = texto(b.email, 200).toLowerCase();
    const senha = typeof b.senha === "string" ? b.senha : "";
    const { v, erro } = dadosCliente(b);
    if (erro) return res.status(400).json({ erro });
    if (!EMAIL_OK.test(email)) return res.status(400).json({ erro: "E-mail inválido." });
    if (senha.length < 8) return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
    if (db.prepare("SELECT 1 FROM usuarios WHERE email = ?").get(email)) return res.status(409).json({ erro: "Já existe um acesso com esse e-mail." });
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO usuarios (nome, email, senha_hash, papel, nicho, negocio, cidade) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(v.nome, email, gerarHash(senha), v.papel, v.nicho, v.negocio, v.cidade);
    res.status(201).json({ id: Number(lastInsertRowid) });
  });

  app.put("/api/admin/clientes/:id", admin, json, (req, res) => {
    const id = Number(req.params.id);
    const u = db.prepare("SELECT id FROM usuarios WHERE id = ?").get(id);
    if (!u) return res.status(404).json({ erro: "Cliente não encontrado." });
    const { v, erro } = dadosCliente(req.body || {}, true);
    if (erro) return res.status(400).json({ erro });
    if (id === req.usuario.id && (v.ativo === 0 || v.papel === "cliente")) return res.status(400).json({ erro: "Você não pode tirar o seu próprio acesso." });
    const campos = Object.keys(v);
    if (campos.length) db.prepare(`UPDATE usuarios SET ${campos.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...campos.map((c) => v[c]), id);
    const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
    if (senha) {
      if (senha.length < 8) return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
      db.prepare("UPDATE usuarios SET senha_hash = ? WHERE id = ?").run(gerarHash(senha), id);
      encerrarSessoesDoUsuario(db, id);
    }
    if (v.ativo === 0) encerrarSessoesDoUsuario(db, id);
    res.json({ ok: true });
  });

  app.get("/api/admin/estrategias", admin, (req, res) => {
    const atual = semanaAtual();
    const proxima = somarDias(atual, 7);
    const resumo = (n, s) => {
      const e = lerEstrategia(db, n, s);
      return e ? { origem: e.origem, gerado_em: e.gerado_em, tema: e.tema, pautas: e.itens.length } : null;
    };
    const rodando = new Set(gerador.emAndamentoAgora().map(([n, s]) => `${n}|${s}`));
    const ultima = db.prepare("SELECT status, mensagem, semana, iniciado_em, terminado_em FROM geracoes WHERE nicho = ? ORDER BY id DESC LIMIT 1");
    res.json({
      atual, proxima, ia: iaDisponivel(),
      nichos: NICHOS.map((n) => ({
        id: n.id, nome: n.nome, icone: n.icone, cor: n.cor,
        clientes: db.prepare("SELECT COUNT(*) AS c FROM usuarios WHERE nicho = ? AND papel = 'cliente'").get(n.id).c,
        atual: resumo(n.id, atual),
        proxima: resumo(n.id, proxima),
        rodando: [...rodando].filter((k) => k.startsWith(`${n.id}|`)).map((k) => k.split("|")[1]),
        ultima: ultima.get(n.id) || null,
      })),
    });
  });

  app.post("/api/admin/estrategias/gerar", admin, json, (req, res) => {
    const nicho = texto(req.body?.nicho, 40);
    const atual = semanaAtual();
    const semana = req.body?.semana === "proxima" ? somarDias(atual, 7) : atual;
    const forcar = Boolean(req.body?.forcar);
    if (!buscarNicho(nicho)) return res.status(400).json({ erro: "Nicho inválido." });
    // Roda em segundo plano (leva alguns minutos); o painel acompanha pelo status.
    const tarefa = gerador.gerarSemana(nicho, semana, { forcar });
    let respondeu = false;
    tarefa.catch((e) => {
      if (!respondeu && e instanceof ErroGeracao) {
        respondeu = true;
        return res.status(409).json({ erro: e.message });
      }
      console.error(`Geração (${nicho} ${semana}) falhou:`, e?.message || e);
    });
    setImmediate(() => {
      if (!respondeu) {
        respondeu = true;
        res.status(202).json({ ok: true, semana });
      }
    });
  });

  app.get("/api/admin/fila", admin, (req, res) => {
    const desde = somarDias(semanaAtual(), -7);
    const linhas = db.prepare(`
      SELECT e.*, u.nome AS cliente, u.negocio, u.nicho FROM itens_estado e JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.semana >= ? AND e.status IN ('aprovado', 'ajuste') ORDER BY e.semana, e.aprovado_em
    `).all(desde);
    const arq = (id) => arquivoPublico(id && buscarArquivo.get(id));
    const itens = linhas.map((e) => {
      const base = e.snapshot ? JSON.parse(e.snapshot) : null;
      const s = base || lerEstrategia(db, e.nicho, e.semana)?.itens.find((i) => i.id === e.item_id) || { titulo: e.item_id };
      return {
        usuario_id: e.usuario_id, cliente: e.cliente, negocio: e.negocio, nicho: e.nicho, semana: e.semana, item_id: e.item_id,
        status: e.status, comentario: e.comentario, aprovado_em: e.aprovado_em,
        titulo: s.titulo, formato: s.formato, data: s.data, dia: s.dia,
        horario: base?.horarioFinal || e.horario || s.horario,
        legenda: base?.legendaFinal ?? e.legenda ?? s.legenda,
        sequencia: s.sequencia || [],
        arquivo: arq(base?.arquivo_id ?? e.arquivo_id),
      };
    });
    itens.sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`));
    res.json({ itens });
  });

  app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

  // ---------- Site ----------
  app.use(express.static(path.join(aqui, "public"), { index: "index.html" }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(aqui, "public", "index.html")));

  app.use((err, req, res, _next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ erro: "Arquivo grande demais." });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ erro: "Dados inválidos." });
    console.error(err);
    res.status(500).json({ erro: "Erro inesperado." });
  });

  return { app, db, gerador };
}

// Cria (ou atualiza a senha de) um acesso da equipe VGA.
export function garantirAdmin(db, { email, senha, nome = "Equipe VGA" }) {
  email = String(email || "").trim().toLowerCase();
  if (!EMAIL_OK.test(email) || String(senha || "").length < 8) return false;
  const existe = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(email);
  if (existe) {
    db.prepare("UPDATE usuarios SET papel = 'admin', ativo = 1 WHERE id = ?").run(existe.id);
  } else {
    db.prepare("INSERT INTO usuarios (nome, email, senha_hash, papel, nicho) VALUES (?, ?, ?, 'admin', 'gastronomia')")
      .run(nome, email, gerarHash(senha));
  }
  return true;
}

function mesmoArquivo(a, b) {
  const norm = (x) => (process.platform === "win32" ? path.resolve(x).toLowerCase() : path.resolve(x));
  return norm(a) === norm(b);
}

if (process.argv[1] && mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url))) {
  const porta = Number(process.env.PORT) || 3000;
  const pastaDados = path.resolve(aqui, process.env.PASTA_DADOS || "data");
  const { app, db, gerador } = criarApp({ pastaDados });
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_SENHA) {
    garantirAdmin(db, { email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_SENHA });
  }
  const pararAgendador = process.env.ATUALIZACAO_AUTOMATICA === "0" ? () => {} : gerador.iniciarAgendador();
  const servidor = app.listen(porta, () => {
    console.log(`VGA • Área do Cliente em http://localhost:${porta}`);
    console.log(`Dados em ${pastaDados}`);
    if (!iaDisponivel()) console.log("Sem ANTHROPIC_API_KEY: estratégia no modelo pronto e análise simples (sem IA).");
  });
  const encerrar = () => {
    pararAgendador();
    servidor.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", encerrar);
  process.on("SIGINT", encerrar);
}
