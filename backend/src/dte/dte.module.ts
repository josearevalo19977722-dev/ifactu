import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Dte } from './entities/dte.entity';
import { DteController } from './controllers/dte.controller';
import { PublicDteController } from './controllers/public-dte.controller';
import { InvalidacionController } from './controllers/invalidacion.controller';
import { CfService } from './services/cf.service';
import { CcfService } from './services/ccf.service';
import { InvalidacionService } from './services/invalidacion.service';
import { PdfService } from './services/pdf.service';
import { ConsultaMhService } from './services/consulta-mh.service';
import { NotaService } from './services/nota.service';
import { ContingenciaService } from './services/contingencia.service';
import { FexeService } from './services/fexe.service';
import { NreService } from './services/nre.service';
import { RetencionService } from './services/retencion.service';
import { FseService } from './services/fse.service';
import { DonacionService } from './services/donacion.service';
import { SignerService } from './services/signer.service';
import { TransmitterService } from './services/transmitter.service';
import { CatalogService } from './services/catalog.service';
import { TicketService } from './services/ticket.service';
import { NotificacionDteService } from './services/notificacion-dte.service';
import { CorrelativesModule } from '../correlatives/correlatives.module';
import { AuthMhModule } from '../auth-mh/auth-mh.module';
import { EmpresaModule } from '../empresa/empresa.module';
import { InventarioModule } from '../inventario/inventario.module';
import { BillingModule } from '../billing/billing.module';

import { Empresa } from '../empresa/entities/empresa.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dte, Empresa]),
    HttpModule,
    CorrelativesModule,
    AuthMhModule,
    EmpresaModule,
    InventarioModule,
    BillingModule,
  ],
  controllers: [DteController, PublicDteController, InvalidacionController],
  providers: [CfService, CcfService, InvalidacionService, PdfService, ConsultaMhService, NotaService, ContingenciaService, FexeService, NreService, RetencionService, FseService, DonacionService, SignerService, TransmitterService, CatalogService, TicketService, NotificacionDteService],
  exports: [CfService, CcfService, ConsultaMhService, TicketService, InvalidacionService, PdfService],
})
export class DteModule {}
