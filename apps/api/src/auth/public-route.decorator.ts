import { SetMetadata } from "@nestjs/common";

export const PUBLIC_ROUTE_KEY = "auth:public-route";
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
