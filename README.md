# A Clunkyard robot in c-wasm

Edit `bot.c`, build, play a real local match and inspect its replay. Install Node 20+ with npm and your existing language tools: `clang`, `wasm-ld`.
Native SDK assets require Linux x86-64 and glibc 2.39+ (Ubuntu 24.04+ or WSL2 Ubuntu 24.04+).

```sh
git clone https://github.com/clunkyard/starter-c-wasm.git
cd starter-c-wasm
npx --yes @clunkyard/cli@2 doctor
npx --yes @clunkyard/cli@2 build
npx --yes @clunkyard/cli@2 match
npx --yes @clunkyard/cli@2 replay
```

If you use Make, the equivalent commands are `make doctor`, `make`, `make match` and `make replay`. The shared CLI downloads the checksum-pinned local engine and only this language's SDK. Downloads, build output and temporary files stay in ignored `.clunkyard/`. No account, Docker image, administrator access or all-language builder is needed.

Install Clang with the wasm32 backend and wasm-ld (the lld package on Ubuntu). No WASI sysroot is needed.

The [language guide](https://clunkyard.com/sdk/wasm) lists the adapter, official language reference and toolchain prerequisites. `doctor` checks your existing installation without downloading a compiler. Compiler-sensitive native bindings rebuild with your own toolchain.

## Repeat a trial

```sh
npx --yes @clunkyard/cli@2 match 42 2d classic
npx --yes @clunkyard/cli@2 match 77 3d zero-g
```

Keep a baseline commit. Repeat several seeds and rulesets; compare contacts, battery, aim, shots, hits and eliminations in the replay. Local trials run programs as your user. Use hosted trials to measure arena budgets before a tournament.

The CLI packages SDK 2.0.0/protocol 2 asset identities from the immutable [v2.0.0-kit.2 release](https://github.com/clunkyard/game-kit/releases/tag/v2.0.0-kit.2). `@2` receives compatible tooling fixes without copying scripts into your robot repository. To reproduce an exact tool version, use `npx --yes @clunkyard/cli@2.0.0` or set `CLUNKYARD='npx --yes @clunkyard/cli@2.0.0'` with Make. SDK/engine caches are identified by their content hashes and remain reusable across CLI updates.

## Play online

Create or copy a bot at [clunkyard.com](https://clunkyard.com). For Clunkyard's private Git remote, install `npm install --global @clunkyard/git@2.0.1`, run `clunkyard-git login` and follow the [private Git guide](https://clunkyard.com/sdk/private-git) to clone your bot. Copy tracked robot files into that private clone while keeping its own `.git` directory; do not import unrelated starter history or commit generated caches. An accepted push saves a revision and requests its hosted build.

You can also create your own GitHub repository from this template, connect it in My bots and select the repository/ref for build-on-push. [WebDAV](https://clunkyard.com/manual#local-development) is available for desktop editors. Save browser changes before syncing; resolve any source conflict before publishing.

[API and adapters](https://clunkyard.com/sdk) · [Local trials](https://clunkyard.com/sdk/local-trials) · [Game manual](https://clunkyard.com/manual)
