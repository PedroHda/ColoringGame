import { cp, readdir, writeFile, rm } from "node:fs/promises";
import { optimizeIllustrations } from "./optimize-illustrations.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  out = path.join(root, "build");
await optimizeIllustrations({
  out: path.join(out, "illustrations"),
  thumbnails: true,
});
for (const name of ["production-log.json", "prompts.json", "manifest.json"])
  await rm(path.join(out, "illustrations", name), { force: true });
await cp(path.join(root, "dist"), path.join(out, "legacy"), {
  recursive: true,
});
async function walk(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) result.push(...(await walk(p)));
    else result.push(p);
  }
  return result;
}
const files = (await walk(out))
  .map((p) => path.relative(out, p).replaceAll("\\", "/"))
  .filter(
    (p) =>
      !p.startsWith("legacy/") &&
      !p.startsWith("illustrations/") &&
      !p.endsWith(".map"),
  );
const version = Date.now().toString(36);
const shell = JSON.stringify(files);
await writeFile(
  path.join(out, "sw.js"),
  `const CACHE='colore-shell-${version}',ART='colore-art-v6';const FILES=${shell};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(p=>new URL(p,self.registration.scope).href))).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('colore-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok&&!new URL(e.request.url).pathname.includes('/legacy/')){const copy=r.clone();caches.open(new URL(e.request.url).pathname.includes('/illustrations/')?ART:CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>e.request.mode==='navigate'?caches.match(new URL('index.html',self.registration.scope)):Promise.reject('offline'))));});`,
);
console.log(
  `Build web pronto: ${files.length} arquivos de interface, ilustrações sob demanda e V5 preservada em /legacy/.`,
);
