import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DatabaseModule } from "../database/database.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      global: false,
      secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      signOptions: { expiresIn: "15m" },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
