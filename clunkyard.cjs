#!/usr/bin/env node
'use strict';

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {extract}=require('./clunkyard-archive.cjs');
const root=__dirname, cache=path.join(root,'.clunkyard'),lock=require('./clunkyard.lock.json');
const engine=path.join(cache,'engine'),sdk=process.env.CLUNKYARD_SDK||path.join(cache,'sdk');
const manifest=()=>JSON.parse(fs.readFileSync(path.join(root,'bot.json'),'utf8'));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const skip=new Set(['.git','.clunkyard','build','replays','node_modules','__pycache__','obj','bin']);

function run(command, args, options={}) {
  const result=spawnSync(command,args,{cwd:root,env:environment(),stdio:'inherit',...options});
  if(result.error)throw new Error(`${command}: ${result.error.message}. See README.md for this language's toolchain.`);
  if(result.status!==0)throw new Error(`${command} exited with status ${result.status}`);
  return result;
}
function environment() {
  const paths=[path.join(sdk,'lib'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);
  return {...process.env,CLUNKYARD_SDK:sdk,CLUNKYARD_PROJECT:root,CLUNKYARD_LIB:path.join(sdk,'lib','libclunkyard.so.2'),LD_LIBRARY_PATH:paths,
    TMPDIR:path.join(cache,'tmp'),NODE_PATH:path.join(sdk,'bindings','javascript'),
    DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'};
}
function safeCache() {
  if(fs.existsSync(cache)&&(!fs.lstatSync(cache).isDirectory()||fs.lstatSync(cache).isSymbolicLink()))throw new Error('.clunkyard must be an ordinary directory');
  fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(path.join(cache,'tmp'),{recursive:true});
}
async function download(asset, destination) {
  if(fs.existsSync(destination)) {
    if(fs.readFileSync(path.join(destination,'.release'),'utf8')===asset.sha256)return;
    throw new Error(`${destination} belongs to another release. Remove it explicitly before changing SDK versions.`);
  }
  let bytes;
  if(process.env.CLUNKYARD_RELEASE_DIRECTORY)bytes=fs.readFileSync(path.join(process.env.CLUNKYARD_RELEASE_DIRECTORY,asset.file));
  else {
    const response=await fetch(asset.url,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error(`Download failed (${response.status}): ${asset.url}`);
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>asset.bytes)throw new Error('Release download exceeds its recorded size');chunks.push(chunk);}
    bytes=Buffer.concat(chunks,size);
  }
  if(bytes.length!==asset.bytes||sha(bytes)!==asset.sha256)throw new Error(`Release checksum mismatch: ${asset.file}`);
  const temporary=fs.mkdtempSync(path.join(cache,'install-'));
  try{extract(bytes,temporary,asset.expandedBytes);fs.writeFileSync(path.join(temporary,'.release'),asset.sha256);fs.renameSync(temporary,destination);}finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
async function setup() {
  safeCache();
  if(!lock.portable&&(process.platform!=='linux'||process.arch!=='x64'))throw new Error('This native SDK release supports Linux x86-64 (Ubuntu 24.04+/WSL2). Use JavaScript/Vane/Cadence/Glyph for the portable Node route; other native platforms are not yet qualified.');
  await download(lock.engine,engine);
  if(!process.env.CLUNKYARD_SDK)await download(lock.sdk,sdk);
  else if(fs.readFileSync(path.join(sdk,'VERSION'),'utf8').trim()!==lock.sdkVersion)throw new Error('CLUNKYARD_SDK points to another SDK version');
}
function worker(project=root) {
  Object.assign(process.env,environment());
  process.env.CLUNKYARD_PROJECT=project;
  const file=path.join(engine,'sandbox','worker.js');delete require.cache[require.resolve(file)];return require(file);
}
function rewrite(value) {return value.replaceAll('/opt/arena/libexec/wasm-host',path.join(sdk,'bin','wasm-host')).replaceAll('/opt/arena/',`${engine}/`).replaceAll('/opt/wasmtime/',`${sdk}/`);}
function sources(from,to) {
  fs.mkdirSync(to,{recursive:true});
  for(const entry of fs.readdirSync(from,{withFileTypes:true})){
    if(skip.has(entry.name))continue;
    const input=path.join(from,entry.name),output=path.join(to,entry.name);
    if(entry.isDirectory())sources(input,output);else if(entry.isFile())fs.copyFileSync(input,output);
  }
}
function rebuildBinding() {
  // Compiler-specific artefacts are rebuilt by the player's own compiler.
  // This downloads no compiler and keeps native modules compatible locally.
  for(const binding of lock.rebuildBindings||[]){
    const directory=path.join(sdk,'binding-src',binding);
    run('make',['-C',directory,'install',`SDK=${sdk}`,`ROOT=${engine}`,`BUILD=${path.join(cache,'tmp','binding-'+binding)}`]);
  }
}
async function build() {
  await setup();const m=manifest(),out=path.join(cache,'build');fs.mkdirSync(out,{recursive:true});
  const bindingStamp=path.join(cache,'bindings-ready');
  if(!fs.existsSync(bindingStamp)||fs.readFileSync(bindingStamp,'utf8')!==lock.sdk.sha256){rebuildBinding();fs.writeFileSync(bindingStamp,lock.sdk.sha256);}
  const copied=path.join(cache,'source');fs.rmSync(copied,{recursive:true,force:true});sources(root,copied);
  const action=worker(copied).command(m.language,path.join(copied,m.entry),out,m);
  if(action){const steps=Array.isArray(action[0])?action:[action];for(const step of steps){const args=step.map(rewrite);if(m.language==='c')args[0]=process.env.CC||'cc';if(m.language==='cpp')args[0]=process.env.CXX||'c++';run(args[0],args.slice(1),{cwd:copied});}}
  const runtimeSource=path.join(out,'source');fs.rmSync(runtimeSource,{recursive:true,force:true});sources(copied,runtimeSource);
  fs.writeFileSync(path.join(cache,'local-bot.json'),JSON.stringify({...m,command:[process.execPath,path.join(root,'clunkyard.cjs'),'stdio']},null,2)+'\n');
  console.log(`Built ${m.name}. Run make match or node clunkyard.cjs match.`);
}
function stdio() {
  const m=manifest(),out=path.join(cache,'build'),entry=path.join(out,'source',m.entry);
  let command=worker().runCommand(m.language,path.join(root,m.entry),out,m);
  if(['javascript','typescript'].includes(m.language))command=[process.execPath,m.language==='typescript'?path.join(out,m.entry.replace(/\.ts$/,'.js')):entry];
  if(m.language==='julia')command=['julia','--startup-file=no',entry];
  if(m.language==='php')command=['php','-d','ffi.enable=true','-d',`include_path=${sdk}/bindings/php`,entry];
  const julia=m.language==='julia'?{JULIA_LOAD_PATH:`${sdk}/bindings/julia${path.delimiter}@stdlib`,JULIA_DEPOT_PATH:path.join(cache,'julia-depot'),OPENBLAS_NUM_THREADS:'1'}:{};
  const values=command.map(rewrite);run(values[0],values.slice(1),{env:{...environment(),...julia}});
}
async function match(args) {
  await build();const seed=args[0]||'42',mode=args[1]||'2d',ruleset=args[2]||(mode==='3d'?'zero-g':'classic');
  fs.mkdirSync(path.join(root,'replays'),{recursive:true});
  const replay=path.join(root,'replays',`trial-${seed}.json`);
  run(process.execPath,[path.join(engine,'src','cli.js'),'match','--bot','@'+path.join(cache,'local-bot.json'),'--bot','@'+path.join(engine,'bots','practice','bot.json'),'--mode',mode,'--ruleset',ruleset,'--seed',seed,'--ticks','360','--turn-ms','2000','--startup-ms','60000','--replay',replay]);
  const failures=JSON.parse(fs.readFileSync(replay,'utf8')).failures||[];
  if(failures.length)throw new Error(`Match recorded ${failures.map(value=>`${value.botId}: ${value.code}`).join(', ')}. Inspect ${replay}.`);
}
function doctor(){
  console.log(`Clunkyard SDK ${lock.sdkVersion}; ${lock.language}; ${process.platform}/${process.arch}; Node ${process.versions.node}`);
  let missing=0;
  for(const tool of lock.tools){const result=spawnSync(tool,['--version'],{encoding:'utf8',env:environment()});const ok=!result.error;console.log(`${ok?'ok':'missing'} ${tool}`);if(!ok)missing++;}
  console.log(lock.portable?'Portable Node route.':'Native assets: Linux x86-64, glibc 2.39+; Ubuntu 24.04+/WSL2.');
  console.log('No toolchains are downloaded automatically. See README.md for official installers.');
  if(missing)process.exitCode=1;
}
async function main(){
  const [action='build',...args]=process.argv.slice(2);
  if(action==='doctor')return doctor();
  if(action==='setup')return setup();
  if(action==='build')return build();
  if(action==='stdio')return stdio();
  if(action==='match')return match(args);
  if(action==='replay'){await setup();return run(process.execPath,[path.join(engine,'src','cli.js'),'replay',path.resolve(root,args[0]||'replays/trial-42.json'),'--port',args[1]||'8787']);}
  if(action==='clean'){fs.rmSync(path.join(cache,'build'),{recursive:true,force:true});fs.rmSync(path.join(cache,'bindings-ready'),{force:true});return;}
  throw new Error('Use doctor, setup, build, match [seed] [2d|3d] [ruleset], replay [file] [port], or clean.');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={main};
