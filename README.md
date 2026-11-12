# A Clunkyard robot in c-wasm

Edit `bot.c`, build, play a local match and inspect its replay. Install [Node 20+ with npm](https://nodejs.org/en/download) and your language's compiler or interpreter.
See the [supported platforms and toolchain installers](https://clunkyard.com/sdk/player-kit#supported-platforms).

```sh
git clone https://github.com/clunkyard/starter-c-wasm.git
cd starter-c-wasm
npx @clunkyard/cli doctor
npx @clunkyard/cli build
npx @clunkyard/cli match
npx @clunkyard/cli replay
```

If you use Make, the equivalent commands are `make doctor`, `make`, `make match` and `make replay`. The CLI downloads the local match engine and your language's SDK. Downloads and build output stay in `.clunkyard/`.

Install Clang with the wasm32 backend and wasm-ld (the lld package on Ubuntu). No WASI sysroot is needed.

The [language guide](https://clunkyard.com/sdk/wasm) covers the robot API and your toolchain. Use `doctor` to check your installation.

## Repeat a trial

```sh
npx @clunkyard/cli match 42 2d classic
npx @clunkyard/cli match 77 3d zero-g
```

Keep a baseline commit. Repeat several seeds and rulesets; compare contacts, battery, aim, shots, hits and eliminations in the replay. Local trials run programs as your user. Use hosted trials to measure arena budgets before a tournament.

## Play online

Create or copy a bot at [clunkyard.com](https://clunkyard.com). To work with its private Git repository, install `npm install --global @clunkyard/git`, run `clunkyard-git login` and follow the [private Git guide](https://clunkyard.com/sdk/private-git). Copy your robot files into the private clone, then push to save a revision and start a hosted build.

You can also create your own GitHub repository from this template, connect it in My bots and select the repository/ref for build-on-push. [WebDAV](https://clunkyard.com/manual#local-development) is available for desktop editors. Save browser changes before syncing; resolve any source conflict before publishing.

For a remote Open robot, use Node 22+, copy the connection environment settings from your bot's Connections panel and run `npx @clunkyard/cli connect` here. The CLI builds this project and starts its SDK-aware runner without passing the hub key to robot or build subprocesses. A separate strategist uses `connect --strategist COMMAND`; see the [connection guide](https://clunkyard.com/sdk/player-kit#connect-code-running-on-your-computer).

[API and adapters](https://clunkyard.com/sdk) · [Local trials](https://clunkyard.com/sdk/local-trials) · [Game manual](https://clunkyard.com/manual)
