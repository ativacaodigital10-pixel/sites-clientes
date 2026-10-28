// Cria um acesso da equipe VGA. Uso: npm run criar-admin -- email@vga.com.br "senha-com-8+" "Nome"
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirBanco } from "../src/db.js";
import { garantirAdmin } from "../server.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const [email, senha, nome] = process.argv.slice(2);
const db = abrirBanco(path.resolve(aqui, "..", process.env.PASTA_DADOS || "data"));
if (garantirAdmin(db, { email, senha, nome })) {
  console.log(`Acesso da equipe VGA pronto: ${email}`);
} else {
  console.log("Uso: npm run criar-admin -- email@exemplo.com \"senha com 8 ou mais caracteres\" \"Nome\"");
  process.exitCode = 1;
}
db.close();
