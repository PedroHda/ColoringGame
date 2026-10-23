# Colorê — O caminho das cores

Protótipo web jogável de uma aventura de pintura pela história humana. Nove cenários ilustrados substituem as antigas figuras geométricas. A cena começa em tons de papel e cinza; tocar nas áreas com o pigmento correto revela suas cores, preservando traços, sombras e textura.

## Rodar localmente

Com Node.js instalado:

```powershell
npm start
```

Abra `http://127.0.0.1:4173`. Não é necessário instalar dependências de JavaScript. O servidor é somente para desenvolvimento e escuta em loopback.

## A nova jornada

| Capítulo | Caminhos |
| --- | --- |
| Primeiras marcas | Caverna, aldeia do rio, vale do Nilo |
| Cidades e histórias | Porto grego, ponte romana, jardim medieval |
| Novos horizontes | Praça renascentista, oficina industrial, comunidade atual |

O personagem e os elementos dos cenários conectam os períodos. Ao concluir uma cena, um trecho da história apresenta o próximo lugar e libera sua fase. Os períodos são um recorte narrativo, não uma história universal completa.

- Seis famílias de pigmentos, selecionáveis por clique ou teclas 1 a 6.
- Fácil: 24 áreas; Médio: 40; Difícil: 70. Cada nível mantém seu próprio progresso.
- A dica aponta uma área. Tab e Enter também permitem pintar.
- Desfazer, ocultar números, ampliar a cena e tela cheia, quando suportada pelo navegador.
- Concluir qualquer dificuldade rende três estrelas por fase, uma única vez. A sequência respeita as fases anteriores.
- A coleção reúne cenas iniciadas e concluídas, separadas por modo.
- Exportação real em PNG de 1600 × 1000 com as cores e os acabamentos atuais.

## Ateliê livre

Todos os nove cenários estão disponíveis sem bloqueio. Escolha uma cor pelo círculo de matiz e saturação, luminosidade, HEX ou canais RGB. Branco e preto também estão disponíveis.

Texturas: lisa, papel, aquarela e tecido. Brilhos: fosco, acetinado, glitter e metálico. Os efeitos são combináveis e salvos por região. Toque de novo para recolorir; use a borracha para remover a pintura. Desfazer atua nas ações desta abertura da cena.

O ateliê não concede estrelas nem desbloqueia a jornada. A pintura preenche regiões; não há ainda pincel de traço livre.

## Dados salvos

O progresso histórico usa a chave `colore-history-v1` em `localStorage`, por cena, modo e dificuldade. O navegador informa quando o armazenamento só está disponível na sessão. Limpar os dados do navegador remove as pinturas; não há sincronização entre dispositivos.

As chaves do protótipo anterior, `colore-studio-v1` e `colore-freepaint-v1`, não são alteradas. Os arquivos vetoriais antigos continuam no repositório para preservar o trabalho e seus testes; a página inicial agora carrega a experiência histórica.

## Implementação

- `dist/index.html`: estrutura da nova interface.
- `dist/history/app.js`: navegação, história, pintura, materiais e diálogos.
- `dist/history/painter.js`: renderização Canvas, toque por região, números acessíveis e exportação.
- `dist/history/state.js`: persistência validada, desbloqueios, recompensas e descompressão dos mapas.
- `dist/history/scenes.js`: narrativa, capítulos e pigmentos.
- `dist/history/style.css`: visual de papel, pigmentos e adaptação para telas menores.
- `dist/history/images/`: as nove ilustrações originais geradas para esta direção de arte.
- `dist/history/regions/`: 27 mapas de áreas pintáveis compactados em nove arquivos JSON.
- `dist/paint-effects.js`: conversões de cor e prévias dos materiais.
- `scripts/build-history-regions.py`: preparação reproduzível dos mapas com Python, Pillow e NumPy; não é necessária para jogar.

Os mapas são calculados a partir das cores e da continuidade espacial da imagem. As áreas são conectadas e os números ficam dentro delas. São agrupamentos de pintura para este protótipo, não recortes semânticos manuais de cada objeto; alguns agrupamentos incluem partes de objetos próximos. Os três níveis usam mapas diferentes.

Na jornada, o preenchimento restaura a ilustração da região, em vez de cobri-la com cor chapada. Trechos neutros das artes conceituais recebem pigmentos suaves mantendo sua luminosidade. No ateliê, o Canvas aplica a cor escolhida preservando o desenho e simula os acabamentos de forma estática.

## Verificar

```powershell
npm run check
npm test
```

Os testes incluem a cobertura de todos os pixels dos 27 mapas, conectividade de cada área, posicionamento dos números, persistência validada, separação entre modos e dificuldades, sequência da história e estrelas sem duplicação. Os testes do protótipo vetorial anterior também são preservados.

## Limites desta amostra

O visual tem profundidade ilustrada em 2D; não há um mundo 3D com movimentação livre. A progressão ocorre entre cenas e capítulos, com o personagem presente nas ilustrações. Roupas personalizáveis, economia, compras e ferramentas com gestos físicos diferentes não estão implementadas. A exportação e os materiais funcionam sem APIs pagas. As fontes externas são opcionais, com alternativas locais.

Este projeto continua sendo um protótipo de navegador, não um APK ou aplicativo Flutter. As condições de hospedagem e de uso do ChatGPT dependem do plano; o jogo em si não realiza chamadas de IA nem cobranças.
