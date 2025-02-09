import { exit } from "node:process";
import { log, error } from "node:console";
import { $, chalk, within } from "zx";

(async () => {
  log(chalk.bgGreenBright("Building..."));

  log(chalk.bgGreenBright("Making sure submodules are up to date..."));
  await $`git submodule update --init --recursive`;

  log(chalk.bgGreenBright("Checking for tinygo..."));
  const version = await $`tinygo version`.catch(async (err) => {
    log(chalk.bgRedBright("tinygo not found!"));
    exit(1);
  });
  log(version.stdout.trim());

  log(chalk.bgGreenBright("Building hcl2json..."));
  await within(async () => {
    $.cwd = "hcl2json";
    await $`tinygo build -target=wasi -o hcl2json.wasm main.go`;
    log(chalk.bgGreenBright("Built hcl2json!"));
    await $`mv hcl2json.wasm ..`;
  });

  log(chalk.bgGreenBright("Building tree-sitter-hcl..."));
  await within(async () => {
    $.cwd = "tree-sitter-hcl";
    await $`npm install`;
    await $`npx tree-sitter generate`;
    log(chalk.bgGreenBright("Built tree-sitter-hcl!"));
    await $`cp docs/vendor/tree-sitter.wasm docs/tree-sitter-hcl.wasm ..`;
    await $`git checkout -- .`;
  });
})()
  .catch((e) => {
    error(chalk.bgRedBright("Build failed!"));
    error(e);
    exit(1);
  })
  .then(() => {
    log(chalk.bgGreenBright("Build succeeded!"));
  });
