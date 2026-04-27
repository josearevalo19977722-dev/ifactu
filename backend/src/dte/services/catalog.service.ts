import { Injectable } from '@nestjs/common';

@Injectable()
export class CatalogService {
  private readonly documentTypes = {
    '01': 'Factura',
    '03': 'Comprobante de Crédito Fiscal',
    '04': 'Nota de Remisión',
    '05': 'Nota de Crédito',
    '06': 'Nota de Débito',
    '07': 'Comprobante de Retención',
    '08': 'Comprobante de Liquidación',
    '09': 'Documento Contable de Liquidación',
    '11': 'Factura de Exportación',
    '14': 'Factura de Sujeto Excluido',
    '15': 'Comprobante de Donación',
  };

  private readonly units = {
    '1': 'Metro',
    '2': 'Yarda',
    '6': 'Milimetro',
    '9': 'Kilometro cuadrado',
    '10': 'Hectarea',
    '13': 'Metro cuadrado',
    '15': 'Vara cuadrada',
    '18': 'Metro cubico',
    '20': 'Barril',
    '22': 'Galon',
    '23': 'Litro',
    '24': 'Botella',
    '26': 'Mililitro',
    '30': 'Tonelada',
    '32': 'Quintal',
    '33': 'Arroba',
    '34': 'Kilogramo',
    '36': 'Libra',
    '37': 'Onza troy',
    '38': 'Onza',
    '39': 'Gramo',
    '40': 'Miligramo',
    '42': 'Megawatt',
    '43': 'Kilowatt',
    '44': 'Watt',
    '45': 'Megavoltio-amperio',
    '46': 'Kilovoltio-amperio',
    '47': 'Voltio-amperio',
    '49': 'Gigawatt-hora',
    '50': 'Megawatt-hora',
    '51': 'Kilowatt-hora',
    '52': 'Watt-hora',
    '53': 'Kilovoltio',
    '54': 'Voltio',
    '55': 'Millar',
    '56': 'Medio millar',
    '57': 'Ciento',
    '59': 'Unidad',
    '58': 'Docena',
    '99': 'Otra',
  };

  private readonly invalidationTypes = {
    '1': 'Error en la información del documento',
    '2': 'Rescindir operación (Devolución total)',
    '3': 'Otro',
  };

  private readonly paymentModes = {
    '01': 'Billetes y monedas',
    '02': 'Tarjeta Debito',
    '03': 'Tarjeta Credito',
    '04': 'Cheque',
    '05': 'Transferencia-Deposito Bancario',
    '08': 'Dinero electronico',
    '09': 'Monedero electronico',
    '11': 'Bitcoin',
    '12': 'Otras Criptomonedas',
    '13': 'Cuentas por pagar del receptor',
    '14': 'Giro bancario',
    '99': 'Otros',
  };

  getDocType(code: string): string {
    return this.documentTypes[code] || 'Desconocido';
  }

  getUnit(code: string | number): string {
    return this.units[String(code)] || 'Unidad';
  }

  getInvalidationDetail(code: string | number): string {
    return this.invalidationTypes[String(code)] || 'Otro';
  }

  getPaymentMode(code: string): string {
    return this.paymentModes[code] || 'Otros';
  }
}
