# Validação de dados e histórico V6

A suíte `packages/database/repository.test.ts` executa o repositório compartilhado sobre **SQLite real**, usando `DatabaseSync` do Node.js 22. Não substitui o banco por arrays em memória nem simula transações.

## Casos verificados

- Catálogo relacional com 15 caminhos e 75 registros de fases. Este teste de dados não afirma que todas as ilustrações já estejam produzidas.
- Chaves estrangeiras para perfil, fase, pintura e camada; exclusão de pinturas remove camadas e traços.
- Salvamento de traço ainda em andamento com o mesmo ID, incluindo novos pontos, pressão, configurações, semente e camada.
- Ordem de desfazer/refazer após repetidos salvamentos, exclusão do futuro quando uma nova edição o substitui e retomada do arquivo SQLite após fechar e reabrir a conexão.
- Normalização defensiva retornada por `validateDocument` realmente persistida, sem alterar o objeto fornecido pela interface.
- Miniatura em BLOB binário; conteúdo editável em operações JSON, sem imagens base64 por gesto.
- Conclusão grava obra, perfil e XP na mesma transação; uma falha SQL injetada confirma rollback de ambos.
- Regeneração assíncrona de miniatura altera apenas seu BLOB quando `updated_at` ainda corresponde à versão renderizada, sem substituir traços novos.
- UPSERT de traço sem alteração não provoca `UPDATE` físico, confirmado com um trigger de auditoria no teste.
- Importação rejeita documentos, datas, flags, IDs duplicados e registros legados inválidos antes de escrever.
- Um trigger SQLite provoca falha no meio de uma importação: perfil, obra anterior, novas obras, camadas e traços retornam ao estado anterior pelo `ROLLBACK` real.
- Migração de esquema V1 para V2 acrescenta a relação entre traços e camadas, preservando camadas referenciadas por dados antigos. Uma falha no upgrade reverte também DDL e marcadores de versão.
- Um banco com esquema de versão futura é recusado antes da criação de tabelas.
- Recompensas de conclusão e as 75 conclusões não duplicam linhas relacionais nem XP; salvar o perfil preserva a data original de conclusão.
- A primeira cópia dos dados V5 é conservada byte a byte. A importação parcial pode continuar posteriormente, com marcadores por fase, sem conceder o mesmo XP duas vezes e sem inventar pinceladas a partir de regiões.

## Correções encontradas durante os testes

O salvamento original ignorava a cópia normalizada por `validateDocument`. Também tratava traços como imutáveis, perdendo pontos de gestos ativos que já tivessem sido salvos, e não atualizava dimensões/asset em uma obra existente. Esses três problemas foram corrigidos. A versão global `migration:v5` deixava de importar conclusões reconhecidas posteriormente; agora os marcadores individuais e as próprias conclusões garantem repetição segura. Ferramentas e materiais de IDs desconhecidos não são liberados ao atingir o nível máximo.

## Limites das verificações

Estes testes comprovam as regras SQL e a recuperação transacional no SQLite de desktop. OPFS, IndexedDB, encerramento abrupto de aba e SQLite Android continuam dependentes dos testes dos respectivos adaptadores e dispositivos. O fallback web exporta um arquivo SQLite para IndexedDB; o sucesso da transação no worker precisa ser seguido do sucesso da gravação desse arquivo antes de a interface informar que salvou.

O adaptador Android mantém um esquema SQLite específico, portanto o teste do repositório web não comprova que sua migração de dados seja equivalente. Ambos usam agora o contrato compartilhado `colore-backup` V1. O adaptador nativo converte suas linhas para esse formato e possui testes de roundtrip, referências de roupas e rejeição de corrupção. A compatibilidade de arquivos não implica que a aparência raster seja idêntica entre Canvas e Skia; cada adaptador renderiza os mesmos traços com aproximações próprias.

O campo de equipamento admite IDs de peças-base e IDs de obras; não há FK única para esses dois tipos de referência. A interface precisa tratar obra equipada que tenha sido removida. O repositório atualmente dá suporte a um perfil local e sua importação combina as obras por ID, restaurando o perfil do backup. Não implementa sincronização entre dispositivos, criptografia ou histórico de versões de toda obra.

Os pincéis e materiais reais podem ser inspecionados em [ferramentas-v6.png](images/ferramentas-v6.png). Essa folha foi produzida pelo motor Canvas e conferida visualmente.

```sh
npx tsx --test packages/core/core.test.ts packages/database/repository.test.ts
```
