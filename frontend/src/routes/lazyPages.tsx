import { lazy } from 'react';

export const Dashboard = lazy(() =>
  import('../pages/dashboard/Dashboard').then(m => ({ default: m.Dashboard })),
);
export const DteList = lazy(() =>
  import('../pages/dtes/DteList').then(m => ({ default: m.DteList })),
);
export const DteDetalle = lazy(() =>
  import('../pages/dtes/DteDetalle').then(m => ({ default: m.DteDetalle })),
);
export const NuevoCf = lazy(() =>
  import('../pages/cf/NuevoCf').then(m => ({ default: m.NuevoCf })),
);
export const NuevoCcf = lazy(() =>
  import('../pages/ccf/NuevoCcf').then(m => ({ default: m.NuevoCcf })),
);
export const NuevaNre = lazy(() =>
  import('../pages/nre/NuevaNre').then(m => ({ default: m.NuevaNre })),
);
export const NuevaFexe = lazy(() =>
  import('../pages/fexe/NuevaFexe').then(m => ({ default: m.NuevaFexe })),
);
export const Contingencia = lazy(() =>
  import('../pages/contingencia/Contingencia').then(m => ({ default: m.Contingencia })),
);
export const NuevaRetencion = lazy(() =>
  import('../pages/retencion/NuevaRetencion').then(m => ({ default: m.NuevaRetencion })),
);
export const NuevaFse = lazy(() =>
  import('../pages/fse/NuevaFse').then(m => ({ default: m.NuevaFse })),
);
export const NuevaDonacion = lazy(() =>
  import('../pages/donacion/NuevaDonacion').then(m => ({ default: m.NuevaDonacion })),
);
export const Reportes = lazy(() =>
  import('../pages/reportes/Reportes').then(m => ({ default: m.Reportes })),
);
export const Contactos = lazy(() =>
  import('../pages/contactos/Contactos').then(m => ({ default: m.Contactos })),
);
export const Compras = lazy(() =>
  import('../pages/compras/Compras').then(m => ({ default: m.Compras })),
);
export const Inventario = lazy(() =>
  import('../pages/inventario/Inventario').then(m => ({ default: m.Inventario })),
);
export const ConfiguracionPage = lazy(() =>
  import('../pages/configuracion/ConfiguracionPage').then(m => ({ default: m.ConfiguracionPage })),
);
export const GestionCorrelativos = lazy(() =>
  import('../pages/configuracion/GestionCorrelativos').then(m => ({ default: m.GestionCorrelativos })),
);
export const WhatsappSetup = lazy(() =>
  import('../pages/configuracion/WhatsappSetup').then(m => ({ default: m.WhatsappSetup })),
);
export const TenantsPage = lazy(() =>
  import('../pages/admin/TenantsPage').then(m => ({ default: m.TenantsPage })),
);
export const UsuariosSistema = lazy(() =>
  import('../pages/admin/UsuariosSistema').then(m => ({ default: m.UsuariosSistema })),
);
export const ContingenciaGlobal = lazy(() =>
  import('../pages/admin/ContingenciaGlobal').then(m => ({ default: m.ContingenciaGlobal })),
);
export const UsuariosPage = lazy(() =>
  import('../pages/usuarios/UsuariosPage').then(m => ({ default: m.UsuariosPage })),
);
export const ConsultaPublicaPage = lazy(() =>
  import('../pages/public/ConsultaPublicaPage').then(m => ({ default: m.ConsultaPublicaPage })),
);
export const VerificarDte = lazy(() =>
  import('../pages/public/VerificarDte').then(m => ({ default: m.VerificarDte })),
);
export const SaludSistema = lazy(() =>
  import('../pages/admin/SaludSistema').then(m => ({ default: m.SaludSistema })),
);
export const MiPlanPage = lazy(() =>
  import('../pages/billing/MiPlanPage').then(m => ({ default: m.MiPlanPage })),
);
export const PagosAdmin = lazy(() =>
  import('../pages/admin/PagosAdmin').then(m => ({ default: m.PagosAdmin })),
);
