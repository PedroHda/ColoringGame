# Colorê para Android

O aplicativo em [`apps/mobile/`](../apps/mobile/) usa **React Native + TypeScript + Skia + SQLite nativo**. A interface e a pintura são nativas. Não há WebView nem dependência do servidor web para jogar um pacote instalado.

**Estado desta entrega:** TypeScript, compatibilidade das dependências Expo, configuração pública, empacotamento Hermes Android e geração do projeto nativo foram verificados. Nenhum `.apk` ou `.aab` foi gerado neste ambiente. Não houve execução em aparelho ou emulador; a validação de gestos, GPU, pressão, exportação e recuperação SQLite em dispositivos permanece obrigatória antes da distribuição.

## Versões escolhidas

O projeto fixa a família estável SDK 55, com os pares documentados pelo Expo. Não é uma atualização automática para a versão mais recente.

| Componente | Versão | Responsabilidade |
| --- | --- | --- |
| Expo | `~55.0.32` | Projeto nativo, CLI e módulos |
| React / React Native | `19.2.0` / `0.83.10` | Componentes e runtime nativo |
| React Native Skia | `2.4.18` | Traços, camadas, materiais e PNG |
| Gesture Handler | `~2.30.0` | Um dedo pinta; dois dedos navegam |
| Reanimated / Worklets | `4.2.1` / `0.7.4` | Transformações na interface |
| Expo SQLite | `~55.0.20` | Banco local transacional |
| Expo File System / Sharing | `~55.0.26` / `~55.0.25` | Arquivos e compartilhamento nativo |

