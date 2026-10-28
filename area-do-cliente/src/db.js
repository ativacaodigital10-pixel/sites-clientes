import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Abre (ou cria) o banco SQLite e garante que as tabelas existam.
export function abrirBanco(pastaDados) {
  fs.mkdirSync(pastaDados, { recursive: true });
  const db = new DatabaseSync(path.join(pastaDados, "area-do-cliente.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    -- Clientes e equipe VGA (papel = 'cliente' ou 'admin').
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      papel TEXT NOT NULL DEFAULT 'cliente',
      nicho TEXT,
      negocio TEXT NOT NULL DEFAULT '',
      cidade TEXT NOT NULL DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessoes (
      token TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      expira_em TEXT NOT NULL
    );

    -- Estratégia da semana de cada nicho (semana = segunda-feira, AAAA-MM-DD).
    CREATE TABLE IF NOT EXISTS estrategias (
      nicho TEXT NOT NULL,
      semana TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      origem TEXT NOT NULL DEFAULT 'modelo',
      gerado_em TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (nicho, semana)
    );

    -- Histórico das gerações semanais pela IA (para o painel da VGA).
    CREATE TABLE IF NOT EXISTS geracoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nicho TEXT NOT NULL,
      semana TEXT NOT NULL,
      status TEXT NOT NULL,
      mensagem TEXT NOT NULL DEFAULT '',
      iniciado_em TEXT NOT NULL DEFAULT (datetime('now')),
      terminado_em TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_geracoes ON geracoes(nicho, semana, id);

    -- Fotos e vídeos enviados pelo cliente.
    CREATE TABLE IF NOT EXISTS arquivos (
      id TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      semana TEXT NOT NULL,
      nome TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL,
      ext TEXT NOT NULL,
      tamanho INTEGER NOT NULL DEFAULT 0,
      largura INTEGER,
      altura INTEGER,
      duracao REAL,
      tem_miniatura INTEGER NOT NULL DEFAULT 0,
      analise TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_arquivos ON arquivos(usuario_id, semana);

    -- Situação de cada pauta para cada cliente: arquivo escolhido, legenda e horário finais, aprovação.
    CREATE TABLE IF NOT EXISTS itens_estado (
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      semana TEXT NOT NULL,
      item_id TEXT NOT NULL,
      status TEXT,
      arquivo_id TEXT REFERENCES arquivos(id) ON DELETE SET NULL,
      legenda TEXT,
      horario TEXT,
      comentario TEXT,
      motivo_ia TEXT,
      snapshot TEXT,
      aprovado_em TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (usuario_id, semana, item_id)
    );
  `);
  return db;
}
