// Datas no fuso de Brasília. As semanas começam na segunda-feira (AAAA-MM-DD).

export const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
export const NOMES_DIAS = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo" };
export const FUSO = "America/Sao_Paulo";

export function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

function paraUTC(data) {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function deUTC(dt) {
  return dt.toISOString().slice(0, 10);
}

export function dataValida(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && deUTC(paraUTC(v)) === v;
}

export function somarDias(data, n) {
  const dt = paraUTC(data);
  dt.setUTCDate(dt.getUTCDate() + n);
  return deUTC(dt);
}

export function segundaDaSemana(data) {
  const dt = paraUTC(data);
  const diaSemana = (dt.getUTCDay() + 6) % 7; // segunda = 0
  dt.setUTCDate(dt.getUTCDate() - diaSemana);
  return deUTC(dt);
}

// "AAAA-MM-DDTHH:MM" no horário de Brasília.
export function agoraSP(agora = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(agora).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function semanaAtual(agora = new Date()) {
  return segundaDaSemana(hojeSP(agora));
}

export function indiceDia(data) {
  return (paraUTC(data).getUTCDay() + 6) % 7;
}

export function dataDoDia(semana, dia) {
  const i = DIAS.indexOf(dia);
  return somarDias(semana, i < 0 ? 0 : i);
}

export function horarioValido(v) {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

// "26/10"
export function curta(data) {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}
