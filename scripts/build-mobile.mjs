import { spawn } from "node:child_process";
import { access, rename } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const apiDir = path.join(cwd, "app", "api");
const parkedApiDir = path.join(cwd, "app", "__api_server_only__");

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

let moved = false;
try {
  if (await exists(parkedApiDir)) {
    throw new Error(`Expected ${parkedApiDir} to not exist before mobile build`);
  }

  if (await exists(apiDir)) {
    await rename(apiDir, parkedApiDir);
    moved = true;
  }

  await run("npx", ["next", "build"]);
  await run("npx", ["cap", "sync"]);
} finally {
  if (moved && (await exists(parkedApiDir))) {
    await rename(parkedApiDir, apiDir);
  }
}
