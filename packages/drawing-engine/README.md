# Motor de pintura

`model.ts` contém somente dados e funções TypeScript independentes de plataforma. O adaptador web `CanvasBrushEngine` fica em `canvas.ts`; não instala eventos nem cria dependências DOM durante o import. O renderizador nativo pode importar o contrato diretamente de `model.ts`.

```ts
import { CanvasBrushEngine, getDefaultBrushSettings } from './index';

const engine = new CanvasBrushEngine(canvas, 2048, 1280);
engine.begin({ x: 100, y: 100, pressure: 0.5 }, getDefaultBrushSettings('watercolor'));
engine.move({ x: 150, y: 125, pressure: 0.8 });
const stroke = engine.end();
const editable = engine.getDocument();
engine.undo();
engine.redo();
const png = await engine.exportComposite(lineArtImage);
engine.dispose();
```

O Canvas é uma camada transparente. O host apresenta papel abaixo, tinta no meio e a ilustração de contornos acima com composição `multiply`. O exportador reproduz essa composição em PNG. `sample(x, y)` retorna HEX da tinta sobre papel branco; não inclui os contornos.

## Contrato

- Coordenadas e tamanho em pixels do documento, antes das transformações CSS de zoom/pan. O host converte ponteiros/toques para esse espaço.
- Todos os controles contínuos ficam em `[0,1]`, exceto `size`, de 1 a 256 pixels. `alpha` pertence à cor e multiplica `opacity`; `intensity` controla a carga de pigmento.
- A pressão opcional varia de 0 a 1. Sem caneta, a pressão de referência é 0,7.
- `getDefaultBrushSettings(tool)` retorna os tamanhos iniciais de cada ferramenta. `tools` e `materials` contêm IDs, nomes em português e descrição do comportamento.
- `begin`, `move`, `end` alteram pixels incrementalmente. `undo`, `render` e `setDocument` recompõem o histórico. `redo` somente reaplica o traço restaurado.
- `cancelActive` descarta apenas o gesto em andamento e recompõe a tinta persistida, preservando desfazer/refazer. A web o utiliza quando o segundo dedo transforma a pintura em navegação.
- Os dados salvos são traços vetoriais editáveis com sementes de textura. As sementes são preservadas ao desfazer, refazer e abrir a obra. Não existem snapshots base64 por gesto.
- `getDocument()` devolve uma cópia defensiva, incluindo o gesto ativo. `setDocument()` valida antes de alterar a obra. `clear()` limpa tinta e histórico da sessão; o host deve confirmar antes de descartar uma pintura.
- `serializeDocument`, `deserializeDocument`, `validateDocument` são puros e não dependem do Canvas. Dados inválidos geram erro, permitindo que o armazenamento recupere seu backup.
- Limites defensivos: 8192 pixels por dimensão, 20 mil traços, 100 mil pontos por gesto e 2 milhões de pontos por documento.

## Comportamento de pintura

O movimento usa amostragem contínua com pressão interpolada e suavização Hermite causal. Pontas diferentes desenham discos, elipses, cerdas, partículas, hachuras ou névoa; não são apenas nomes sobre o mesmo traço. Materiais modificam cobertura, pigmentação, grão e reflexos. A mistura amostra a camada de tinta na borda de avanço do pincel e faz uma aproximação subtrativa de pigmentos. A borracha usa `destination-out`, preservando os contornos externos ao motor.

Os efeitos são aproximações artísticas 2D. Não há simulação física de fluidos, pigmentos espectrais, relevo 3D, difusão após o gesto ou brilho animado. O benchmark automatizado é de CPU desktop e não comprova desempenho em aparelho Android. O adaptador Android precisa implementar seus shaders e as mesmas operações no renderizador nativo.

## Verificação

Os testes usam `node:test`, `tsx` e um Canvas real com `@napi-rs/canvas`: pixels contínuos, pressão, tamanho, alfa, borracha, efeitos distintos das 12 ferramentas e 10 materiais, mistura, PNG com contornos, determinismo no histórico, salvamento durante gesto e custo de operações.

```sh
npx tsx --test packages/drawing-engine/engine.test.ts
```
