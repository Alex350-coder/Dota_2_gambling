import https from "node:https";
import { readFileSync } from "node:fs";
import path from "node:path";
import next from "next";

const port = Number(process.env.PORT ?? 3000);
const certDir = path.join(process.cwd(), ".e2e-certs");

async function main(): Promise<void> {
  const app = next({ dev: false });
  const handle = app.getRequestHandler();

  await app.prepare();

  https
    .createServer(
      {
        key: readFileSync(path.join(certDir, "key.pem")),
        cert: readFileSync(path.join(certDir, "cert.pem")),
      },
      (req, res) => {
        handle(req, res);
      },
    )
    .listen(port, () => {
      console.log(`> E2E HTTPS server ready on https://localhost:${String(port)}`);
    });
}

void main();
