import { hc } from "hono/client";
import { ApiClientType } from "@allegretto-network/api/rpc";

export type ApiClient = ReturnType<typeof hc<ApiClientType>>;
