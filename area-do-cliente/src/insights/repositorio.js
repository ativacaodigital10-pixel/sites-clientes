// Leitura, gravação e importação (CSV) dos números mensais de Insights.
import { FONTES, IDS_FONTES, normalizarDados, mesValido, mesAnterior, ultimosMeses, itemDeLista } from "./campos.js";

export function lerMes(db, usuarioId, fonte, mes) {
  const l = db.prepare("SELECT dados, origem, nota_equipe, atualizado_em FROM insights_mensais WHERE usuario_id = ? AND fonte = ? AND mes = ?").get(usuarioId, fonte, mes);
  return l ? { dados: JSON.parse(l.dados), origem: l.origem, nota_equipe: l.nota_equipe, atualizado_em: l.atualizado_em } : null;
}

export function salvarMes(db, { usuarioId, fonte, mes, dados, origem = "manual", notaEquipe = "", por = null }) {
  db.prepare(`
    INSERT INTO insights_mensais (usuario_id, fonte, mes, dados, origem, nota_equipe, atualizado_por, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(usuario_id, fonte, mes) DO UPDATE SET dados = excluded.dados, origem = excluded.origem,
      nota_equipe = excluded.nota_equipe, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em
  `).run(usuarioId, fonte, mes, JSON.stringify(dados), origem, String(notaEquipe || "").slice(0, 600), por);
}

export function apagarMes(db, usuarioId, fonte, mes) {
  db.prepare("DELETE FROM insights_mensais WHERE usuario_id = ? AND fonte = ? AND mes = ?").run(usuarioId, fonte, mes);
}

export function mesesComDados(db, usuarioId) {
  return db.prepare("SELECT DISTINCT mes FROM insights_mensais WHERE usuario_id = ? AND dados <> '{}' ORDER BY mes DESC").all(usuarioId).map((l) => l.mes);
}

// Tudo de um mês: atual, anterior e os últimos 6 meses (para o gráfico).
export function carregarPeriodo(db, usuarioId, mes) {
  const meses = ultimosMeses(mes, 6);
  const porFonte = {};
  for (const f of IDS_FONTES) {
    porFonte[f] = {
      atual: lerMes(db, usuarioId, f, mes),
      anterior: lerMes(db, usuarioId, f, mesAnterior(mes)),
      historico: meses.map((m) => ({ mes: m, dados: lerMes(db, usuarioId, f, m)?.dados || null })),
    };
  }
  return porFonte;
}

// ---------- CSV ----------
// Formato "longo" (uma informação por linha), fácil de montar no Excel ou no Google Planilhas:
//   email;mes;fonte;campo;valor
//   cliente@x.com;2026-10;instagram;seguidores;1.234
//   cliente@x.com;2026-10;google;ultimas_avaliacoes;Maria | 5 | 2026-10-12 | Comida ótima | sim
// Listas: cada linha acrescenta um item. Aceita ";" ou "," como separador.

const APELIDOS_FONTE = { meta: "meta", instagram: "meta", facebook: "meta", ig: "meta", google: "google", gmb: "google", tripadvisor: "tripadvisor", trip: "tripadvisor" };

export function lerCSV(texto) {
  const limpo = String(texto || "").replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/)[0] || "";
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : ",";
  const linhas = [];
  let campo = "";
  let linha = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((x) => x.trim()));
}

export function modeloCSV() {
  return [
    "email;mes;fonte;campo;valor",
    "cliente@exemplo.com;2026-10;instagram;seguidores;2.480",
    "cliente@exemplo.com;2026-10;instagram;alcance;9.800",
    "cliente@exemplo.com;2026-10;instagram;melhores_posts;Reel do barreado | Reels | 5.200 | 340 | https://instagram.com/p/xxx",
    "cliente@exemplo.com;2026-10;instagram;horarios_online;19h | 82",
    "cliente@exemplo.com;2026-10;instagram;cidades;Curitiba | 41",
    "cliente@exemplo.com;2026-10;google;visualizacoes_maps;3.100",
    "cliente@exemplo.com;2026-10;google;nota_media;4,7",
    "cliente@exemplo.com;2026-10;google;ultimas_avaliacoes;Maria S. | 5 | 2026-10-12 | Comida maravilhosa | sim",
    "cliente@exemplo.com;2026-10;tripadvisor;ranking_posicao;3",
    "cliente@exemplo.com;2026-10;tripadvisor;ranking_categoria;restaurantes em Morretes",
    "cliente@exemplo.com;2026-10;tripadvisor;selos;Travellers' Choice 2026",
    "",
    "# Campos aceitos (valor de nota_equipe aparece para o cliente como comentário da VGA):",
    ...IDS_FONTES.map((f) => {
      const F = FONTES[f];
      return `# ${f}: ${[...F.numeros.map((n) => n.id), ...(F.textos || []).map((t) => t.id), ...F.listas.map((l) => `${l.id} (${l.colunas.join(" | ")})`), "nota_equipe"].join(", ")}`;
    }),
  ].join("\n");
}

