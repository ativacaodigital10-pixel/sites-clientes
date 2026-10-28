// Estratégia da semana por nicho: monta a partir do modelo, guarda no banco e personaliza para cada cliente.
import { buscarNicho } from "../conteudo/nichos.js";
import { DIAS, dataDoDia, horarioValido } from "./datas.js";

import imobiliario from "../conteudo/semanas/imobiliario.js";
import odontologia from "../conteudo/semanas/odontologia.js";
import hotelaria from "../conteudo/semanas/hotelaria.js";
import estetica from "../conteudo/semanas/estetica.js";
import saude from "../conteudo/semanas/saude.js";
import educacao from "../conteudo/semanas/educacao.js";
import eventos from "../conteudo/semanas/eventos.js";
import gastronomia from "../conteudo/semanas/gastronomia.js";
import turismo from "../conteudo/semanas/turismo.js";
import servicos from "../conteudo/semanas/servicos.js";

export const MODELOS = { imobiliario, odontologia, hotelaria, estetica, saude, educacao, eventos, gastronomia, turismo, servicos };
export const FORMATOS = ["reels", "carrossel", "feed", "stories"];

function str(v, max = 3000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function lista(v, max = 12, tam = 600) {
  return Array.isArray(v) ? v.map((x) => str(x, tam)).filter(Boolean).slice(0, max) : [];
}

// "Não precisa de foto" / "Não precisa de material novo" = a pauta pode ser aprovada sem envio.
function precisaDeMaterial(item) {
  if (typeof item.precisaMaterial === "boolean") return item.precisaMaterial;
  return !/^n[ãa]o precisa/i.test(item.material || "");
}

// Deixa qualquer item (do modelo ou da IA) no mesmo formato, com valores seguros.
export function normalizarItem(bruto, semana, idPadrao) {
  const formato = FORMATOS.includes(bruto.formato) ? bruto.formato : "feed";
  const dia = DIAS.includes(bruto.dia) ? bruto.dia : "seg";
  const item = {
    id: str(bruto.id, 40).replace(/[^\w-]/g, "") || idPadrao,
    dia,
    data: dataDoDia(semana, dia),
    horario: horarioValido(bruto.horario) ? bruto.horario : "12:00",
    formato,
    pilar: str(bruto.pilar, 80),
    quadro: str(bruto.quadro, 80),
    titulo: str(bruto.titulo, 200) || "Pauta",
    gancho: str(bruto.gancho, 300),
    roteiro: lista(bruto.roteiro),
    textoTela: str(bruto.textoTela, 300),
    laminas: lista(bruto.laminas, 10),
    legenda: str(bruto.legenda, 2200),
    palavrasChave: lista(bruto.palavrasChave, 8, 80),
    audio: str(bruto.audio, 300),
    material: str(bruto.material, 400),
    dica: str(bruto.dica, 400),
    sequencia: Array.isArray(bruto.sequencia)
      ? bruto.sequencia.slice(0, 6).map((s) => ({ momento: str(s?.momento, 40), ideia: str(s?.ideia, 300), recurso: str(s?.recurso, 300) }))
      : [],
  };
  item.precisaMaterial = precisaDeMaterial({ ...bruto, material: item.material });
  return item;
}

function ordenar(itens) {
  const peso = (i) => DIAS.indexOf(i.dia) * 10000 + Number(i.horario.replace(":", "")) + (i.formato === "stories" ? 5000 : 0);
  return itens.sort((a, b) => peso(a) - peso(b));
}

export function normalizarEstrategia(bruta, nicho, semana, origem) {
  const vistos = new Set();
  const itens = (bruta.itens || []).slice(0, 30).map((b, i) => {
    const item = normalizarItem(b, semana, `i${i + 1}`);
    while (vistos.has(item.id)) item.id = `${item.id}x`;
    vistos.add(item.id);
    return item;
  });
  return {
    nicho,
    semana,
    origem,
    tema: str(bruta.tema, 200),
    foco: str(bruta.foco, 1200),
    tendencias: lista(bruta.tendencias, 8, 400),
    fontes: Array.isArray(bruta.fontes) ? bruta.fontes.slice(0, 10).map((f) => ({ titulo: str(f?.titulo, 200), url: str(f?.url, 500) })).filter((f) => /^https?:\/\//.test(f.url)) : [],
    itens: ordenar(itens),
  };
}

export function montarModelo(nichoId, semana) {
  const nicho = buscarNicho(nichoId);
  const modelo = MODELOS[nichoId];
  if (!nicho || !modelo) return null;
  const itens = [
    ...modelo.posts,
    ...modelo.stories.map((s) => ({ ...s, formato: "stories" })),
  ];
  return normalizarEstrategia({ tema: modelo.tema, foco: modelo.foco, tendencias: nicho.tendencias, itens }, nichoId, semana, "modelo");
}

export function lerEstrategia(db, nicho, semana) {
  const linha = db.prepare("SELECT conteudo, origem, gerado_em FROM estrategias WHERE nicho = ? AND semana = ?").get(nicho, semana);
  if (!linha) return null;
  return { ...JSON.parse(linha.conteudo), origem: linha.origem, gerado_em: linha.gerado_em };
}

export function salvarEstrategia(db, estrategia) {
  const { nicho, semana, origem } = estrategia;
  db.prepare(`
    INSERT INTO estrategias (nicho, semana, conteudo, origem, gerado_em) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(nicho, semana) DO UPDATE SET conteudo = excluded.conteudo, origem = excluded.origem, gerado_em = excluded.gerado_em
  `).run(nicho, semana, JSON.stringify(estrategia), origem);
  return lerEstrategia(db, nicho, semana);
}

// Busca a estratégia; se não existir, grava a do modelo (para os ids das pautas ficarem estáveis).
export function obterEstrategia(db, nicho, semana, { criar = true } = {}) {
  const atual = lerEstrategia(db, nicho, semana);
  if (atual || !criar) return atual;
  const modelo = montarModelo(nicho, semana);
  return modelo ? salvarEstrategia(db, modelo) : null;
}

// Algum cliente do nicho já mexeu nesta semana (enviou, aprovou ou pediu ajuste)?
export function temAtividade(db, nicho, semana) {
  return Boolean(db.prepare(`
    SELECT 1 FROM itens_estado e JOIN usuarios u ON u.id = e.usuario_id
    WHERE u.nicho = ? AND e.semana = ? LIMIT 1
  `).get(nicho, semana));
}

// Troca {negocio} e {cidade} pelos dados do cliente em todos os textos.
export function personalizar(valor, usuario) {
  const negocio = usuario?.negocio || "nosso espaço";
  const cidade = usuario?.cidade || "nossa cidade";
  const trocar = (s) => s.replaceAll("{negocio}", negocio).replaceAll("{cidade}", cidade);
  const andar = (v) => {
    if (typeof v === "string") return trocar(v);
    if (Array.isArray(v)) return v.map(andar);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, andar(x)]));
    return v;
  };
  return andar(valor);
}
