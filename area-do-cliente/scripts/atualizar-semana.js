// Gera com IA a estratégia da semana de todos os nichos (ou de um só).
// Uso: npm run atualizar-semana            → o que estiver pendente (semana atual / próxima)
//      npm run atualizar-semana -- gastronomia proxima [--forcar]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirBanco } from "../src/db.js";
import { criarGerador } from "../src/gerador.js";
import { semanaAtual, somarDias } from "../src/datas.js";
import { NICHOS } from "../conteudo/nichos.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const db = abrirBanco(path.resolve(aqui, "..", process.env.PASTA_DADOS || "data"));
const gerador = criarGerador(db);

const [nicho, qual] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const forcar = process.argv.includes("--forcar");

try {
  if (nicho) {
    const lista = nicho === "todos" ? NICHOS.map((n) => n.id) : [nicho];
    const semana = qual === "proxima" ? somarDias(semanaAtual(), 7) : semanaAtual();
    for (const n of lista) {
      process.stdout.write(`Gerando ${n} (${semana})... `);
      try {
        const e = await gerador.gerarSemana(n, semana, { forcar });
        console.log(`ok: ${e.itens.length} pautas — ${e.tema}`);
      } catch (e) {
        console.log(`erro: ${e.message}`);
      }
    }
  } else {
    const feitos = await gerador.rodarCiclo();
    if (!feitos.length) console.log("Nada pendente (ou falta a ANTHROPIC_API_KEY).");
    for (const f of feitos) console.log(`${f.nicho} ${f.semana}: ${f.ok ? "ok" : `erro: ${f.erro}`}`);
  }
} finally {
  db.close();
}
