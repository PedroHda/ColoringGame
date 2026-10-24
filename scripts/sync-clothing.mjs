import { readdir, readFile, writeFile } from "node:fs/promises";
const source = new URL("../assets/clothing/", import.meta.url);
const entries = await Promise.all(
  (await readdir(source))
    .filter((name) => /^[a-z][a-z0-9-]*\.svg$/.test(name))
    .sort()
    .map(async (name) => {
      const xml = (await readFile(new URL(name, source), "utf8"))
        .replaceAll("\r\n", "\n")
        .trim();
      if (
        /<(?!\/?(?:svg|g|path|rect|circle|ellipse|line|polyline|polygon)\b)/i.test(
          xml,
        ) ||
        /\b(?:on\w+|href|style)\s*=/i.test(xml) ||
        /url\s*\(/i.test(xml)
      )
        throw Error(`SVG de roupa não suportado: ${name}`);
      return [`/clothing/${name}`, xml];
    }),
);
const bodies = entries.map(([name, xml]) => [
  name,
  xml.replace(/^\s*<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, ""),
]);
await writeFile(
  new URL("../packages/core/clothing-art.ts", import.meta.url),
  `// Generated from original SVGs by scripts/sync-clothing.mjs. Do not edit.\nexport const clothingXml: Record<string,string> = ${JSON.stringify(Object.fromEntries(entries), null, 2)};\nexport const clothingBody: Record<string,string> = ${JSON.stringify(Object.fromEntries(bodies), null, 2)};\n`,
);
console.log(
  `Guarda-roupa: ${entries.length} silhuetas vetoriais compartilhadas.`,
);
