# Ilustrações e conteúdo histórico

O catálogo da V6 contém 15 caminhos e 75 fases com introdução, conclusão, paleta e recompensa. A presença no catálogo editorial não significa que uma imagem foi entregue: somente `asset !== null` representa um arquivo real instalado e validado.

## Arquivos e contrato

- `packages/game-content/content-source.mjs`: fonte editorial, contexto histórico, narrativa e composição específica de cada cena.
- `packages/game-content/catalog.json`: catálogo gerado que web e Android compartilham.
- `packages/game-content/index.ts`: tipos `Stage` e `HistoricalPath`; exports `paths`, `stages`, `availableStages`, `stageById` e `pathById`.
- `assets/illustrations/p01-s01.png` a `p15-s05.png`: ilustrações finais presentes, sem reutilizar um arquivo para várias fases.
- `assets/illustrations/manifest.json`: status, dimensões reais, hash, volume de branco e presença de cor de cada arquivo.
- `assets/illustrations/prompts.json`: os 75 prompts específicos de produção, gerados da fonte editorial.
- `assets/illustrations/production-log.json`: referências dos arquivos gerados e inspeções de produção.
- `scripts/validate-assets.mjs`: verificação reprodutível, sem serviço externo e sem alterar pixels.

Índices de caminhos e fases começam em zero; os identificadores públicos começam em um: `path-01`, `p01-s01`. Assets são servidos por `/illustrations/<id>.png`. O empacotador web deve copiar os PNG para essa pasta; o aplicativo Android deve incluí-los no bundle local. Não existe geração por IA durante o jogo.

## Direção artística

As nove cenas coloridas da V5 foram examinadas como referências de composição, narrativa e perspectiva. Elas permanecem preservadas em `dist/history/images/`. A nova série usa contornos pretos finos sobre papel branco, cenários completos, primeiro plano e distância, variedade de objetos pequenos e médios e ausência de preenchimento colorido. O papel branco serve ao motor de pintura: a camada de tinta fica sob os contornos.

Os textos percorrem várias regiões sem tratar a história como progresso exclusivo de um povo. Cada cena representa um contexto específico; a jornada é temática, com sobreposições de tempo. Colonização, desigualdade e conflitos recebem tratamento adequado à proposta acolhedora, sem apresentar conquista como encontro entre iguais. As cenas de futuro são possibilidades imaginadas, não previsões.

## Produção e inspeção

1. Edite a fase em `content-source.mjs`, com contexto, narrativa e composição individual.
2. Execute `node scripts/validate-assets.mjs --sync` para gerar catálogo, manifesto e prompts. Arquivos ausentes ficam com `asset: null`.
3. Use o prompt individual com a ferramenta nativa `image_gen`, uma chamada por ilustração. Nunca use uma grade ou colagem como várias fases.
4. Copie o arquivo original da pasta de imagens geradas para `assets/illustrations/<id>.png`. Não reencode ou amplie a imagem para simular uma resolução maior.
5. Inspecione visualmente a composição, anatomia, ausência de cor/textos, plausibilidade do período e separação dos contornos. Um hash ou teste de pixels não comprova qualidade artística ou exatidão histórica.
6. Execute novamente `--sync`; cor, pouca área branca, dimensão muito pequena, transparência indevida ou duplicata exata impedem a ativação.
7. Teste uma pintura, borracha, zoom e exportação nos adaptadores que usam o arquivo. Esse teste de integração é separado da aprovação dos pixels.

## Comandos

```sh
node scripts/validate-assets.mjs --sync
node scripts/validate-assets.mjs --playable
node scripts/validate-assets.mjs --complete
```

Sem `--sync`, o verificador também exige que o catálogo corresponda aos arquivos presentes. `--playable` verifica os arquivos e a consistência do catálogo, sem afirmar que todas as 75 imagens já foram entregues. `--complete` exige 75 imagens aprovadas e todas na resolução de referência.

O verificador lê PNG de 8 bits em escala de cinza, RGB ou RGBA, não entrelaçado. Reconstrói os filtros PNG e mede os pixels após descompressão; não confunde apenas os metadados do arquivo com a sua aparência. Usa limites de branco/cor como apoio à inspeção manual. Não calcula regiões nem substitui pinceladas por preenchimentos.

## Limite real de resolução

A referência do projeto é **pelo menos 2048 × 1280 pixels**. Nas primeiras gerações, a ferramenta embutida retornou **1586 × 992 pixels**, mesmo após um segundo pedido explícito de 2560 × 1600. A API disponível nessa ferramenta não expõe parâmetro de tamanho. Os originais foram preservados, sem ampliação artificial. Imagens aprovadas para jogar nessa resolução recebem `resolutionStatus: "below-target"`; as dimensões reais aparecem em cada fase e no manifesto. Essa variante utilizável **não cumpre a meta de resolução HD**. A verificação `--complete` continua falhando enquanto houver imagens abaixo da meta.

Uma edição ou nova produção com ferramenta que entregue a resolução nativa solicitada poderá substituir o asset com o mesmo ID, após nova inspeção. O pipeline não exige uma chave de API para executar o jogo. Não foi usado serviço de geração pago em runtime nem um fallback de API sem autorização.

## Nove cenas preservadas na narrativa

| Referência V5 | Fase V6 |
| --- | --- |
| `01-primeiras-marcas` | `p01-s02` — As pinturas nas cavernas |
| `02-a-aldeia-do-rio` | `p02-s03` — A aldeia do rio |
| `03-o-vale-do-nilo` | `p03-s02` — O vale do Nilo |
| `04-o-porto-das-ideias` | `p05-s02` — O porto das ideias |
| `05-a-ponte-dos-encontros` | `p05-s04` — Pontes, estradas e aquedutos |
| `06-o-jardim-das-historias` | `p07-s03` — Jardins e manuscritos |
| `07-a-praca-dos-artistas` | `p09-s01` — A praça dos artistas |
| `08-a-oficina-dos-novos-tons` | `p11-s02` — Oficinas industriais |
| `09-a-cidade-que-criamos` | `p14-s05` — A cidade que construímos |

`legacyId` oferece uma chave de migração de memória/progresso. A versão antiga e suas pinturas por região não são convertidas em pinceladas inventadas.

## Créditos e limites editoriais

Direção artística do Colorê fornecida pelos idealizadores do projeto; novas imagens produzidas com a ferramenta nativa de geração de imagens durante o desenvolvimento, e textos editoriais preparados para esta versão. Não há gravações particulares, transcrições pessoais, credenciais ou imagens de referência temporárias neste pacote de ilustrações. As representações históricas são ilustrativas e precisam de revisão especializada antes de uso didático formal. A licença geral deve ser definida pelo proprietário do repositório.
