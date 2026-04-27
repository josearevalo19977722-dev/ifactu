export interface Municipio {
  codigo: string;
  nombre: string;
}

export interface Departamento {
  codigo: string;
  nombre: string;
  municipios: Municipio[];
}

export const CATALOG_META_TERRITORIO = {
  fuente: 'Ministerio de Hacienda SV - Catalogo Sistema de Transmision',
  version: '1.2 (10/2025)',
  actualizado: '2026-04-20',
} as const;

// CAT-012 + CAT-013 (v1.2): municipios por departamento tras ordenamiento territorial.
export const DEPARTAMENTOS: Departamento[] = [
  { codigo: '01', nombre: 'Ahuachapan', municipios: [{ codigo: '13', nombre: 'Ahuachapan Norte' }, { codigo: '14', nombre: 'Ahuachapan Centro' }, { codigo: '15', nombre: 'Ahuachapan Sur' }] },
  { codigo: '02', nombre: 'Santa Ana', municipios: [{ codigo: '14', nombre: 'Santa Ana Norte' }, { codigo: '15', nombre: 'Santa Ana Centro' }, { codigo: '16', nombre: 'Santa Ana Este' }, { codigo: '17', nombre: 'Santa Ana Oeste' }] },
  { codigo: '03', nombre: 'Sonsonate', municipios: [{ codigo: '17', nombre: 'Sonsonate Norte' }, { codigo: '18', nombre: 'Sonsonate Centro' }, { codigo: '19', nombre: 'Sonsonate Este' }, { codigo: '20', nombre: 'Sonsonate Oeste' }] },
  { codigo: '04', nombre: 'Chalatenango', municipios: [{ codigo: '34', nombre: 'Chalatenango Norte' }, { codigo: '35', nombre: 'Chalatenango Centro' }, { codigo: '36', nombre: 'Chalatenango Sur' }] },
  { codigo: '05', nombre: 'La Libertad', municipios: [{ codigo: '23', nombre: 'La Libertad Norte' }, { codigo: '24', nombre: 'La Libertad Centro' }, { codigo: '25', nombre: 'La Libertad Oeste' }, { codigo: '26', nombre: 'La Libertad Este' }, { codigo: '27', nombre: 'La Libertad Costa' }, { codigo: '28', nombre: 'La Libertad Sur' }] },
  { codigo: '06', nombre: 'San Salvador', municipios: [{ codigo: '20', nombre: 'San Salvador Norte' }, { codigo: '21', nombre: 'San Salvador Oeste' }, { codigo: '22', nombre: 'San Salvador Este' }, { codigo: '23', nombre: 'San Salvador Centro' }, { codigo: '24', nombre: 'San Salvador Sur' }] },
  { codigo: '07', nombre: 'Cuscatlan', municipios: [{ codigo: '17', nombre: 'Cuscatlan Norte' }, { codigo: '18', nombre: 'Cuscatlan Sur' }] },
  { codigo: '08', nombre: 'La Paz', municipios: [{ codigo: '23', nombre: 'La Paz Oeste' }, { codigo: '24', nombre: 'La Paz Centro' }, { codigo: '25', nombre: 'La Paz Este' }] },
  { codigo: '09', nombre: 'Cabanas', municipios: [{ codigo: '10', nombre: 'Cabanas Oeste' }, { codigo: '11', nombre: 'Cabanas Este' }] },
  { codigo: '10', nombre: 'San Vicente', municipios: [{ codigo: '14', nombre: 'San Vicente Norte' }, { codigo: '15', nombre: 'San Vicente Sur' }] },
  { codigo: '11', nombre: 'Usulutan', municipios: [{ codigo: '24', nombre: 'Usulutan Norte' }, { codigo: '25', nombre: 'Usulutan Este' }, { codigo: '26', nombre: 'Usulutan Oeste' }] },
  { codigo: '12', nombre: 'San Miguel', municipios: [{ codigo: '21', nombre: 'San Miguel Norte' }, { codigo: '22', nombre: 'San Miguel Centro' }, { codigo: '23', nombre: 'San Miguel Oeste' }] },
  { codigo: '13', nombre: 'Morazan', municipios: [{ codigo: '27', nombre: 'Morazan Norte' }, { codigo: '28', nombre: 'Morazan Sur' }] },
  { codigo: '14', nombre: 'La Union', municipios: [{ codigo: '19', nombre: 'La Union Norte' }, { codigo: '20', nombre: 'La Union Sur' }] },
];

