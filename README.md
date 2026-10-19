# Colorê — pequenos mundos, grandes cores

Protótipo de colorir por números em português, com nove desenhos diferentes, três mundos e progressão de fases. A interface se adapta ao computador e ao celular.

## Executar

Requer Node.js 18 ou superior. Não é necessário instalar dependências.

```powershell
cd colore-prototype
npm start
```

Abra http://127.0.0.1:4173. O servidor local escuta apenas em loopback e é destinado ao desenvolvimento.

## Jornada

Cada mundo contém três fases. Concluir as fases anteriores abre a seguinte. Cada fase concluída vale três estrelas, uma única vez, até 27 estrelas no total. As estrelas são calculadas pelo progresso salvo; revisitar um desenho não duplica recompensas.

| Mundo | Desenhos |
| --- | --- |
| Jardim secreto | Jardim tropical, Cantinho verde, Bosque encantado |
| Céu de sonhos | Asas de aquarela, Passeio nas nuvens, Sol em flor |
| Mar de cores | Oceano tranquilo, Farol da enseada, Dança dos corais |

O modo livre permite pintar qualquer um dos nove desenhos. Concluir uma fase no modo livre também conta na coleção e nas estrelas, mas não elimina os pré-requisitos das fases anteriores da jornada.

## Pintar e colecionar

- Selecione uma cor e pinte áreas com o mesmo número.
- Use dicas, desfazer, zoom e ocultação dos números.
- No computador, use as teclas 1 a 6 para selecionar cores, e Tab/Enter para pintar.
- Volte à coleção para ver desenhos concluídos ou continuar trabalhos em andamento.
- Exporte a arte para uma prévia PNG de 1600 × 1600; clique em Salvar PNG ou mantenha a imagem pressionada no celular.
- Em Desenhos, crie variações locais com novas paletas, espelhamento e detalhes decorativos.

Os números são reposicionados quando necessário para permanecer na parte visível de suas regiões. A interface respeita a preferência de movimento reduzido.

## Dados e compatibilidade

O progresso permanece em `localStorage`, no navegador e dispositivo usados. Não há conta interna nem sincronização entre dispositivos. Limpar os dados do navegador remove o progresso. Se o armazenamento estiver indisponível, o jogo informa que o progresso existe apenas na sessão.

A chave `colore-studio-v1` e os identificadores dos três primeiros desenhos foram preservados. Os desenhos, as variações e o progresso da primeira versão continuam disponíveis.

## Custos e limites

O código local usa apenas HTML, CSS e JavaScript, sem bibliotecas pagas e sem chamadas de API. As fontes externas são opcionais e possuem fallback local. O jogo não exige contratar um servidor para ser executado localmente.

O link publicado usa Sites, cujo acesso e condições dependem do plano ChatGPT. A criação pelo Codex usa os limites do plano. Esta amostra não gera imagens com IA, não usa SQLite e não é um APK. Uma futura integração com um serviço de IA pode ter custos adicionais.

## Arquivos principais

- `dist/art.js`: os três desenhos originais, as paletas e a renderização SVG.
- `dist/scenes.js`: seis novas ilustrações com regiões pintáveis.
- `dist/progression.js`: regras de conclusão, estrelas e desbloqueios.
- `dist/journey.js`: mapa, biblioteca, filtros e coleção.
- `dist/app.js`: pintura, persistência, navegação, dicas e exportação.
- `dist/journey.css`: o visual da jornada e a adaptação para celular.

## Verificar

```powershell
npm test
npm run check
```

Os testes cobrem início da jornada, progresso da versão anterior, pré-requisitos, modo livre, recompensas, dados de regiões e conclusão de todas as fases.

## Dificuldades

Cada um dos nove desenhos e das variações locais possui três versões jogáveis:

| Nível | Cores | O que muda |
| --- | --- | --- |
| Fácil | 4 | Remove pequenos detalhes e simplifica a paleta. |
| Médio | 6 | Preserva exatamente as regiões da versão anterior. |
| Difícil | 8 | Divide regiões em partes menores e acrescenta detalhes. |

Na tela Desenhos, o seletor de dificuldade combina com os filtros por mundo. Durante a pintura, o nível pode ser alterado pelo seletor acima do desenho. Cada dificuldade mantém seu próprio progresso: mudar de nível não apaga uma pintura anterior.

Concluir qualquer dificuldade libera a fase seguinte, respeitando os pré-requisitos da jornada. Completar o mesmo desenho em outros níveis não duplica as três estrelas daquela fase. A coleção identifica a dificuldade de cada trabalho.

Na jornada, cada capítulo sugere Fácil, Médio e Difícil, nessa ordem. Um trabalho antigo ou já iniciado é retomado no nível correspondente. O nível Médio conserva os IDs originais para manter a compatibilidade do progresso salvo.

As subdivisões difíceis são vetores SVG com recortes e contornos reais, não apenas um rótulo visual. O posicionamento dos números considera esses recortes. O PNG exportado identifica a dificuldade.

`dist/difficulty.js` define as três versões e suas paletas. Os testes adicionais verificam quantidade de regiões, cores, recortes SVG, compatibilidade, independência do progresso e recompensas.

## Pintura livre

A aba **Pintura livre** abre um ateliê separado da jornada por números. Os nove desenhos têm as três quantidades de detalhes disponíveis, sem bloqueio de fases. Toque em uma região para preenchê-la com qualquer cor; uma região pintada continua disponível para trocar sua cor e seu acabamento.

- Círculo de cores com matiz e saturação, controle de luminosidade, campos RGB (0–255) e hexadecimal, incluindo branco e preto.
- Texturas lisa, papel granulado, aquarela e tecido; acabamentos fosco, acetinado, glitter e metálico. Textura e brilho podem ser combinados e são salvos por região.
- Borracha, desfazer nesta sessão por desenho, zoom e até oito cores usadas recentemente.
- A criação é salva automaticamente na chave separada `colore-freepaint-v1`, por desenho e dificuldade. Ela aparece ao reabrir a mesma ilustração na aba Pintura livre. As estrelas e a coleção da jornada continuam vinculadas à pintura por números.
- O PNG de 1600 × 1600 usa os mesmos padrões SVG da tela e inclui as texturas e brilhos. Não há cobrança de API para esses efeitos.

Os acabamentos são simulações vetoriais estáticas, sem pinceladas livres ou animação de luz. A pintura preenche regiões delimitadas. Os campos de cor e botões também são acessíveis por teclado; no círculo, as setas horizontais mudam o tom e as verticais ajustam a saturação.

`dist/free-paint.js` e `dist/free-paint.css` definem o ateliê; `dist/paint-effects.js` define conversões de cor, validação dos dados e padrões SVG. Os testes verificam conversões RGB, dados persistidos, separação da jornada, recortes e exportação das 16 combinações de materiais.

## Tecnologias usadas

HTML estrutura as telas, CSS define o visual e JavaScript implementa pintura, navegação, fases e persistência. As ilustrações são SVG. O servidor de desenvolvimento usa Node.js. O projeto não exige instalação de bibliotecas para rodar ou testar.
