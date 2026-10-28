# VGA • Área do Cliente

Site (feito primeiro para o celular) onde cada cliente da VGA Gestão de Negócios entra com login e senha e recebe a **estratégia de conteúdo da semana** do seu nicho: pauta diária, ganchos, roteiros e legendas prontas para Reels, carrosséis, feed e Stories.

## Como o cliente usa

1. **Entra** com o e-mail e a senha que a VGA enviou.
2. **Escolhe o nicho** entre os 10 do mapa "VGA • Estratégia Segmentada — 10 Nichos Lucrativos" (pode trocar depois).
3. Vê o **resumo do nicho**: objetivo, os 5 pilares com a porcentagem, o volume do mês e as regras da profissão (quando existem).
4. Logo abaixo, a **estratégia da semana**: um cartão por dia, com formato, horário, gancho, roteiro, legenda (com botão de copiar) e o que fotografar ou gravar.
5. Na aba **Enviar**, sobe fotos e vídeos. A **IA** dá uma nota a cada arquivo, escolhe o melhor para cada pauta e define a legenda e o horário.
6. **Aprova** cada post, ou toca em **Pedir ajuste** e escreve o que quer mudar. Nada é publicado sem aprovação.
7. Na aba **Calendário**, vê as datas comerciais, os feriados, as datas de natureza e as campanhas de saúde, com o aviso de quando começar a divulgar.

No topo da semana fica o **painel de pendências**: falta enviar, para aprovar, em ajuste e aprovados.

## Painel VGA (equipe)

Quem tem acesso de equipe vê a aba **Painel VGA**, com três partes:

- **Estratégias:** situação da semana atual e da próxima de cada nicho, com botões para gerar com IA na hora.
- **Aprovados e ajustes:** fila do que os clientes aprovaram (arquivo, legenda final, dia e horário), pronta para agendar, e os pedidos de ajuste.
- **Clientes:** cria acessos (gera a senha e a mensagem pronta para mandar no WhatsApp), troca senha, nicho, negócio e cidade, e desativa acessos.

O nome do negócio e a cidade de cada cliente entram automaticamente nas legendas.

## Atualização semanal pela IA

A cada hora o servidor confere se há algo a fazer:

- **Semana atual:** se ainda está no modelo pronto e nenhum cliente começou a trabalhar nela, a IA gera a versão atualizada.
- **Próxima semana:** a partir de sexta-feira, a IA já prepara a semana seguinte.

Em cada geração, a IA (Claude) primeiro **pesquisa na web** o que está em alta para o nicho (formatos, temas, mudanças nas plataformas e nas regras da profissão). Depois cruza isso com os pilares, a semana-tipo, as datas das próximas 5 semanas e a semana anterior, para não repetir. As fontes aparecem para o cliente em "Fontes da pesquisa".

Se uma semana é gerada de novo, as pautas que o cliente **já aprovou ficam guardadas**. As que ainda não foram aprovadas são trocadas pelas novas.

Sem a chave da API, o site funciona igual com o **modelo de semana pronto** de cada nicho (`conteudo/semanas/`). A distribuição dos arquivos passa a ser simples: vídeo vertical vai para Reels e Stories, foto vai para o feed.

Também dá para rodar a geração pelo terminal:

```bash
npm run atualizar-semana
```

```bash
npm run atualizar-semana -- gastronomia proxima
```

## Rodar no computador

Precisa do Node.js 22.13 ou mais novo.

```bash
cd area-do-cliente
```

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha `ADMIN_EMAIL` e `ADMIN_SENHA` no `.env` (e a `ANTHROPIC_API_KEY`, se quiser a IA ligada). Depois:

```bash
npm start
```

Abra http://localhost:3000, entre com o e-mail da equipe e crie os clientes no Painel VGA.

Para rodar os testes:

```bash
npm test
```

## Publicar no Railway

Mesmo esquema do VGA App (Docker):

1. No Railway, crie um serviço a partir deste repositório e defina **Root Directory = `area-do-cliente`**. O Railway lê o `railway.json` e usa o `Dockerfile`.
2. Adicione um **Volume** montado em `/data`. É lá que ficam o banco, as fotos e os vídeos. Sem o volume, tudo some a cada nova publicação.
3. Em **Variables**, preencha:
   - `ANTHROPIC_API_KEY`: chave da API do Claude
   - `ADMIN_EMAIL` e `ADMIN_SENHA`: primeiro acesso da equipe VGA
   - opcionais: `MAX_VIDEO_MB` (padrão 300) e `MAX_FOTO_MB` (padrão 25)
4. Gere o domínio em **Settings → Networking**. A verificação de saúde usa `/api/saude`.

## Estrutura

```
area-do-cliente/
  server.js              servidor (rotas do cliente e do painel)
  src/
    auth.js              login e sessões (mesma base do VGA App)
    db.js                banco SQLite
    estrategia.js        monta, guarda e personaliza a semana
    ia.js                Claude: pesquisa de tendências, estratégia e análise de fotos e vídeos
    gerador.js           atualização semanal automática
    arquivos.js          recebimento de fotos e vídeos
    datas.js             semanas (fuso de Brasília)
  conteudo/
    nichos.js            os 10 nichos: objetivo, pilares, volume, regras e semana-tipo
    semanas/*.js         modelo de semana de cada nicho, com textos prontos
    calendario.js        datas de nov/2026 a dez/2027
  public/                telas (HTML, CSS e JavaScript, sem framework)
  scripts/               atualizar-semana e criar-admin
  test/                  testes automáticos
```

## Próximas fases

- Publicação automática pelo Metricool depois da aprovação (hoje a fila de aprovados fica no Painel VGA).
- Datas locais de Morretes no calendário.
- Avisos por WhatsApp ou e-mail quando a semana nova sai e quando falta aprovar.
- Vídeos grandes guardados no Google Drive ou em armazenamento externo.
- Relatórios de desempenho por cliente.
