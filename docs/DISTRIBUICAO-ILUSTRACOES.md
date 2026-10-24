# Cópias de distribuição e miniaturas

Os masters oficiais permanecem em `assets/illustrations/`. O script `scripts/optimize-illustrations.mjs` apenas lê ilustrações ativas no catálogo que também estejam marcadas como `ready` no manifesto e cujo SHA-256 corresponda ao arquivo. Não gera arte, não muda cores, não amplia a resolução dos masters e não altera o catálogo.

```sh
# Web: adaptar o destino ao diretório escolhido pelo build
node scripts/optimize-illustrations.mjs --out build/illustrations

# Android: cópias estáticas independentes do Metro/servidor web
node scripts/optimize-illustrations.mjs --out apps/mobile/assets/illustrations
```

O destino padrão é `build/illustrations`. Só são aceitos destinos dentro de `build/` ou `apps/mobile/assets/`; links simbólicos abaixo da raiz são recusados antes de gravar. Os arquivos são substituídos atomicamente, sem remoções recursivas.

## Preservação de pixels

1. Validar assinatura, dimensões, estrutura e CRC dos chunks PNG.
2. Confirmar tamanho/data estáveis e SHA-256 do master antes de decodificar. Se o produtor ainda estiver copiando a imagem, a execução falha e pede nova validação.
3. Ler RGBA com `@napi-rs/canvas`.
4. Reencodificar como grayscale8 **somente** se todos os pixels tiverem `R=G=B` e alfa255.
5. Para imagens opacas de 8 bits com qualquer diferença entre R/G/B, tentar PNG RGB8 lossless, preservando os três canais exatos. Não converter line art levemente tingida em cinza.
6. Usar filtros PNG adaptativos por linha e zlib no nível9, com CRCs novos.
7. Decodificar a candidata e comparar dimensões e SHA-256 de **todos os bytes RGBA** com o original. Recusar qualquer diferença.
8. Usar a candidata somente quando for menor. PNGs de 16 bits, com transparência, animados ou sem benefício permanecem byte a byte iguais ao original.

O decodificador nativo pode confundir texto SVG dentro do chunk de credenciais `caBX` com uma imagem SVG. Para inspecionar esses masters, o script omite somente esse chunk em um buffer temporário de decodificação, preservando chunks de pixels e perfis de cor. O master mantém todas as credenciais. Cópias reencodificadas são derivadas e registram o SHA-256 do master no `distribution-manifest.json`; não representam o arquivo original assinado.

## Pré-visualizações

Cada `p01-s01.png` recebe uma cópia `p01-s01.thumb.png`, ajustada para caber em 320×200 mantendo proporção e sem ampliar imagens pequenas. A miniatura é uma **prévia derivada**, registrada separadamente no manifesto. Sua redução de pixels não se aplica ao arquivo usado para pintar ou exportar em resolução completa. A interface pode carregar essas miniaturas na jornada/galeria e abrir o PNG completo somente no editor.

## Uso programático

```js
import { optimizeIllustrations } from './scripts/optimize-illustrations.mjs';

const report = await optimizeIllustrations({
  out: 'build/illustrations',
  only: ['p01-s01', 'p01-s02'], // opcional: teste ou subconjunto validado
  thumbnails: true,            // padrão
});
console.log(report.originalBytes, report.bytes, report.files);
```

O script também exporta `encodeGrayscalePng`, `encodeRgbPng`, `inspectPng`, `crc32` e `assertDistributionPath` para testes. Não possui efeitos de build quando importado.

## Evidência inicial

Verificadas duas ilustrações reais, ambas com1586×992pixels e pequenas diferenças entre canais, portanto mantidas em RGB8:

| Arquivo | Master | Distribuição lossless | Economia | RGBA idêntico |
|---|---:|---:|---:|:---:|
| `p01-s01.png` | 3.166.719 B | 2.652.492 B | 514.227 B | Sim |
| `p01-s02.png` | 2.698.930 B | 2.266.609 B | 432.321 B | Sim |
| Total | 5.865.649 B | 4.919.101 B | 946.548 B (~16,1%) | Sim |

Essas medidas comprovam codificação de distribuição, não a resolução alvo de2048×1280. O pipeline artístico continua responsável por registrar e resolver ilustrações abaixo dessa meta.

```sh
node --test tests/illustration-optimization.test.mjs
```

Os testes conferem pixels decodificados exatos de grayscale e RGB, CRC conhecido e corrupção de chunks, rejeição de conversão com qualquer cor/alfa incompatível e restrição de destinos antes de qualquer escrita.

## Distribuição final de 75 ilustrações

Em 24/10/2026, os dois builds produziram o mesmo resultado: 218.591.971 bytes de masters → 185.231.632 bytes de PNGs de distribuição, com igualdade de todos os pixels RGBA nas 75 imagens. A economia é de 33.360.339 bytes (~15,3%). As 75 miniaturas somam 9.278.506 bytes. Os manifestos derivados ficam em `build/illustrations/distribution-manifest.json` e `apps/mobile/assets/illustrations/distribution-manifest.json`. Os masters continuam intactos e abaixo da referência HD; compressão sem perdas não aumenta a resolução.
