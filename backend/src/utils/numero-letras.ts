const UNIDADES = [
  '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS',
  'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
];

const DECENAS = [
  '', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA',
  'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
];

const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

function convertirMenorMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  if (n < 20) return UNIDADES[n];

  const centena = Math.floor(n / 100);
  const decena  = Math.floor((n % 100) / 10);
  const unidad  = n % 10;

  let resultado = '';

  if (centena > 0) resultado += CENTENAS[centena];

  const resto = n % 100;
  if (resto === 0) return resultado;

  if (resultado) resultado += ' ';

  if (resto < 20) {
    resultado += UNIDADES[resto];
  } else if (unidad === 0) {
    resultado += DECENAS[decena];
  } else if (decena === 2) {
    resultado += `VEINTI${UNIDADES[unidad]}`;
  } else {
    resultado += `${DECENAS[decena]} Y ${UNIDADES[unidad]}`;
  }

  return resultado;
}

function convertirEnteroALetras(n: number): string {
  if (n === 0) return 'CERO';

  if (n < 0) return `MENOS ${convertirEnteroALetras(Math.abs(n))}`;

  let resultado = '';

  const millones  = Math.floor(n / 1_000_000);
  const miles     = Math.floor((n % 1_000_000) / 1_000);
  const restante  = n % 1_000;

  if (millones > 0) {
    resultado += millones === 1
      ? 'UN MILLÓN'
      : `${convertirMenorMil(millones)} MILLONES`;
  }

  if (miles > 0) {
    if (resultado) resultado += ' ';
    resultado += miles === 1
      ? 'MIL'
      : `${convertirMenorMil(miles)} MIL`;
  }

  if (restante > 0) {
    if (resultado) resultado += ' ';
    resultado += convertirMenorMil(restante);
  }

  return resultado;
}

/**
 * Convierte un monto numérico al formato de letras requerido por el MH.
 * Ejemplo: 1025.50 → "MIL VEINTICINCO 50/100 DOLARES"
 */
export function montoALetras(monto: number): string {
  const montoRedondeado = Math.round(monto * 100) / 100;
  const entero    = Math.floor(montoRedondeado);
  const centavos  = Math.round((montoRedondeado - entero) * 100);
  const letras    = convertirEnteroALetras(entero);
  const centStr   = String(centavos).padStart(2, '0');
  return `${letras} ${centStr}/100 DOLARES`;
}
