# Auditoria e estratégia da evolução V6

Data: 23 de outubro de 2026. Base analisada: commit `6a16663`.

## Resultado da inspeção antes das alterações

- A aplicação é HTML/CSS/JavaScript sem framework. A entrada é `dist/index.html`; os arquivos servidos são também o código-fonte.
- `history/app.js` concentra interface, navegação por hash, regras, persistência e diálogos. O acoplamento dificulta portar a experiência para Android.
- `history/painter.js` reconstrói os pixels do Canvas em cada pintura e seleciona regiões por uma máscara. Não há traços, camadas editáveis, pressão, refazer ou pan/zoom por gestos.
- `history/state.js` valida `localStorage`, mas limita cena/capítulo por números fixos. Os IDs das regiões dependem da dificuldade. Desbloqueios e estrelas derivam de regiões totalmente preenchidas.
- As nove imagens PNG têm cerca de 3,6–3,9 MB cada e resolução próxima de 1672 × 940. São ilustrações parcialmente coloridas, inadequadas como line art final da nova mecânica. Permanecem como referências e conteúdo legado.
- Nove JSON contêm 27 máscaras conectadas de 336 × 189. O gerador Python segmenta por cor e proximidade; isso não identifica objetos semanticamente.
- A interface possui identidade acolhedora, paleta terrosa, círculo HSV, RGB/HEX, texturas, brilho, exportação PNG e adaptação móvel. Esses conceitos e funções de cor podem ser reaproveitados.
- Os 19 testes existentes cobrem mapas, cores, persistência e progressão das versões anteriores; não validam pintura com gestos ou execução nativa.
- O servidor é estático e restrito a loopback. Não há React, TypeScript, SQLite, service worker, projeto Android, ferramentas de build Android ou SDK Android instalado neste ambiente.

## Componentes preservados

Manter `dist/` e os testes legados como versão V5 jogável; preservar as chaves antigas sem apagá-las. Reutilizar narrativa das nove cenas, direção artística, cores e organização visual. A nova aplicação será desenvolvida em `apps/` com regras independentes de plataforma em `packages/`.

## Dados e migração

Detectar `colore-history-v1`, `colore-studio-v1` e `colore-freepaint-v1`. Copiar os registros antigos antes de importar. Migrar conclusões reconhecidas e manter os dados originais disponíveis para exportação na versão anterior. Regiões preenchidas não são pinceladas: nunca convertê-las em traços fictícios. Registrar incompatibilidades e operações já migradas, permitindo repetição segura e recuperação parcial. A nova persistência deve ter transações, versão e backup verificável.

## Sequência incremental

1. Criar monorepo React/TypeScript com adaptadores web e React Native, sem substituir a V5 durante a construção.
2. Implementar operações de traços compartilhadas, interpolação, ferramentas distintas, materiais, borracha e histórico; validar uma cena real.
3. Adicionar SQLite no worker web (OPFS quando disponível e fallback persistente) e SQLite nativo, com contratos comuns.
4. Implementar catálogo narrativo de 15 caminhos/75 fases, recompensas idempotentes, 50 níveis, personagem modular e roupas editáveis.
5. Produzir ilustrações distintas em preto e branco; registrar assets realmente presentes e não disponibilizar entradas sem arte como fases prontas.
6. Validar interfaces web/nativa, builds e recuperação de dados. Configurar APK/AAB; só declarar APK entregue se o artefato for gerado e verificado.
7. Atualizar documentação e critérios de aceitação com resultados reais. Publicar a nova web somente após as verificações, preservando acesso à versão anterior.

## Riscos e decisões

Separar catálogo planejado de assets entregues. A geração de 75 ilustrações exige produção e inspeção individual; arte ausente não pode ser contabilizada. Evitar imagens base64 a cada gesto: persistir operações e miniaturas sob demanda. Não prometer desempenho Android sem aparelho/emulador. SQLite OPFS tem diferenças de suporte entre navegadores, portanto o fallback deve ser explícito. Não copiar tokens de publicação, gravações pessoais ou caches para o repositório.
