import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { problemDetails } from "hono-problem-details";
import { problemDetailsResponse } from "hono-problem-details/openapi";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { Env } from "../env";
import { requirePrivyUser } from "../lib/privy";
import { uploadStorageOutputSchema } from "../schemas/storage";

// Uploads only: the Worker names every pin with a server-generated UUIDv7 —
// clients never control anything QuickNode-side — and downloads never touch
// this API: the public gateway serves bytes by CID, so no resolution or
// download route exists here.

// Every authenticated user can pin through the shared paid QuickNode account,
// so uploads are capped before the body is read. 50 MiB comfortably covers
// job deliverables (documents, code, reports) while bounding the damage a
// single request can do to storage spend and Worker memory.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const uploadStorageRoute = createRoute({
  method: "post",
  path: "/",
  responses: {
    201: {
      description: "Pinned",
      content: { "application/json": { schema: uploadStorageOutputSchema } },
    },
    400: problemDetailsResponse(400),
    401: problemDetailsResponse(401),
    413: problemDetailsResponse(413),
    502: problemDetailsResponse(502),
  },
});

const quicknodeUploadSchema = z.object({
  pin: z.object({ cid: z.string().min(1) }),
});

export const storageHandlers = new OpenAPIHono<Env>().openapi(uploadStorageRoute, async (c) => {
  await requirePrivyUser(c);
  const name = uuidv7();

  // Chunked requests can lie about Content-Length, so the declared size is
  // only a fast precheck; the authoritative check runs once the body is read.
  const contentLength = Number(c.req.header("Content-Length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) throw tooLarge(contentLength);

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0)
    throw problemDetails({
      status: 400,
      title: "Bad request",
      detail: "The request body is empty.",
      type: "Storage",
    });
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw tooLarge(bytes.byteLength);

  const form = new FormData();
  form.append("Body", new Blob([bytes]), name);
  form.append("Key", name);
  form.append("ContentType", "application/octet-stream");

  const response = await fetch(
    `${c.env.QUICKNODE_IPFS_API_URL.replace(/\/+$/, "")}/v1/s3/put-object`,
    { method: "POST", headers: { "x-api-key": c.env.QUICKNODE_IPFS_API_KEY }, body: form },
  ).catch(() => null);
  if (response === null || !response.ok)
    throw problemDetails({
      status: 502,
      title: "Bad gateway",
      detail: "QuickNode rejected the upload.",
      type: "Storage",
    });

  const result = quicknodeUploadSchema.safeParse(await response.json().catch(() => null));
  if (!result.success)
    throw problemDetails({
      status: 502,
      title: "Bad gateway",
      detail: "QuickNode returned an unreadable upload response.",
      type: "Storage",
    });

  return c.json({ cid: result.data.pin.cid, name }, 201);
});

function tooLarge(size: number) {
  return problemDetails({
    status: 413,
    title: "Payload too large",
    detail: `The upload is ${size} bytes; the limit is ${MAX_UPLOAD_BYTES}.`,
    type: "Storage",
  });
}
