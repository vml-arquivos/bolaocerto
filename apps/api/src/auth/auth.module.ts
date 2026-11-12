import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { SuperAdminGuard } from './superadmin.guard';
import { AccessService } from '../access/access.service';
import { AccessController } from '../access/access.controller';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({}),
    }),
  ],
  controllers: [AuthController, AccessController],
  providers: [PrismaService, AuthService, JwtAuthGuard, RolesGuard, SuperAdminGuard, AccessService],
  exports: [JwtModule, AuthService, JwtAuthGuard, RolesGuard, SuperAdminGuard, AccessService],
})
export class AuthModule {}
