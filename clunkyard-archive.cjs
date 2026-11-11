'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Release archives contain ordinary files and directories only. They never
// carry checkout hooks, symlinks or absolute paths.
function archive(root) {
  const parts = [];
  function visit(directory, relative = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes:true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      const file = path.join(directory, item.name), stat = fs.statSync(file);
      if (stat.isDirectory()) { visit(file, name); continue; }
      if (!stat.isFile()) throw new Error(`Unsupported release file: ${name}`);
      const data = fs.readFileSync(file), header = Buffer.alloc(512);
      const slash = name.lastIndexOf('/'), leaf = name.length > 100 ? name.slice(slash + 1) : name, prefix = name.length > 100 ? name.slice(0, slash) : '';
      if (Buffer.byteLength(leaf) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`Release path too long: ${name}`);
      header.write(leaf, 0, 100); header.write(`${(stat.mode & 0o111 ? 0o755 : 0o644).toString(8).padStart(7,'0')}\0`, 100);
      header.write('0000000\0',108); header.write('0000000\0',116);
      header.write(`${data.length.toString(8).padStart(11,'0')}\0`,124); header.write('00000000000\0',136);
      header.fill(32,148,156); header[156]=48; header.write('ustar\0',257); header.write('00',263); header.write(prefix,345,155);
      const checksum = [...header].reduce((n,b) => n+b,0); header.write(`${checksum.toString(8).padStart(6,'0')}\0 `,148);
      parts.push(header,data,Buffer.alloc((512-data.length%512)%512));
    }
  }
  visit(root); parts.push(Buffer.alloc(1024)); return zlib.gzipSync(Buffer.concat(parts), { level:9 });
}

function extract(bytes, root, maxBytes = 256 * 1024 * 1024) {
  const data = zlib.gunzipSync(bytes, { maxOutputLength:maxBytes });
  let cursor = 0, count = 0;
  while (cursor + 512 <= data.length) {
    const header = data.subarray(cursor,cursor+512); cursor += 512;
    if (header.every(byte => byte===0)) return;
    const text = (start,end) => header.subarray(start,end).toString('utf8').replace(/\0.*$/s,'');
    const leaf = text(0,100), prefix = text(345,500), name = prefix ? `${prefix}/${leaf}` : leaf;
    if (++count > 10000 || !name || name.includes('\\') || name.split('/').some(part => !part || part==='.' || part==='..' || part.toLowerCase()==='.git') || path.isAbsolute(name)) throw new Error('Unsafe release archive path');
    if (![0,48].includes(header[156])) throw new Error('Release archive contains a link or unsupported object');
    const expected = parseInt(text(148,156).trim(),8), copy = Buffer.from(header); copy.fill(32,148,156);
    if (expected !== [...copy].reduce((n,b) => n+b,0)) throw new Error('Release archive header failed verification');
    const size = parseInt(text(124,136).trim(),8);
    if (!Number.isSafeInteger(size) || size < 0 || cursor+size > data.length) throw new Error('Invalid release archive size');
    let parent = root;
    for (const part of name.split('/').slice(0,-1)) {
      parent = path.join(parent,part);
      if (fs.existsSync(parent) && (!fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink())) throw new Error('Unsafe release directory');
      fs.mkdirSync(parent,{recursive:true});
    }
    const file = path.join(root,...name.split('/'));
    if (fs.existsSync(file)) throw new Error('Release archive repeats an existing path');
    fs.writeFileSync(file,data.subarray(cursor,cursor+size),{mode:parseInt(text(100,108),8)&0o111?0o755:0o644,flag:'wx'});
    cursor += Math.ceil(size/512)*512;
  }
  throw new Error('Incomplete release archive');
}

module.exports = { archive, extract };
