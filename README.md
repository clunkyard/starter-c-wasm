# A Clunkyard robot in c-wasm

Edit `bot.c`, build, play a real match and read its replay. This is the same starter used by Clunkyard's online editor, on SDK 2.0.0 and protocol 2.

## Start locally

Install Node 20+ and your existing language tools: `clang`, `wasm-ld`. Native SDK assets require Linux x86-64 and glibc 2.39+ (Ubuntu 24.04+ or WSL2 Ubuntu 24.04+). Other native platforms are not yet qualified.

```sh
git clone https://github.com/clunkyard/starter-c-wasm.git
cd starter-c-wasm
make doctor
make
make match
make replay
```

Without Make, use `node clunkyard.cjs build`, `match` and `replay` (also available through `npm run`). The first build downloads the checksum-pinned local engine (6.7MiB) and only this language's SDK (11.11MiB). It installs into ignored `.clunkyard/`; it does not download a toolchain or require Docker, an account, root access or the all-language builder. An existing matching installation can be selected with `CLUNKYARD_SDK`. Compiler-specific bindings rebuild with your installed compiler.

Install Clang with the wasm32 backend and wasm-ld (the lld package on Ubuntu). No WASI sysroot is needed.

Read the [language binding guide](https://clunkyard.com/sdk/wasm) for compiler versions, the official language guide and dependencies. Run `node clunkyard.cjs doctor` to check available tools. Your normal language commands remain available; `make` provides a repeatable SDK-aware build. 

## Repeat a trial

```sh
node clunkyard.cjs match 42 2d classic
node clunkyard.cjs match 77 3d zero-g
node clunkyard.cjs replay replays/trial-42.json
```

Keep a baseline commit. Repeat several seeds/rulesets and inspect contacts, battery, aim, hits and eliminations. Local programs run as your user; these are compatibility and tactic trials, not authoritative hosted CPU measurements.

## Play online

Create or copy a bot at [clunkyard.com](https://clunkyard.com). To use ordinary Git pushes, create your own repository from this template, install/connect Clunkyard's GitHub integration in My bots, select that repository/ref and import its root. Commit and push changes to that ref: the integration saves an immutable revision and queues its build. Start an arena trial and inspect the revision-linked replay. Save browser changes before syncing and resolve any source conflict explicitly. Keep SDK downloads/output in ignored `.clunkyard/` and never commit access tokens.

The managed private Artifacts repository is not exposed as a raw Git remote in this release. Owner Git credentials and direct clone/push are a separate application feature. [WebDAV](https://clunkyard.com/manual#local-development) remains another editor option.

[API and adapters](https://clunkyard.com/sdk) · [Local trials](https://clunkyard.com/sdk/local-trials) · [Game manual](https://clunkyard.com/manual)
