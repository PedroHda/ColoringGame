# Estado da entrega V6

Conferência de 24 de outubro de 2026. Este documento distingue implementação, verificação automatizada e validação em dispositivo. O projeto continua em desenvolvimento; não é uma declaração de distribuição Android aprovada.

## Implementado

| Área | Estado e evidência |
| --- | --- |
| Auditoria e preservação | V5 mantida em `dist/`, auditoria em `AUDITORIA-V6.md`, nove cenas e regressões preservadas |
| Web React/TypeScript | Interface completa, build estático Vite, editor Canvas e worker SQLite |
| Pintura livre | 12 ferramentas, 10 materiais, pressão, interpolação, mistura, borracha, histórico e PNG; testes de pixels reais |
| Cores | HSV/RGB/HEX/alfa, luminosidade, saturação, conta-gotas, recentes e favoritas |
| História | 15 caminhos e 75 fases narrativas com sequência, paletas e recompensas; catálogo independente da presença da arte |
| Ilustrações | **75/75 arquivos reais**, 0 ausentes e 0 rejeitados, com narrativa e catálogo; todos em 1586 × 992, abaixo da meta HD |
| Progressão | 50 níveis, XP único por evento, conquistas e inventário compartilhados entre web e Android |
| Personagem | Aparência modular persistente, criação inicial, perfil e presença no mapa |
| Guarda-roupa | Nove peças SVG pintáveis, três iniciais e seis recompensas de caminhos, encaixes persistentes |
| Galeria e dados | Obras editáveis, nomes, miniaturas, SQLite transacional, backup web/Android e cópias antigas |
| Offline web | Service Worker e ilustrações sob demanda ou download por caminho |
| Android | React Native/Skia, SQLite nativo, arquivos locais, gestos e APK de teste compilado para ARM 32/64; perfis APK/AAB configurados |
| Áudio | Quatro ambiências originais, efeito curto, volumes separados, voz do dispositivo e feedback tátil opcional |
| Documentação | README V6, imagens reais da web/motor, guia Android, assets, otimização, dados e guarda-roupa |

## Verificações realizadas

- `npm run check`: TypeScript web e sintaxe dos módulos V5.
- `npm test`: **61 testes** — 23 regressões/pipeline e 38 testes TypeScript de regras, banco, rasterização e viewport. Todos passaram.
- `npm run check --prefix apps/mobile`: TypeScript nativo passou.
- `npm test --prefix apps/mobile`: **7 testes** de backup compartilhado e SQL das migrações passaram.
- `npx expo install --check`: dependências compatíveis com o SDK instalado.
- Build web final gerado com 75 artes e Service Worker. Bundle Android Hermes final exportado com **164 assets**: 75 ilustrações, 75 miniaturas, nove SVG de roupa e cinco WAV. O `.hbc` tem aproximadamente 4,3 MB; o conjunto de ilustrações comprimidas soma 185.231.632 bytes, além das miniaturas. Isso não é um APK.
- Os manifestos de distribuição web e Android registram 75/75 comparações RGBA idênticas aos masters.
- Prebuild Android: fontes Kotlin, Gradle e manifesto gerados com `com.pedrohda.colore`, orientação livre, áudio sem microfone e permissões bloqueadas verificadas. Não equivale a compilar um APK.
- Compilação binária real: `:app:assembleRelease` passou, incluindo lint vital, com 811 tarefas (257 executadas e 554 atualizadas na tentativa final). O APK `colore-v6.0.0-teste.apk` tem **266.212.914 bytes**, versão 6.0.0/código 6, Android mínimo API 24 e ABIs `arm64-v8a`/`armeabi-v7a`. Código-fonte do build: `62cace7cb29f8ecd989bbfc61ad56b0c3d9e930b`.
- `apksigner verify`: assinatura v2 válida com certificado Android Debug; `zipalign -c -P 16 -v 4`: aprovado. O manifesto final não solicita câmera, microfone, sobreposição ou acesso geral ao armazenamento. As 75 artes e 75 miniaturas foram encontradas no APK por SHA-256, idênticas aos arquivos de distribuição, e o bundle está incluído. Não houve execução em aparelho/emulador.
- Web no navegador, durante a implementação: criação de perfil, pintura com mouse, controles de cor/espessura, desfazer/refazer, recarga recuperando traços, conclusão/XP, camiseta pintada/equipada e reabertura offline com servidor parado.
- A captura `images/personagem-v6.jpg` é dessa execução web; `images/ferramentas-v6.png` é produzida pelo motor real. Não são screenshots de Android.
- Na conferência posterior, a política de segurança do navegador bloqueou a inspeção da prévia local. As últimas integrações de guarda-roupa, áudio e restauração não tiveram nova verificação visual de ponta a ponta nesta sessão; permanecem verificadas por TypeScript, testes aplicáveis e build.

A conclusão web grava a obra, o perfil, o progresso e o XP em uma transação. Um teste injeta falha SQL e confirma rollback de ambos. Miniaturas geradas em segundo plano atualizam somente seu BLOB e apenas quando a data da obra ainda corresponde à versão renderizada; um teste confirma que uma prévia obsoleta não substitui traços novos.

## Pendências reais

1. **Masters HD:** a ferramenta produziu 1586 × 992. O requisito mínimo de 2048 × 1280 não está atendido. Os originais e prompts específicos foram preservados; não foi aplicado aumento artificial de tamanho. `--complete` deve continuar falhando enquanto a resolução não atender ao contrato.
2. **Assinatura de produção:** o APK de teste já foi gerado e verificado. Utiliza certificado de desenvolvimento; falta configurar a assinatura definitiva do proprietário e validar a atualização antes de distribuição pública. Nenhuma chave privada foi versionada.
3. **Validação em hardware:** faltam dedo/caneta, pressão, pinça e pan, SQLite e recuperação após encerramento, áudio, exportação/compartilhamento, retrato/paisagem e consumo de memória/bateria em Android. Um bundle Hermes não comprova esses itens.
4. **Acessibilidade e compatibilidade:** faltam auditoria completa, leitores de tela e matriz de navegadores/aparelhos. O texto continua disponível quando a voz não está instalada.

As texturas e os brilhos são aproximações 2D; não há simulação de fluidos ou iluminação 3D. O benchmark de 1.500 movimentos foi executado em CPU desktop, sem promessa de 60 FPS em Android. Após importar backup no Android, algumas prévias podem exigir abrir e sair da obra; os traços editáveis continuam preservados.

## Dependências

A auditoria npm do projeto web não apontou vulnerabilidades na conferência inicial. A auditoria nativa de 24/10/2026 indicou seis entradas (cinco altas e uma baixa), incluindo dependências da cadeia Expo CLI (`node-forge`, `zod` e `esbuild`). A sugestão automática de correção envolvia voltar ao Expo 44, incompatível com o projeto; ela não foi aplicada. Rever os avisos e atualizações compatíveis do SDK antes de distribuir. Isso não foi tratado como comprovação de exploração no aplicativo nem como motivo para alterar permissões do dispositivo.

## Próxima etapa de distribuição

Instalar o APK de teste e executar a matriz de `ANDROID.md` em dispositivos; concluir os masters e revisar as últimas integrações no navegador; configurar a assinatura do proprietário e somente então promover uma versão de distribuição. A configuração `production` já prevê AAB para uma futura publicação na Google Play.