// Valida e (se aplicar=true) grava. Devolve um resumo para a VGA conferir antes.
export function importarCSV(db, texto, { aplicar = false, por = null } = {}) {
  const linhas = lerCSV(texto).filter((l) => !String(l[0]).trim().startsWith("#"));
  const erros = [];
  if (!linhas.length) return { grupos: [], erros: [{ linha: 0, erro: "Arquivo vazio." }], aplicado: false };
  const cab = linhas[0].map((c) => c.trim().toLowerCase());
  const idx = Object.fromEntries(["email", "mes", "fonte", "campo", "valor"].map((c) => [c, cab.indexOf(c)]));
  if (Object.values(idx).some((i) => i < 0)) {
    return { grupos: [], erros: [{ linha: 1, erro: "O cabeçalho precisa ter as colunas: email;mes;fonte;campo;valor" }], aplicado: false };
  }
  const usuarios = new Map(db.prepare("SELECT id, email, nome FROM usuarios").all().map((u) => [u.email.toLowerCase(), u]));
  const grupos = new Map();

  linhas.slice(1).forEach((l, n) => {
    const num = n + 2;
    const pegar = (c) => String(l[idx[c]] ?? "").trim();
    const email = pegar("email").toLowerCase();
    const mes = pegar("mes");
    const fonte = APELIDOS_FONTE[pegar("fonte").toLowerCase()];
    const campo = pegar("campo").toLowerCase();
    const valor = pegar("valor");
    const u = usuarios.get(email);
    if (!u) return erros.push({ linha: num, erro: `Cliente não encontrado: ${email || "(vazio)"}` });
    if (!mesValido(mes)) return erros.push({ linha: num, erro: `Mês inválido "${mes}" (use AAAA-MM).` });
    if (!fonte) return erros.push({ linha: num, erro: `Fonte inválida "${pegar("fonte")}" (use instagram, google ou tripadvisor).` });
    const F = FONTES[fonte];
    const chave = `${u.id}|${fonte}|${mes}`;
    if (!grupos.has(chave)) grupos.set(chave, { usuarioId: u.id, email, nome: u.nome, fonte, mes, bruto: {}, nota: null, campos: 0 });
    const g = grupos.get(chave);
    const lista = F.listas.find((x) => x.id === campo);
    if (campo === "nota_equipe") g.nota = valor;
    else if (lista) {
      if (!itemDeLista(lista, valor)) return erros.push({ linha: num, erro: `Item de "${campo}" vazio. Formato: ${lista.colunas.join(" | ")}` });
      (g.bruto[campo] ||= []).push(valor);
    } else if (F.numeros.some((x) => x.id === campo) || (F.textos || []).some((x) => x.id === campo)) {
      g.bruto[campo] = valor;
    } else return erros.push({ linha: num, erro: `Campo "${campo}" não existe em ${fonte}.` });
    g.campos += 1;
  });

  const resumo = [];
  for (const g of grupos.values()) {
    const { dados, erros: errosCampos } = normalizarDados(g.fonte, g.bruto);
    for (const e of errosCampos) erros.push({ linha: null, erro: `${g.email} ${g.mes} ${g.fonte}: ${e}` });
    resumo.push({ email: g.email, nome: g.nome, fonte: g.fonte, mes: g.mes, campos: g.campos, dados, nota: g.nota, usuarioId: g.usuarioId });
  }
  // Só grava se não houver nenhum erro (tudo ou nada).
  const aplicado = aplicar && !erros.length && resumo.length > 0;
  if (aplicado) {
    db.exec("BEGIN");
    try {
      for (const g of resumo) {
        const atual = lerMes(db, g.usuarioId, g.fonte, g.mes);
        salvarMes(db, {
          usuarioId: g.usuarioId, fonte: g.fonte, mes: g.mes,
          dados: { ...(atual?.dados || {}), ...g.dados },
          origem: "csv",
          notaEquipe: g.nota ?? atual?.nota_equipe ?? "",
          por,
        });
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return { grupos: resumo.map(({ usuarioId, dados, ...r }) => r), erros, aplicado };
}
