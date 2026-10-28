# Receita para publicar a Área do Cliente no Railway (ou qualquer serviço com Docker).
# No Railway, use "Root Directory" = area-do-cliente.
FROM node:22-slim

WORKDIR /srv

# Instala as dependências primeiro (fica em cache entre publicações).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    PASTA_DADOS=/data

# /data guarda o banco, as fotos e os vídeos. Na hospedagem, monte um volume aqui.
RUN mkdir -p /data
EXPOSE 3000

CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