As versões dos demais módulos estão em `apps/mobile/package.json`; a resolução exata fica no `package-lock.json` dessa pasta. Confira a [matriz oficial do Expo SDK 55](https://docs.expo.dev/versions/v55.0.0/) e o [manifesto de módulos do SDK 55](https://github.com/expo/expo/blob/sdk-55/packages/expo/bundledNativeModules.json).

## Instalação e desenvolvimento

Requisito deste repositório: Node.js 22.19 ou superior compatível com o SDK. Os testes SQL utilizam `node:sqlite`; o runtime usado nesta entrega foi Node 22.19.0. O aplicativo mantém suas dependências separadas da aplicação web.

Na raiz do repositório:

```powershell
npm ci --prefix apps/mobile
npm run assets --prefix apps/mobile
npm run check --prefix apps/mobile
npm test --prefix apps/mobile
npm run bundle:android --prefix apps/mobile
```

Não são necessárias variáveis de ambiente, chaves de IA, login do jogador ou servidor próprio para a execução principal. O primeiro `npm ci` precisa da rede para baixar bibliotecas. Depois do build, os contornos registrados no manifesto acompanham o aplicativo.

Para o desenvolvimento nativo local, instale JDK 17, Android Studio, Android SDK Platform 36, Build Tools e Platform Tools. Configure `JAVA_HOME` e `ANDROID_HOME` para suas instalações, e disponibilize `adb` no `PATH`. Consulte o [guia oficial do Expo para Android Studio](https://docs.expo.dev/workflow/android-studio-emulator/).

Com emulador iniciado ou aparelho conectado e autorizado para depuração USB:

```powershell
cd apps/mobile
npm run android
```

Depois que o cliente de desenvolvimento estiver instalado:

```powershell
npm start
```

O comando usa `expo start --dev-client`. O cliente de desenvolvimento pode precisar do Metro durante o desenvolvimento. **O perfil `preview` abaixo gera o aplicativo independente para uso offline**, em vez de entregar somente uma experiência no Expo Go.

## APK para instalar diretamente

O identificador Android é `com.pedrohda.colore`. Nome, versão, ícone, ícone adaptativo, splash e orientações estão definidos em [`app.json`](../apps/mobile/app.json). A orientação `default` permite retrato e paisagem; a pintura usa painel lateral quando há largura disponível. Não há solicitação de câmera, microfone ou acesso geral ao armazenamento. Exportar utiliza arquivos da aplicação e a folha de compartilhamento do Android.

### EAS Build remoto

O EAS requer conta Expo e um projeto vinculado à conta responsável. Não foram inventados `owner`, `projectId`, chaves de assinatura ou credenciais. O proprietário deve vinculá-los na primeira configuração:

```powershell
cd apps/mobile
npm install --global eas-cli
eas login
eas init
npm run build:apk
```

[`eas.json`](../apps/mobile/eas.json) contém:

| Perfil | Saída | Uso |
| --- | --- | --- |
| `development` | `.apk` com cliente de desenvolvimento | Depuração e Metro |
| `preview` | `.apk` independente, distribuição interna | Instalação direta, teste offline |
| `production` | `.aab` | Distribuição futura pela Google Play |

O perfil `preview` declara explicitamente `android.buildType: "apk"`. Ao configurar as credenciais, é possível deixar o EAS administrar o keystore ou fornecer um keystore do proprietário. Guarde uma cópia segura da assinatura: atualizações do mesmo aplicativo precisam da assinatura correspondente. Nunca versione `credentials.json`, `.jks`, `.keystore` ou senhas.

```powershell
npm run build:development
npm run build:apk
npm run build:aab
```

Documentação oficial: [APKs no EAS](https://docs.expo.dev/build-reference/apk/), [credenciais Android](https://docs.expo.dev/app-signing/managed-credentials/), [monorepos no EAS](https://docs.expo.dev/build-reference/build-with-monorepos/).

### Build local com Gradle

O Expo gera o projeto Android a partir da configuração mantida no repositório. Em ambiente com JDK/SDK instalados:

```powershell
cd apps/mobile
npm run prebuild:android
cd android
.\gradlew.bat assembleRelease
```

O comando de preparação utiliza `scripts/prebuild.mjs`. Neste computador Windows/OneDrive, a primeira execução direta do Expo falhou porque a cópia do template via Node não deixou o diretório nativo no destino (`Project file "MainApplication" does not exist`). O adaptador Windows extrai o **template oficial instalado em `expo/template.tgz`**, copia com `Copy-Item` e então executa a configuração normal do Expo. Não altera o SDK nem as dependências instaladas. Em outros sistemas, usa diretamente o prebuild do Expo. Foram gerados e conferidos `MainApplication.kt`, `MainActivity.kt`, Gradle, manifesto com pacote correto, orientações e bloqueios de permissões. Isso resolve a preparação dos fontes; a compilação binária continua exigindo JDK e Android SDK.

O arquivo fica em `apps/mobile/android/app/build/outputs/apk/release/`. Confira a configuração de assinatura gerada **antes de distribuir**: a configuração padrão de desenvolvimento não substitui a assinatura definitiva do proprietário. O diretório `android/` é gerado e ignorado; uma necessidade de código nativo próprio exigirá passar a manter esse diretório e o processo correspondente.

Instalação de um APK construído e assinado:

```powershell
adb devices
adb install -r caminho\para\colore.apk
```

### Limites encontrados neste computador

Não estão disponíveis `java`, `adb`, `gradle` nem uma instalação do Android SDK. Também não há projeto EAS vinculado e autenticado para esta aplicação. Por isso, o build binário não foi executado. `expo export --platform android` verifica o bundle e seus assets, **não gera APK, não executa código nativo e não comprova comportamento em aparelho**.

## Pintura e controles

- Um dedo desenha traços contínuos; a pressão da caneta é lida quando fornecida pelo dispositivo.
- Dois dedos deslocam a tela; a pinça amplia de 1× até 8×. “Ajustar” retorna à composição inteira.
- Pincel, tamanho, opacidade, alfa, intensidade, suavidade, textura e mistura controlam os traços. Pincéis e materiais são liberados conforme as regras compartilhadas de nível.
- Lápis/giz/carvão utilizam grãos; aerógrafo usa névoa concêntrica; aquarela acumula transparência e borda; pincéis fino/grosso usam ponta orientada e cerdas; caneta e marcador usam caminhos contínuos. Os materiais acrescentam pigmento, relevo, brilho ou partículas conforme a combinação.
- O círculo HSV, luminosidade, saturação, RGB, hexadecimal, conta-gotas, cores recentes e paletas favoritas permitem escolher cores livremente.
- A borracha limpa apenas a camada isolada de tinta. O contorno é composto depois, em multiplicação, e continua visível.
- Desfazer/refazer preservam operações editáveis. A conclusão é uma escolha explícita do jogador após ao menos uma pincelada; não depende de números ou porcentagem de regiões.
- “Ocultar” amplia a área de pintura; “Exportar PNG” gera a composição na resolução do documento e abre o compartilhamento do Android.

Os comandos nativos de cada traço finalizado são registrados em `SkPicture` e reaproveitados. A pintura ativa é atualizada separadamente. Em obras muito extensas, a regravação do traço ativo e o custo de composição ainda precisam de medição em aparelhos modestos; não há promessa de 60 FPS validada.

## Jornada, personagem e roupas

O aplicativo lê o mesmo catálogo e as mesmas regras de `packages/game-content` e `packages/core` usados na web. Há 15 caminhos e 75 entradas narrativas; o número de ilustrações prontas é o número efetivamente registrado no catálogo e no manifesto nativo. Uma fase sem arte continua identificada como “arte em produção” e não pode ser aberta como se estivesse pronta. Fases futuras também respeitam o desbloqueio sequencial.

O ateliê cria versões independentes das fases descobertas. As nove peças vetoriais compartilhadas ficam em `assets/clothing/`, registradas em `packages/core/wardrobe.ts`. Camiseta, chapéu de artista e bolsa de viagem são iniciais; seis peças inspiradas nos contextos da jornada são liberadas por caminhos. O jogador pinta, salva uma prévia e equipa a obra no personagem. O vínculo persistente é `player.equipped[slot] = painting.id`; o perfil desenha a prévia recortada sobre o encaixe correspondente. Nome, pele, cabelo, cor, rosto, expressão, roupa base, calçado e acessório são locais e persistentes.

As prévias são produzidas com até 360 pixels de largura ao sair do editor ou concluir a obra; não se grava PNG/base64 a cada gesto. Ao restaurar um backup, as prévias podem precisar ser regeneradas abrindo a obra e saindo do editor.

## Banco e recuperação

O banco `colore-v6.db` usa `expo-sqlite`, WAL e chaves estrangeiras. As alterações passam por uma fila única de escrita e transações `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` na mesma conexão que recebeu `PRAGMA foreign_keys=ON`; as leituras públicas aguardam a fila. Isso evita depender do estado de uma segunda conexão criada implicitamente por um helper. A inicialização verifica `PRAGMA user_version` e não abre silenciosamente um esquema futuro.

| Tabela | Conteúdo |
| --- | --- |
| `profiles` | Perfil, aparência, XP, preferências e referências equipadas |
| `paintings` | Identidade, base, nome, dimensões e datas da obra |
| `layers` | Camada de tinta vinculada à obra |
| `strokes` | Cada operação editável, posição, estado de desfazer e dados validados; chave composta `(painting_id,id)` na migração 3 |
| `stage_progress` | Fases concluídas e perfil |
| `inventory` | Recompensas e descobertas do perfil |
| `palettes` | Paletas favoritas |
| `migration_log` | Versões aplicadas |
| `legacy_snapshots` | Cópias textuais dos dados antigos trazidos em backups da web, migração 2 |

Finalizar uma fase grava pintura e progresso na mesma transação. Cada fim de traço entra na fila de salvamento; gestos de movimento não geram escritas no banco. Operações imutáveis já existentes não são regravadas integralmente: apenas novas operações, mudança de ordem/desfazer e exclusões são persistidas. Transações interrompidas são revertidas pelo SQLite. Um gesto em andamento ou uma operação ainda indicada como “Salvando…” pode ser perdido se o sistema encerrar o processo antes de concluir a gravação; a versão anterior persistida permanece no banco.

Em Ajustes, “Exportar backup editável” cria JSON no contrato compartilhado `Backup` (`format: "colore-backup"`, `version: 1`), com perfil, `drawings` e cópias `legacy`. Web e Android usam esse mesmo formato e os mesmos dados de traços. “Importar backup” valida dimensões, limites de traços/pontos, cores, ferramentas, URLs internas e identidade antes da transação; o aplicativo preserva primeiro uma cópia local do estado anterior. Uma falha de restauração reverte a transação. O backup não inclui as ilustrações instaladas nem arquivos de áudio. Miniaturas são opcionais e podem ser regeneradas após abrir e sair de cada obra.

O aplicativo Android não acessa o `localStorage` de um navegador por conta própria. A migração dos dados V5 acontece primeiro na versão web; depois, exporte o backup compartilhado na web e importe no Android. As cópias `legacy` são preservadas na tabela `legacy_snapshots` e reaparecem na próxima exportação. Obras importadas cuja arte ainda não esteja instalada são preservadas, mas o editor pede atualização do pacote em vez de abrir uma tela sem ilustração. O adaptador puro `src/backup-format.ts` possui cinco testes de roundtrip, peças equipadas, IDs locais por obra e rejeição de dados corrompidos. Dois testes adicionais executam o SQL real das migrações em `node:sqlite`, verificando preservação de dados, unicidade, cascatas e rollback. Os sete passaram; o driver `expo-sqlite`, o transporte de arquivos e a restauração ainda precisam de teste real no Android.

## Acrescentar ilustrações offline

1. Produza e valide a arte em `assets/illustrations/pNN-sNN.png`, seguindo o pipeline de conteúdo.
2. Registre o caminho verdadeiro em `stage.asset`, com dimensões correspondentes.
3. Execute `npm run assets --prefix apps/mobile`. O script valida o catálogo e os hashes, produz cópias de distribuição em `apps/mobile/assets/illustrations/` e compara todos os pixels RGBA com os masters. A compressão é sem perdas; as imagens originais permanecem intactas.
4. Confira `apps/mobile/src/generated/illustrations.ts`: o arquivo contém `require()` estáticos somente para os PNGs validados e suas miniaturas derivadas. Jornada e seleção usam prévias de até 320×200; o editor e a exportação usam a ilustração de resolução completa.
5. Execute TypeScript e `bundle:android`; reinstale um novo APK para incluir os assets novos.

O hook `eas-build-post-install` atualiza o manifesto no build remoto. Os arquivos SVG de roupas também são incluídos com `require()` estáticos. Não há download de imagens nem chamada de IA durante o jogo.

As cópias e miniaturas são derivadas e ignoradas pelo Git; `npm run assets` as regenera antes de empacotar. `@napi-rs/canvas` é uma dependência de desenvolvimento do pipeline, executada no computador de build, e não é incluída no renderizador Android. O procedimento e os hashes de igualdade estão descritos em [Distribuição de ilustrações](DISTRIBUICAO-ILUSTRACOES.md).

## Áudio e acessibilidade

`expo-speech` utiliza a síntese de voz do dispositivo, com texto sempre disponível. Sem a voz portuguesa instalada, o jogo continua silenciosamente utilizável e apresenta o texto; nenhuma API paga de narração é exigida. Há controles separados de música, efeitos e narração, além da preferência de feedback tátil.

`expo-audio` reproduz cinco WAV originais, produzidos de forma determinística por `apps/mobile/scripts/generate-audio.mjs`: quatro ambiências harmônicas suaves em loops de 16 segundos e um efeito curto de descoberta. A seleção acompanha os grupos de caminhos (terra, rios, oficinas e amanhã), conforme `packages/core/ambience.ts`. Esses arquivos acompanham o aplicativo; não são músicas de terceiros nem gravações pessoais. A música começa desligada por padrão e pausa ao entrar em segundo plano. O plugin de áudio não solicita microfone nem execução em segundo plano. A reprodução real, interrupções de áudio e volumes em aparelho permanecem parte da validação Android pendente.

Botões têm alvos mínimos de toque e rótulos; cores podem ser digitadas sem depender do círculo cromático. Leitura completa da superfície artística por leitor de tela e validação de contraste/tamanhos em todos os aparelhos ainda exigem auditoria específica.

## Validação necessária antes de distribuir

Os itens abaixo são o roteiro de testes em hardware, não uma declaração de aprovação:

- [ ] Instalar o APK `preview`, desligar Wi-Fi/dados e abrir todas as ilustrações incluídas.
- [ ] Pintar com dedo e, quando disponível, caneta; verificar pressão e rejeição de gestos com dois dedos.
- [ ] Testar pinça e pan simultâneos, limites da tela, retrato/paisagem e controles ocultos.
- [ ] Comparar ferramentas e materiais, borracha, mistura, conta-gotas e camadas de contorno.
- [ ] Desfazer/refazer, encerrar o app, reabrir e comparar dados e aparência.
- [ ] Exportar PNG, abrir em outro aplicativo e verificar dimensões e contornos.
- [ ] Pintar/equipar roupa e confirmar a mesma pintura no personagem após reiniciar.
- [ ] Concluir fase duas vezes: XP e recompensas devem ser concedidos uma única vez.
- [ ] Exportar/importar backup, experimentar um backup inválido e verificar que o banco anterior foi preservado.
- [ ] Narrar com e sem voz instalada, testar volume e preferência tátil.
- [ ] Medir memória, latência e fluidez em aparelhos modestos e intermediários com pinturas longas.
- [ ] Verificar instalação/atualização com assinatura definitiva, concessão mínima de permissões e política de backup Android.

