// Atualização semanal: a IA pesquisa as tendências do nicho e gera a nova estratégia.
import crypto from "node:crypto";
import { NICHOS, buscarNicho } from "../conteudo/nichos.js";
import { datasNoPeriodo } from "../conteudo/calendario.js";
import { semanaAtual, somarDias, hojeSP, indiceDia } from "./datas.js";
import { lerEstrategia, salvarEstrategia, normalizarEstrategia, temAtividade, montarModelo } from "./estrategia.js";
import { iaDisponivel, pesquisarTendencias, gerarEstrategiaIA } from "./ia.js";

const emAndamento = new Set();

export class ErroGeracao extends Error {}

export function criarGerador(db, { pesquisar = pesquisarTendencias, gerar = gerarEstrategiaIA, disponivel = iaDisponivel } = {}) {
  async function gerarSemana(nichoId, semana, { forcar = false } = {}) {
    const nicho = buscarNicho(nichoId);
    if (!nicho) throw new ErroGeracao("Nicho inválido.");
    if (!disponivel()) throw new ErroGeracao("Configure a chave da API do Claude (ANTHROPIC_API_KEY) para gerar com IA.");
    const chave = `${nichoId}|${semana}`;
    if (emAndamento.has(chave)) throw new ErroGeracao("Já existe uma geração em andamento para esta semana.");
    const atual = lerEstrategia(db, nichoId, semana);
    if (atual && temAtividade(db, nichoId, semana) && !forcar) {
      throw new ErroGeracao("Clientes deste nicho já começaram a trabalhar nesta semana. Use 'gerar mesmo assim' ou gere a próxima semana.");
    }

    emAndamento.add(chave);
    const { lastInsertRowid } = db.prepare("INSERT INTO geracoes (nicho, semana, status) VALUES (?, ?, 'rodando')").run(nichoId, semana);
    const fim = (status, mensagem) =>
      db.prepare("UPDATE geracoes SET status = ?, mensagem = ?, terminado_em = datetime('now') WHERE id = ?").run(status, mensagem, lastInsertRowid);
    try {
      const datas = datasNoPeriodo(semana, somarDias(semana, 34), nichoId);
      const anterior = lerEstrategia(db, nichoId, somarDias(semana, -7));
      let pesquisa = null;
      try {
        pesquisa = await pesquisar({ nicho, semana, datas });
      } catch (e) {
        console.error(`Pesquisa de tendências falhou (${nichoId}):`, e?.message || e);
      }
      const bruta = await gerar({ nicho, semana, datas, anterior, pesquisa });
      // Prefixo novo a cada geração: pautas já aprovadas de uma versão anterior continuam identificáveis.
      const marca = crypto.randomBytes(2).toString("hex");
      const itens = (bruta.itens || []).map((i, n) => ({ ...i, id: `${marca}-${String(i.id || `i${n + 1}`).replace(/[^\w-]/g, "").slice(0, 20)}` }));
      const estrategia = normalizarEstrategia({ ...bruta, fontes: pesquisa?.fontes || bruta.fontes || [], itens }, nichoId, semana, "ia");
      if (estrategia.itens.length < 3) throw new Error("A IA devolveu poucas pautas.");

      db.exec("BEGIN");
      try {
        salvarEstrategia(db, estrategia);
        // Pautas ainda não aprovadas da versão anterior deixam de existir; as aprovadas ficam guardadas.
        db.prepare(`
          DELETE FROM itens_estado WHERE semana = ? AND (status IS NULL OR status <> 'aprovado')
            AND usuario_id IN (SELECT id FROM usuarios WHERE nicho = ?)
        `).run(semana, nichoId);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      fim("ok", `${estrategia.itens.length} pautas${pesquisa ? `, ${pesquisa.fontes.length} fontes pesquisadas` : ", sem pesquisa na web"}`);
      return estrategia;
    } catch (e) {
      fim("erro", String(e?.message || e).slice(0, 300));
      throw e;
    } finally {
      emAndamento.delete(chave);
    }
  }

  // Falhou nas últimas 6 horas? Espera antes de tentar de novo.
  function falhouRecente(nicho, semana) {
    return Boolean(db.prepare(`
      SELECT 1 FROM geracoes WHERE nicho = ? AND semana = ? AND status = 'erro' AND iniciado_em > datetime('now', '-6 hours')
    `).get(nicho, semana));
  }

  // O que precisa ser gerado agora:
  // - semana atual: se ainda está no modelo pronto e ninguém começou a trabalhar nela;
  // - próxima semana: a partir de sexta-feira, para o cliente já ver a semana seguinte no fim de semana.
  function pendentes(agora = new Date()) {
    const atual = semanaAtual(agora);
    const proxima = somarDias(atual, 7);
    const lista = [];
    for (const n of NICHOS) {
      const est = lerEstrategia(db, n.id, atual);
      if ((!est || est.origem === "modelo") && !temAtividade(db, n.id, atual)) lista.push([n.id, atual]);
      if (indiceDia(hojeSP(agora)) >= 4 && !lerEstrategia(db, n.id, proxima)) lista.push([n.id, proxima]);
    }
    return lista.filter(([n, s]) => !falhouRecente(n, s));
  }

  async function rodarCiclo(agora = new Date()) {
    if (!disponivel()) return [];
    const feitos = [];
    for (const [nicho, semana] of pendentes(agora)) {
      try {
        await gerarSemana(nicho, semana);
        feitos.push({ nicho, semana, ok: true });
      } catch (e) {
        console.error(`Geração semanal falhou (${nicho} ${semana}):`, e?.message || e);
        // Garante que a semana exista nem que seja no modelo pronto.
        if (!lerEstrategia(db, nicho, semana)) salvarEstrategia(db, montarModelo(nicho, semana));
        feitos.push({ nicho, semana, ok: false, erro: String(e?.message || e) });
      }
    }
    return feitos;
  }

  // Confere a cada hora. Roda um nicho por vez para não sobrecarregar.
  function iniciarAgendador({ intervaloMs = 60 * 60e3, atrasoInicialMs = 30e3 } = {}) {
    let rodando = false;
    const tique = async () => {
      if (rodando) return;
      rodando = true;
      try {
        await rodarCiclo();
      } finally {
        rodando = false;
      }
    };
    const t1 = setTimeout(tique, atrasoInicialMs);
    const t2 = setInterval(tique, intervaloMs);
    t1.unref();
    t2.unref();
    return () => {
      clearTimeout(t1);
      clearInterval(t2);
    };
  }

  const emAndamentoAgora = () => [...emAndamento].map((c) => c.split("|"));

  return { gerarSemana, rodarCiclo, pendentes, iniciarAgendador, emAndamentoAgora };
}
