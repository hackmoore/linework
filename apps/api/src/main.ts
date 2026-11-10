import { createRelay } from "./relay.ts";

const port = Number(process.env.PORT ?? 8787);
const allowedOrigins = (process.env.LINEWORK_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const relay = createRelay({ allowedOrigins });
relay.server.listen(port, () => {
  console.log(
    `Linework relay listening on :${String(port)}${allowedOrigins.length > 0 ? ` for ${allowedOrigins.join(", ")}` : ""}`,
  );
});

const shutdown = (): void => {
  void relay.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
