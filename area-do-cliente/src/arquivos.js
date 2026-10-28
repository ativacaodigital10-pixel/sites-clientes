// Recebe fotos e vídeos do cliente gravando direto no disco (sem carregar o arquivo inteiro na memória)
// e confere os primeiros bytes para aceitar só imagens e vídeos de verdade.
import fs from "node:fs";

const MARCAS_HEIC = ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"];

export const MIME = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};

export function detectarTipo(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { tipo: "foto", ext: "jpg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { tipo: "foto", ext: "png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { tipo: "foto", ext: "webp" };
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { tipo: "video", ext: "webm" };
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const marca = buf.toString("ascii", 8, 12).toLowerCase();
    if (MARCAS_HEIC.includes(marca)) return { tipo: "foto", ext: "heic" };
    if (marca === "qt  ") return { tipo: "video", ext: "mov" };
    return { tipo: "video", ext: "mp4" };
  }
  return null;
}

export class ErroEnvio extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// Grava o corpo da requisição em `destino`. Rejeita tipos inválidos e arquivos acima do limite.
export function receberArquivo(req, destino, { maxFoto, maxVideo }) {
  return new Promise((resolve, reject) => {
    const declarado = Number(req.headers["content-length"]);
    if (Number.isFinite(declarado) && declarado > Math.max(maxFoto, maxVideo)) {
      req.resume();
      return reject(new ErroEnvio(413, "Arquivo grande demais."));
    }
    let inicio = Buffer.alloc(0);
    let tipo = null;
    let total = 0;
    let saida = null;
    let encerrado = false;

    const falhar = (erro) => {
      if (encerrado) return;
      encerrado = true;
      req.unpipe?.();
      req.resume();
      if (saida) saida.destroy();
      fs.rm(destino, { force: true }, () => reject(erro));
    };

    req.on("data", (pedaco) => {
      if (encerrado) return;
      total += pedaco.length;
      if (!tipo) {
        inicio = Buffer.concat([inicio, pedaco]);
        if (inicio.length < 16) return;
        tipo = detectarTipo(inicio);
        if (!tipo) return falhar(new ErroEnvio(400, "Envie uma foto (JPG, PNG, WebP, HEIC) ou um vídeo (MP4, MOV, WebM)."));
        saida = fs.createWriteStream(destino);
        saida.on("error", falhar);
        pedaco = inicio;
      }
      const limite = tipo.tipo === "video" ? maxVideo : maxFoto;
      if (total > limite) {
        return falhar(new ErroEnvio(413, `Arquivo grande demais (máximo ${Math.round(limite / 1048576)} MB para ${tipo.tipo === "video" ? "vídeo" : "foto"}).`));
      }
      if (!saida.write(pedaco)) {
        req.pause();
        saida.once("drain", () => req.resume());
      }
    });
    req.on("end", () => {
      if (encerrado) return;
      if (!tipo) {
        tipo = detectarTipo(inicio);
        if (!tipo) return falhar(new ErroEnvio(400, "Arquivo vazio ou em formato não aceito."));
        saida = fs.createWriteStream(destino);
        saida.on("error", falhar);
        saida.write(inicio);
      }
      encerrado = true;
      saida.end(() => resolve({ ...tipo, tamanho: total }));
    });
    req.on("aborted", () => falhar(new ErroEnvio(400, "Envio interrompido.")));
    req.on("error", falhar);
  });
}
