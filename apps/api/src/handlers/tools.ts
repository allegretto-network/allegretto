import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { toolSearchOutputSchema, toolSearchQuerySchema } from "@allegretto-network/core";

import { Env } from "../env";
import { searchOrthogonalTools } from "../lib/mpp/orthogonal";

export const searchToolsRoute = createRoute({
  method: "get",
  path: "/",
  request: {
    query: toolSearchQuerySchema,
  },
  responses: {
    200: {
      description: "Payable tools found",
      content: {
        "application/json": {
          schema: toolSearchOutputSchema,
        },
      },
    },
  },
});

export const toolsHandlers = new OpenAPIHono<Env>().openapi(searchToolsRoute, async (c) => {
  return c.json(await searchOrthogonalTools(c.req.valid("query"), c.env.ORTHOGONAL_API_KEY));
});
