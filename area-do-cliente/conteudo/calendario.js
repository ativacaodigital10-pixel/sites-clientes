// Datas comerciais, feriados, datas de natureza e campanhas de saúde (nov/2026 a dez/2027).
// Fonte: aba "Calendário" do briefing. Datas locais de Morretes ficam para a próxima fase.
// "fim" existe quando a ocasião dura um período (mês ou temporada). nichos: ids ou "todos".

const T = "todos";

export const CALENDARIO = [
  { inicio: "2026-11-01", fim: "2026-11-30", nome: "Novembro Azul", tipo: "Conscientização", nichos: ["saude"] },
  { inicio: "2026-11-02", nome: "Finados (feriado)", tipo: "Feriado", nichos: ["turismo", "hotelaria", "gastronomia"] },
  { inicio: "2026-11-15", nome: "Proclamação da República (feriado)", tipo: "Feriado", nichos: ["turismo", "hotelaria", "gastronomia"] },
  { inicio: "2026-11-20", nome: "Consciência Negra (feriado)", tipo: "Feriado", nichos: ["turismo", "hotelaria", "educacao"] },
  { inicio: "2026-11-27", nome: "Black Friday", tipo: "Comercial", nichos: [T], destaque: ["estetica", "imobiliario", "hotelaria"] },
  { inicio: "2026-11-30", nome: "Cyber Monday", tipo: "Comercial", nichos: ["estetica", "educacao", "servicos"] },
  { inicio: "2026-12-21", nome: "Início do verão (solstício)", tipo: "Natureza", nichos: ["turismo", "hotelaria", "imobiliario", "estetica"] },
  { inicio: "2026-12-25", nome: "Natal", tipo: "Comercial", nichos: [T] },
  { inicio: "2026-12-31", nome: "Réveillon", tipo: "Comercial", nichos: ["eventos", "hotelaria", "gastronomia"] },
  { inicio: "2026-10-01", fim: "2027-01-31", nome: "Temporada de matrículas", tipo: "Sazonal", nichos: ["educacao"] },
  { inicio: "2026-12-01", fim: "2027-02-28", nome: "Temporada de praia e imóveis de veraneio", tipo: "Sazonal", nichos: ["imobiliario"] },
  { inicio: "2027-01-01", fim: "2027-01-31", nome: "Férias e alta temporada no litoral", tipo: "Sazonal", nichos: ["turismo", "hotelaria", "gastronomia", "imobiliario"] },
  { inicio: "2027-01-01", fim: "2027-01-31", nome: "Janeiro Branco (saúde mental)", tipo: "Conscientização", nichos: ["saude"] },
  { inicio: "2027-01-15", fim: "2027-02-28", nome: "Volta às aulas e matrículas", tipo: "Sazonal", nichos: ["educacao"] },
  { inicio: "2027-02-09", nome: "Carnaval", tipo: "Feriado", nichos: ["turismo", "hotelaria", "gastronomia", "eventos"] },
  { inicio: "2027-03-15", nome: "Dia do Consumidor", tipo: "Comercial", nichos: [T] },
  { inicio: "2027-03-20", nome: "Início do outono (equinócio)", tipo: "Natureza", nichos: ["turismo", "gastronomia", "estetica"] },
  { inicio: "2027-03-22", nome: "Dia Mundial da Água", tipo: "Natureza", nichos: ["turismo", "imobiliario", "hotelaria"] },
  { inicio: "2027-03-28", nome: "Páscoa", tipo: "Comercial", nichos: ["gastronomia", "hotelaria", "turismo", "educacao"] },
  { inicio: "2027-04-07", nome: "Dia Mundial da Saúde", tipo: "Conscientização", nichos: ["saude", "odontologia"] },
  { inicio: "2027-04-21", nome: "Tiradentes (feriado)", tipo: "Feriado", nichos: ["turismo", "hotelaria"] },
  { inicio: "2027-04-22", nome: "Dia da Terra", tipo: "Natureza", nichos: ["turismo", "imobiliario"] },
  { inicio: "2027-05-01", nome: "Dia do Trabalho (feriado)", tipo: "Feriado", nichos: ["turismo", "hotelaria", "gastronomia"] },
  { inicio: "2027-05-09", nome: "Dia das Mães", tipo: "Comercial", nichos: ["estetica", "gastronomia", "hotelaria", "saude"] },
  { inicio: "2027-05-10", nome: "Dia do Cozinheiro", tipo: "Profissão", nichos: ["gastronomia"] },
  { inicio: "2027-05-27", nome: "Corpus Christi", tipo: "Feriado", nichos: ["turismo", "hotelaria"] },
  { inicio: "2027-06-05", nome: "Dia Mundial do Meio Ambiente", tipo: "Natureza", nichos: ["turismo", "imobiliario", "educacao"] },
  { inicio: "2027-06-12", nome: "Dia dos Namorados", tipo: "Comercial", nichos: ["gastronomia", "hotelaria", "eventos", "estetica"] },
  { inicio: "2027-06-01", fim: "2027-06-30", nome: "Festas Juninas", tipo: "Sazonal", nichos: ["gastronomia", "educacao", "eventos"] },
  { inicio: "2027-06-21", nome: "Início do inverno (solstício)", tipo: "Natureza", nichos: ["gastronomia", "hotelaria", "turismo"] },
  { inicio: "2027-07-01", fim: "2027-07-31", nome: "Férias escolares", tipo: "Sazonal", nichos: ["turismo", "hotelaria", "educacao"] },
  { inicio: "2027-08-08", nome: "Dia dos Pais", tipo: "Comercial", nichos: ["gastronomia", "hotelaria", "servicos"] },
  { inicio: "2027-08-11", nome: "Dia do Advogado", tipo: "Profissão", nichos: ["servicos"] },
  { inicio: "2027-08-27", nome: "Dia do Corretor de Imóveis", tipo: "Profissão", nichos: ["imobiliario"] },
  { inicio: "2027-09-07", nome: "Independência (feriado)", tipo: "Feriado", nichos: ["turismo", "hotelaria"] },
  { inicio: "2027-09-15", nome: "Dia do Cliente", tipo: "Comercial", nichos: [T] },
  { inicio: "2027-09-21", nome: "Dia da Árvore", tipo: "Natureza", nichos: ["turismo", "imobiliario", "educacao"] },
  { inicio: "2027-09-23", nome: "Início da primavera (equinócio)", tipo: "Natureza", nichos: ["eventos", "estetica", "turismo"] },
  { inicio: "2027-09-01", fim: "2027-09-30", nome: "Setembro Amarelo", tipo: "Conscientização", nichos: ["saude"] },
  { inicio: "2027-10-01", fim: "2027-10-31", nome: "Outubro Rosa", tipo: "Conscientização", nichos: ["saude", "estetica"] },
  { inicio: "2027-10-01", fim: "2028-01-31", nome: "Temporada de matrículas", tipo: "Sazonal", nichos: ["educacao"] },
  { inicio: "2027-10-12", nome: "Dia das Crianças e N. Sra. Aparecida", tipo: "Comercial", nichos: ["educacao", "odontologia", "gastronomia", "turismo"] },
  { inicio: "2027-10-15", nome: "Dia do Professor", tipo: "Profissão", nichos: ["educacao"] },
  { inicio: "2027-10-18", nome: "Dia do Médico", tipo: "Profissão", nichos: ["saude"] },
  { inicio: "2027-10-25", nome: "Dia do Dentista", tipo: "Profissão", nichos: ["odontologia"] },
  { inicio: "2027-11-01", fim: "2027-11-30", nome: "Novembro Azul", tipo: "Conscientização", nichos: ["saude"] },
  { inicio: "2027-11-26", nome: "Black Friday", tipo: "Comercial", nichos: [T] },
  { inicio: "2027-12-25", nome: "Natal", tipo: "Comercial", nichos: [T] },
].sort((a, b) => a.inicio.localeCompare(b.inicio));

// Comece a divulgar de 2 a 3 semanas antes de cada data comercial.
export const DIAS_ANTECEDENCIA = 21;

export function valeParaNicho(data, nicho) {
  return data.nichos.includes(T) || data.nichos.includes(nicho);
}

// Datas que tocam o intervalo [de, ate] (strings AAAA-MM-DD).
export function datasNoPeriodo(de, ate, nicho = null) {
  return CALENDARIO.filter((d) => {
    const fim = d.fim || d.inicio;
    const dentro = d.inicio <= ate && fim >= de;
    return dentro && (!nicho || valeParaNicho(d, nicho));
  });
}
