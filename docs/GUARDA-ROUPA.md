# Guarda-roupa para pintar

Os arquivos de `assets/clothing/` são desenhos vetoriais originais do projeto. Cada peça nova usa o mesmo espaço de desenho de 512 × 512 dos modelos básicos, com regiões claras e contornos escuros para pintura livre. Os SVG são os próprios assets jogáveis; a imagem de contato serve apenas para revisão visual.

| Arquivo | Encaixe do avatar | Nome sugerido | Referência de criação |
| --- | --- | --- | --- |
| `fiber-hat.svg` | `hat` | Chapéu de fibras | Fibras entrelaçadas e proteção durante o trabalho agrícola. |
| `cape.svg` | `shirt` | Capa de viajante | Capa com capuz, fecho e remendo, inspirada em viagens medievais. |
| `explorer-hat.svg` | `hat` | Chapéu de navegação | Chapéu funcional de chuva para trabalho marítimo, com aba e proteção na nuca. |
| `apron.svg` | `shirt` | Avental de oficina | Avental de trabalho com alça, costuras, bolsos e reparo, inspirado em oficinas renascentistas. |
| `workshop-bag.svg` | `bag` | Bolsa de ferramentas | Bolsa de transporte com alças, fechos e compartimentos, inspirada em oficinas industriais. |
| `future-jacket.svg` | `shirt` | Casaco de reuso | Imaginação contemporânea e futura de uma peça reparável, feita com painéis reaproveitados. |

Estas são interpretações lúdicas para o Colorê, e não reconstruções arqueológicas nem alegações de exatidão histórica. Os nomes de épocas indicam o contexto narrativo da jornada. As peças evitam insígnias de conquista, atribuições a povos específicos e estereótipos culturais. O chapéu de fibras representa uma técnica de entrelaçamento amplamente compartilhada; o casaco de reuso é uma criação imaginativa.

Crédito: **desenhos vetoriais originais do projeto**. Sem fontes externas, imagens incorporadas, filtros ou scripts. Paleta-base: branco e contorno `#241E18`, compatível com as três peças básicas existentes.

## Desbloqueios no jogo

`packages/core/wardrobe.ts` registra os nove itens para web e Android. Os três básicos estão disponíveis desde o início. Chapéu de fibras, capa, chapéu de navegação, avental, bolsa de ferramentas e casaco de reuso são recompensas dos caminhos 2, 7, 8, 9, 11 e 15, respectivamente. A conclusão registra `wardrobe:<id>` no inventário uma única vez. Os encaixes do avatar são `shirt`, `hat` e `bag`; várias peças podem ocupar o mesmo encaixe, preservando seus projetos separadamente por asset.

O personagem usa a silhueta vetorial de cada asset como máscara alfa para sua pintura. `scripts/sync-clothing.mjs` gera `packages/core/clothing-art.ts`, compartilhado pelos dois clientes, com SVGs de tags restritas e sem eventos ou referências externas. O build web e a sincronização mobile regeneram esse arquivo. A capa possui encaixe próprio; chapéus e bolsas conservam seus recortes, evitando o retângulo branco da miniatura. O perfil também permite guardar uma peça equipada sem remover sua obra da coleção.
