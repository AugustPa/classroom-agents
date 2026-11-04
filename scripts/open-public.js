#!/usr/bin/env node
/**
 * Start the lab if needed, then open a Cloudflare quick tunnel so students
 * can join from any network. Prints the student link and the lecturer key.
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const root = path.join(__dirname, "..");
const keyFile = path.join(root, ".lecturer-key");

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(0));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(0);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postJson(pathname, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", () => resolve(0));
    req.write(payload);
    req.end();
  });
}

async function waitHealth() {
  for (let i = 0; i < 50; i += 1) {
    if ((await get(`http://127.0.0.1:${PORT}/health`)) === 200) return true;
    await sleep(250);
  }
  return false;
}

async function main() {
  let serverChild = null;
  const already = (await get(`http://127.0.0.1:${PORT}/health`)) === 200;
  if (!already) {
    serverChild = spawn(process.execPath, ["index.js"], { cwd: root, stdio: "inherit" });
    const ok = await waitHealth();
    if (!ok) {
      console.error("The lab server did not start.");
      if (serverChild) serverChild.kill();
      process.exit(1);
    }
  } else {
    console.log(`Lab already running at http://127.0.0.1:${PORT}`);
  }

  let key = "";
  for (let i = 0; i < 20 && !key; i += 1) {
    if (fs.existsSync(keyFile)) key = fs.readFileSync(keyFile, "utf8").trim();
    if (!key) await sleep(150);
  }

  const cf = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let announced = false;
  const onData = (buf) => {
    const text = buf.toString();
    process.stderr.write(text);
    if (announced) return;
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!match) return;
    announced = true;
    const url = match[0];
    postJson("/local/public-url", { url, key }).catch(() => {});
    console.log("\n========================================");
    console.log("Students open this from any network:");
    console.log(`${url}/`);
    console.log("Dashboard (lecturer key required):");
    console.log(`${url}/admin`);
    console.log("Lecturer key:");
    console.log(key || "(printed in the server terminal as Lecturer key)");
    console.log("Leave this process running for the whole lecture.");
    console.log("========================================\n");
  };
  cf.stdout.on("data", onData);
  cf.stderr.on("data", onData);
  cf.on("exit", (code) => {
    if (serverChild) serverChild.kill();
    process.exit(code || 0);
  });

  const stop = () => {
    cf.kill("SIGTERM");
    if (serverChild) serverChild.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