const DISTRITOS_POR_MUNICIPIO: Record<string, string[]> = {
  'AHUACHAPAN NORTE': ['Atiquizaya', 'El Refugio', 'San Lorenzo', 'Turin'],
  'AHUACHAPAN CENTRO': ['Ahuachapan', 'Apaneca', 'Concepcion de Ataco', 'Tacuba'],
  'AHUACHAPAN SUR': ['Guaymango', 'Jujutla', 'San Francisco Menendez', 'San Pedro Puxtla'],
  'SANTA ANA NORTE': ['Masahuat', 'Metapan', 'Santa Rosa Guachipilin', 'Texistepeque'],
  'SANTA ANA CENTRO': ['Santa Ana'],
  'SANTA ANA ESTE': ['Coatepeque', 'El Congo'],
  'SANTA ANA OESTE': ['Candelaria de la Frontera', 'Chalchuapa', 'El Porvenir', 'San Antonio Pajonal', 'San Sebastian Salitrillo', 'Santiago de La Frontera'],
  'SONSONATE NORTE': ['Juayua', 'Nahuizalco', 'Salcoatitan', 'Santa Catarina Masahuat'],
  'SONSONATE CENTRO': ['Sonsonate', 'Sonzacate', 'Nahulingo', 'San Antonio del Monte', 'Santo Domingo de Guzman'],
  'SONSONATE ESTE': ['Izalco', 'Armenia', 'Caluco', 'San Julian', 'Cuisnahuat', 'Santa Isabel Ishuatan'],
  'SONSONATE OESTE': ['Acajutla'],
  'CHALATENANGO NORTE': ['La Palma', 'Citala', 'San Ignacio'],
  'CHALATENANGO CENTRO': ['Nueva Concepcion', 'Tejutla', 'La Reina', 'Agua Caliente', 'Dulce Nombre de Maria', 'El Paraiso', 'San Francisco Morazan', 'San Rafael', 'Santa Rita', 'San Fernando'],
  'CHALATENANGO SUR': ['Chalatenango', 'Arcatao', 'Azacualpa', 'Comalapa', 'Concepcion Quezaltepeque', 'El Carrizal', 'La Laguna', 'Las Vueltas', 'Nombre de Jesus', 'Nueva Trinidad', 'Ojos de Agua', 'Potonico', 'San Antonio de La Cruz', 'San Antonio Los Ranchos', 'San Francisco Lempa', 'San Isidro Labrador', 'San Jose Cancasque', 'San Miguel de Mercedes', 'San Jose Las Flores', 'San Luis del Carmen'],
  'LA LIBERTAD NORTE': ['Quezaltepeque', 'San Matias', 'San Pablo Tacachico'],
  'LA LIBERTAD CENTRO': ['San Juan Opico', 'Ciudad Arce'],
  'LA LIBERTAD OESTE': ['Colon', 'Jayaque', 'Sacacoyo', 'Tepecoyo', 'Talnique'],
  'LA LIBERTAD ESTE': ['Antiguo Cuscatlan', 'Huizucar', 'Nuevo Cuscatlan', 'San Jose Villanueva', 'Zaragoza'],
  'LA LIBERTAD COSTA': ['Chiltiupan', 'Jicalapa', 'La Libertad', 'Tamanique', 'Teotepeque'],
  'LA LIBERTAD SUR': ['Comasagua', 'Santa Tecla'],
  'SAN SALVADOR NORTE': ['Aguilares', 'El Paisnal', 'Guazapa'],
  'SAN SALVADOR OESTE': ['Apopa', 'Nejapa'],
  'SAN SALVADOR ESTE': ['Ilopango', 'San Martin', 'Soyapango', 'Tonacatepeque'],
  'SAN SALVADOR CENTRO': ['Ayutuxtepeque', 'Mejicanos', 'San Salvador', 'Cuscatancingo', 'Ciudad Delgado'],
  'SAN SALVADOR SUR': ['Panchimalco', 'Rosario de Mora', 'San Marcos', 'Santo Tomas', 'Santiago Texacuangos'],
  'CUSCATLAN NORTE': ['Suchitoto', 'San Jose Guayabal', 'Oratorio de Concepcion', 'San Bartolome Perulapia', 'San Pedro Perulapan'],
  'CUSCATLAN SUR': ['Cojutepeque', 'San Rafael Cedros', 'Candelaria', 'Monte San Juan', 'El Carmen', 'San Cristobal', 'Santa Cruz Michapa', 'San Ramon', 'El Rosario', 'Santa Cruz Analquito', 'Tenancingo'],
  'LA PAZ OESTE': ['Cuyultitan', 'Olocuilta', 'San Juan Talpa', 'San Luis Talpa', 'San Pedro Masahuat', 'Tapalhuaca', 'San Francisco Chinameca'],
  'LA PAZ CENTRO': ['El Rosario', 'Jerusalen', 'Mercedes La Ceiba', 'Paraiso de Osorio', 'San Antonio Masahuat', 'San Emigdio', 'San Juan Tepezontes', 'San Luis La Herradura', 'San Miguel Tepezontes', 'San Pedro Nonualco', 'Santa Maria Ostuma', 'Santiago Nonualco'],
  'LA PAZ ESTE': ['San Juan Nonualco', 'San Rafael Obrajuelo', 'Zacatecoluca'],
  'CABANAS OESTE': ['Ilobasco', 'Tejutepeque', 'Jutiapa', 'Cinquera'],
  'CABANAS ESTE': ['Sensuntepeque', 'Victoria', 'Dolores', 'Guacotecti', 'San Isidro'],
  'SAN VICENTE NORTE': ['Apastepeque', 'Santa Clara', 'San Ildefonso', 'San Esteban Catarina', 'San Sebastian', 'San Lorenzo', 'Santo Domingo'],
  'SAN VICENTE SUR': ['San Vicente', 'Guadalupe', 'Verapaz', 'Tepetitan', 'Tecoluca', 'San Cayetano Istepeque'],
  'USULUTAN NORTE': ['Santiago de Maria', 'Alegria', 'Berlin', 'Mercedes Umana', 'Jucuapa', 'El Triunfo', 'Estanzuelas', 'San Buenaventura', 'Nueva Granada'],
  'USULUTAN ESTE': ['Usulutan', 'Jucuaran', 'San Dionisio', 'Concepcion Batres', 'Santa Maria', 'Ozatlan', 'Tecapan', 'Santa Elena', 'California', 'Ereguayquin'],
  'USULUTAN OESTE': ['Jiquilisco', 'Puerto El Triunfo', 'San Agustin', 'San Francisco Javier'],
  'SAN MIGUEL NORTE': ['Ciudad Barrios', 'Sesori', 'Nuevo Eden de San Juan', 'San Gerardo', 'San Luis de La Reina', 'Carolina', 'San Antonio del Mosco', 'Chapeltique'],
  'SAN MIGUEL CENTRO': ['San Miguel', 'Comacaran', 'Uluazapa', 'Moncagua', 'Quelepa', 'Chirilagua'],
  'SAN MIGUEL OESTE': ['Chinameca', 'Nueva Guadalupe', 'Lolotique', 'San Jorge', 'San Rafael Oriente', 'El Transito'],
  'MORAZAN NORTE': ['Arambala', 'Cacaopera', 'Corinto', 'El Rosario', 'Joateca', 'Jocoaitique', 'Meanguera', 'Perquin', 'San Fernando', 'San Isidro', 'Torola'],
  'MORAZAN SUR': ['Chilanga', 'Delicias de Concepcion', 'El Divisadero', 'Gualococti', 'Guatajiagua', 'Jocoro', 'Lolotiquillo', 'Osicala', 'San Carlos', 'San Francisco Gotera', 'San Simon', 'Sensembra', 'Sociedad', 'Yamabal', 'Yoloaiquin'],
  'LA UNION NORTE': ['Anamoros', 'Bolivar', 'Concepcion de Oriente', 'El Sauce', 'Lislique', 'Nueva Esparta', 'Pasaquina', 'Poloros', 'San Jose La Fuente', 'Santa Rosa de Lima'],
  'LA UNION SUR': ['Conchagua', 'El Carmen', 'Intipuca', 'La Union', 'Meanguera del Golfo', 'San Alejo', 'Yayantique', 'Yucuaiquin'],
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export function getMunicipios(codigoDepartamento: string): Municipio[] {
  return DEPARTAMENTOS.find((d) => d.codigo === codigoDepartamento)?.municipios ?? [];
}

export function getDistritos(codigoDepartamento: string, codigoMunicipio: string): string[] {
  const muni = getMunicipios(codigoDepartamento).find((m) => m.codigo === codigoMunicipio);
  if (!muni) return [];
  return DISTRITOS_POR_MUNICIPIO[normalize(muni.nombre)] ?? [];
}
