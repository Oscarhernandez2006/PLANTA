import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { ClientModule } from './modules/client/client.module';
import { ClienteModule } from './modules/cliente/cliente.module';
import { ConductorModule } from './modules/conductor/conductor.module';
import { DeviceModule } from './modules/device/device.module';
import { DispatchOrderModule } from './modules/dispatch-order/dispatch-order.module';
import { GoodsReceiptModule } from './modules/goods-receipt/goods-receipt.module';
import { PesoCamionModule } from './modules/peso-camion/peso-camion.module';
import { PesoEnPieModule } from './modules/peso-en-pie/peso-en-pie.module';
import { InsensibilizacionModule } from './modules/insensibilizacion/insensibilizacion.module';
import { ProcedenciaModule } from './modules/procedencia/procedencia.module';
import { ProveedorModule } from './modules/proveedor/proveedor.module';
import { SupplierModule } from './modules/supplier/supplier.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    AuthModule,
    DeviceModule,
    ClientModule,
    ClienteModule,
    ConductorModule,
    DispatchOrderModule,
    GoodsReceiptModule,
    PesoCamionModule,
    PesoEnPieModule,
    InsensibilizacionModule,
    ProcedenciaModule,
    ProveedorModule,
    SupplierModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
