import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { paths, stages } from "../../../packages/game-content/index";
import type {
  HistoricalPath,
  Stage,
} from "../../../packages/game-content/index";
import {
  initialPlayer,
  sanitizePlayer,
  levelProgress,
  getLevel,
  isStageUnlocked,
  completeStage,
  achievements,
  collectAchievements,
  migrateLegacy,
  toolUnlocks,
  materialUnlocks,
} from "../../../packages/core/index";
import type { Player } from "../../../packages/core/index";
import { wardrobe, isClothingUnlocked } from "../../../packages/core/wardrobe";
import {
  createDocument,
  tools,
  materials,
} from "../../../packages/drawing-engine/index";
import type {
  Drawing,
  DrawingSummary,
} from "../../../packages/shared-types/index";
import { database } from "./database";
import { thumbnailFor } from "./thumbnail";
import { Avatar } from "./Avatar";
import { Painting, downloadBlob } from "./Painting";
import { music, narrate, sound, resumeAudio } from "./audio";
import { ambienceForPath } from "../../../packages/core/ambience";
import "./style.css";
const previewAsset = (url: string) =>
  import.meta.env.PROD && url.endsWith(".png")
    ? url.replace(/\.png$/, ".thumb.png")
    : url;

function App() {
  const [player, setPlayer] = useState<Player | null>(null),
    [loaded, setLoaded] = useState(false),
    [fatal, setFatal] = useState(""),
    [mode, setMode] = useState(""),
    [view, setView] = useState(location.hash.slice(1) || "jornada"),
    [works, setWorks] = useState<DrawingSummary[]>([]),
    [drawing, setDrawing] = useState<Drawing | null>(null),
    [selectedPath, setSelectedPath] = useState<HistoricalPath | null>(null),
    [toast, setToast] = useState(""),
    [onboarding, setOnboarding] = useState(false),
    [completion, setCompletion] = useState<Drawing | null>(null),
    [confirm, setConfirm] = useState(false),
    [completing, setCompleting] = useState(false),
    [reward, setReward] = useState<{ xp: number; text: string } | null>(null),
    [outfits, setOutfits] = useState<Record<string, string>>({}),
    [downloading, setDownloading] = useState(false),
    [legacyCount, setLegacyCount] = useState(0);
  const legacy = useRef<Record<string, string>>({}),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    playerRef = useRef<Player | null>(null);
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  };
  async function reloadWorks() {
    const list = await database.list();
    setWorks(list);
    return list;
  }
  async function updatePlayer(next: Player) {
    const previous = playerRef.current;
    next = collectAchievements(sanitizePlayer(next));
    playerRef.current = next;
    setPlayer(next);
    try {
      await database.savePlayer(next);
      return true;
    } catch (e) {
      playerRef.current = previous;
      setPlayer(previous);
      notify(`Seu perfil não foi salvo: ${String(e)}`);
      return false;
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        const state = await database.init();
        setMode(state.mode);
        legacy.current = { ...state.legacy };
        for (const key of [
          "colore-history-v1",
          "colore-studio-v1",
          "colore-freepaint-v1",
        ]) {
          try {
            const value = localStorage.getItem(key);
            if (value) legacy.current[key] = value;
          } catch {}
        }
        await database.legacy(legacy.current);
        setLegacyCount(Object.keys(legacy.current).length);
        let p = state.player;
        if (p && legacy.current["colore-history-v1"]) {
          try {
            const result = migrateLegacy(
              p,
              JSON.parse(legacy.current["colore-history-v1"]),
            );
            p = result.player;
            await database.savePlayer(p);
            if (result.imported)
              notify(
                `${result.imported} memórias antigas preservadas. As pinturas V5 continuam disponíveis.`,
              );
          } catch {
            notify(
              "O backup antigo foi preservado, mas alguns dados não puderam ser importados.",
            );
          }
        }
        setPlayer(p);
        playerRef.current = p;
        setOnboarding(!p);
        const savedWorks = await reloadWorks();
        if (location.hash === "#colorir" && savedWorks.length) {
          const savedDrawing = await database.get(savedWorks[0].id);
          if (savedDrawing) {
            setDrawing(savedDrawing);
            setView("colorir");
          }
        }
        setLoaded(true);
      } catch (e) {
        setFatal(String(e));
      }
    })();
    return () => music(0);
  }, []);
  useEffect(() => {
    function change() {
      const v = location.hash.slice(1) || "jornada";
      if (v !== "colorir") setDrawing(null);
      setView(v);
    }
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const equippedKey = JSON.stringify(player?.equipped ?? {});
  const ambiencePath =
    stages.find((s) => s.id === drawing?.stageId)?.pathId ?? selectedPath?.id;
  useEffect(() => {
    const apply = () =>
      music(
        document.hidden ? 0 : (player?.preferences.music ?? 0),
        ambienceForPath(ambiencePath),
      );
    apply();
    document.addEventListener("visibilitychange", apply);
    document.addEventListener("pointerdown", resumeAudio);
    return () => {
      document.removeEventListener("visibilitychange", apply);
      document.removeEventListener("pointerdown", resumeAudio);
      music(0);
    };
  }, [player?.preferences.music, ambiencePath]);
  useEffect(() => {
    const urls: Record<string, string> = {};
    let cancelled = false;
    setOutfits({});
    void Promise.all(
      Object.entries(JSON.parse(equippedKey) as Record<string, string>).map(
        async ([slot, id]) => {
          const work = works.find((w) => w.id === id);
          if (!work) return;
          try {
            const bytes = await thumbnailFor(work);
            if (!cancelled)
              urls[slot] = URL.createObjectURL(
                new Blob([new Uint8Array(bytes)], { type: "image/png" }),
              );
          } catch {
            /* The editable painting remains available even if a preview fails. */
          }
        },
      ),
    ).then(() => {
      if (!cancelled) setOutfits({ ...urls });
    });
    return () => {
      cancelled = true;
      Object.values(urls).forEach(URL.revokeObjectURL);
    };
  }, [equippedKey, works]);
  function navigate(next: string) {
    sound(playerRef.current?.preferences.effects ?? 0);
    setSelectedPath(null);
    setView(next);
    setDrawing(null);
    location.hash = next;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function createProfile(p: Player) {
    if (legacy.current["colore-history-v1"])
      try {
        const result = migrateLegacy(
          p,
          JSON.parse(legacy.current["colore-history-v1"]),
        );
        p = result.player;
        if (result.imported)
          notify(
            `${result.imported} conclusões V5 importadas. Seus dados originais foram preservados.`,
          );
      } catch {
        notify("Backup V5 guardado para consulta na versão anterior.");
      }
    if (await updatePlayer(p)) setOnboarding(false);
  }
  async function openStage(stage: Stage, newVersion = false) {
    if (!player) return;
    if (!isStageUnlocked(player, stage.id)) {
      notify("Siga os marcos anteriores para chegar a esta parte da história.");
      return;
    }
    if (!stage.asset) {
      notify(
        "A ilustração desta etapa ainda está em produção. Ela não está marcada como pronta.",
      );
      return;
    }
    const old = !newVersion ? works.find((w) => w.stageId === stage.id) : null;
    if (old) {
      const saved = await database.get(old.id);
      if (saved) {
        setDrawing(saved);
        setView("colorir");
        location.hash = "colorir";
        setSelectedPath(null);
        return;
      }
    }
    const now = new Date().toISOString();
    const next: Drawing = {
      id: crypto.randomUUID(),
      title: stage.title,
      stageId: stage.id,
      kind: "scene",
      asset: stage.asset,
      createdAt: now,
      updatedAt: now,
      completed: false,
      document: createDocument(stage.width || 2048, stage.height || 1280),
    };
    await database.save(next);
    setDrawing(next);
    setView("colorir");
    location.hash = "colorir";
    setSelectedPath(null);
    await reloadWorks();
  }
  async function openClothing(itemId: string) {
    if (!player) return;
    const item = wardrobe.find((item) => item.id === itemId);
    if (!item || !isClothingUnlocked(player, item)) return;
    const owned = works.find(
      (w) => w.kind === "clothing" && w.asset === item.asset,
    );
    let d = owned ? await database.get(owned.id) : null;
    if (!d) {
      const now = new Date().toISOString();
      d = {
        id: crypto.randomUUID(),
        title: item.title,
        stageId: null,
        kind: "clothing",
        subjectId: item.slot,
        asset: item.asset,
        createdAt: now,
        updatedAt: now,
        completed: false,
        document: createDocument(512, 512),
      };
      await database.save(d);
    }
    setDrawing(d);
    setView("colorir");
    location.hash = "colorir";
  }
  async function openWork(work: DrawingSummary) {
    const saved = await database.get(work.id);
    if (saved) {
      setDrawing(saved);
      setView("colorir");
      location.hash = "colorir";
    }
  }
  async function complete() {
    if (!completion || !player || completing) return;
    setCompleting(true);
    try {
      const next = {
        ...completion,
        completed: true,
        updatedAt: new Date().toISOString(),
      };
      if (next.kind === "clothing") {
        const equipped = collectAchievements(
          sanitizePlayer({
            ...player,
            equipped: { ...player.equipped, [next.subjectId!]: next.id },
            accessory:
              next.subjectId === "shirt" ? player.accessory : next.subjectId!,
          }),
        );
        await database.saveWithPlayer(next, equipped);
        setPlayer(equipped);
        playerRef.current = equipped;
        setCompletion(null);
        setConfirm(false);
        await reloadWorks();
        navigate("perfil");
        notify(
          "Sua peça foi salva e equipada. Você pode pintá-la novamente quando quiser.",
        );
        return;
      }
      const result = completeStage(player, next.stageId!);
      await database.saveWithPlayer(next, result.player);
      setPlayer(result.player);
      playerRef.current = result.player;
      await reloadWorks();
      setDrawing(null);
      setCompletion(null);
      setConfirm(false);
      sound(player.preferences.effects, "reward");
      if (player.preferences.haptics) navigator.vibrate?.([12, 25, 20]);
      setReward({
        xp: result.xpGranted,
        text:
          stages.find((s) => s.id === next.stageId)?.outro ??
          "Sua história ganhou uma nova cor.",
      });
      navigate("jornada");
    } catch (error) {
      notify(`Sua obra não pôde ser concluída: ${String(error)}`);
    } finally {
      setCompleting(false);
    }
  }
  async function backup() {
    const content = await database.backup();
    downloadBlob(
      new Blob([JSON.stringify(content)], { type: "application/json" }),
      `colore-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
    notify("Backup com perfil, traços editáveis e dados legados exportado.");
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      notify("O backup excede o limite de 100 MB.");
      return;
    }
    try {
      const raw = JSON.parse(await file.text());
      const previous = await database.backup();
      downloadBlob(
        new Blob([JSON.stringify(previous)], { type: "application/json" }),
        `colore-antes-da-restauracao-${Date.now()}.json`,
      );
      await database.restore(raw);
      const state = await database.init();
      setPlayer(state.player);
      playerRef.current = state.player;
      await reloadWorks();
      notify(
        "Backup validado e importado. Obras com o mesmo identificador foram restauradas.",
      );
    } catch (e) {
      notify(`Backup não importado: ${String(e)}`);
    }
  }
  async function cachePath(path: HistoricalPath) {
    if (!("caches" in window)) {
      notify("Este navegador não oferece cache offline.");
      return;
    }
    setDownloading(true);
    try {
      const cache = await caches.open("colore-art-v6");
      let count = 0;
      for (const s of path.stages)
        if (s.asset) {
          const response = await fetch(s.asset);
          if (!response.ok) throw Error("Imagem indisponível");
          await cache.put(s.asset, response);
          if (import.meta.env.PROD) {
            const thumb = previewAsset(s.asset);
            const preview = await fetch(thumb);
            if (preview.ok) await cache.put(thumb, preview);
          }
          count++;
        }
      notify(
        `${count} ilustrações guardadas para jogar offline neste navegador.`,
      );
    } catch (e) {
      notify(`Não foi possível concluir o download: ${String(e)}`);
    } finally {
      setDownloading(false);
    }
  }
  const voice = (text: string) => {
    if (!narrate(text, player?.preferences.narration ?? 0.8))
      notify(
        "Narração não disponível neste navegador. O texto continua aqui para leitura.",
      );
  };
  const p = player ?? initialPlayer(),
    xp = levelProgress(p.xp),
    nextStage = stages.find((s) => !p.completed.includes(s.id)),
    readyCount = stages.filter((s) => s.asset).length;
  const avatar = (
    <Avatar
      player={p}
      shirt={outfits.shirt}
      hat={outfits.hat}
      bag={outfits.bag}
      equipmentAssets={Object.fromEntries(
        works.map((work) => [work.id, work.asset]),
      )}
    />
  );
  if (fatal)
    return (
      <main className="startup">
        <h1>Vamos cuidar das suas cores.</h1>
        <p>O armazenamento não abriu. Nenhum dado antigo foi apagado.</p>
        <pre>{fatal}</pre>
        <button onClick={() => location.reload()}>Tentar novamente</button>
        <a href="/legacy/">Abrir versão V5</a>
      </main>
    );
  if (!loaded)
    return (
      <main className="startup">
        <img src="/characters/brand.svg" width="64" />
        <h1>Preparando seu ateliê…</h1>
        <p>Organizando papel, pigmentos e suas memórias.</p>
      </main>
    );
  return (
    <>
      <header className="site-header">
        <button className="brand" onClick={() => navigate("jornada")}>
          <img src="/characters/brand.svg" alt="" />
          colorê<span>.</span>
        </button>
        <nav aria-label="Navegação principal">
          {[
            ["jornada", "Minha jornada"],
            ["livre", "Ateliê livre"],
            ["colecao", "Coleção"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="profile-chip" onClick={() => navigate("perfil")}>
          {avatar}
          <span>
            {p.name}
            <small>
              Nível {xp.level} · {p.xp} XP
            </small>
            <i>
              <b style={{ width: `${xp.ratio * 100}%` }} />
            </i>
          </span>
        </button>
        <button
          className="settings-shortcut"
          aria-label="Configurações"
          onClick={() => navigate("configuracoes")}
        >
          ⚙
        </button>
      </header>
      <main className={view === "colorir" ? "main editor-main" : "main"}>
        {view === "colorir" && drawing && (
          <Painting
            key={drawing.id}
            drawing={drawing}
            player={p}
            onPlayer={(next) => void updatePlayer(next)}
            onSave={(d) => database.save(d)}
            onBack={() => {
              void reloadWorks();
              navigate(drawing.kind === "clothing" ? "perfil" : "jornada");
            }}
            onComplete={(d) => {
              if (
                !d.document.strokes.some(
                  (s) => s.settings.tool !== "eraser" && s.points.length >= 2,
                )
              ) {
                notify(
                  "Deixe ao menos uma pincelada antes de concluir. Não existe uma cor certa.",
                );
                return;
              }
              setCompletion(d);
              setConfirm(false);
            }}
            notify={notify}
          />
        )}
        {view === "jornada" && (
          <>
            <div className="page-kicker">
              O CAMINHO DAS CORES <span>UMA VIAGEM PELA CRIAÇÃO HUMANA</span>
            </div>
            <section className="journey-hero">
              <div className="hero-copy">
                <p className="eyebrow">UM MUNDO INTEIRO. DO SEU JEITO.</p>
                <h1>
                  A história espera
                  <br />a <em>sua marca.</em>
                </h1>
                <p>
                  Um gesto vira cor. Uma cor vira memória.
                  <br />
                  Viaje por épocas e crie sem precisar seguir números.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    nextStage ? void openStage(nextStage) : navigate("colecao")
                  }
                >
                  {p.completed.length
                    ? "Continuar minha viagem"
                    : "Começar minha jornada"}{" "}
                  <span>→</span>
                </button>
                <small>
                  {p.completed.length} memórias · nível {xp.level} · no seu
                  ritmo
                </small>
              </div>
              <div className="hero-art">
                {paths[0]?.stages[0]?.asset && (
                  <img
                    src={paths[0].stages[0].asset}
                    alt="Ilustração em preto e branco das primeiras marcas"
                  />
                )}
                <div className="hero-avatar">{avatar}</div>
                <div className="hero-note">
                  <span>SEU PRÓXIMO ENCONTRO</span>
                  <strong>{nextStage?.title ?? "Sua coleção em cores"}</strong>
                  <small>
                    {nextStage
                      ? paths.find((path) => path.id === nextStage.pathId)
                          ?.title
                      : "Toda história pode recomeçar."}
                  </small>
                </div>
              </div>
            </section>
            <section className="journey-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">TRILHAS QUE SE ENCONTRAM</p>
                  <h2>Um caminho. Muitas histórias.</h2>
                </div>
                <span>
                  {p.completed.length} / {stages.length} memórias
                </span>
              </div>
              <p className="section-description">
                Escolha um caminho no mapa. Cada encontro revela cinco novas
                páginas para colorir.
              </p>
              <div className="world-map-scroll">
                <div className="world-map">
                  <svg
                    className="map-road"
                    viewBox="0 0 1200 850"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path d="M110 140H1090Q1200 140 1090 420H110Q-10 420 110 700H1090" />
                    <path
                      className="road-dash"
                      d="M110 140H1090Q1200 140 1090 420H110Q-10 420 110 700H1090"
                    />
                  </svg>
                  <div className="map-nodes">
                    {paths.map((path, index) => {
                      const done = path.stages.filter((s) =>
                          p.completed.includes(s.id),
                        ).length,
                        unlocked = isStageUnlocked(p, path.stages[0].id),
                        active = nextStage?.pathId === path.id,
                        art = path.stages.find((s) => s.asset)?.asset;
                      return (
                        <button
                          className={`map-node ${unlocked ? "" : "locked"} ${active ? "current" : ""}`}
                          key={path.id}
                          onClick={() => setSelectedPath(path)}
                          style={{
                            gridColumn:
                              index < 5
                                ? index + 1
                                : index < 10
                                  ? 10 - index
                                  : index - 9,
                            gridRow: Math.floor(index / 5) + 1,
                          }}
                          aria-label={`Caminho ${index + 1}: ${path.title}, ${done} de 5 concluídas`}
                        >
                          <div className="node-art">
                            {art && (
                              <img
                                src={previewAsset(art)}
                                alt=""
                                loading="lazy"
                              />
                            )}
                            <span>
                              {done === 5
                                ? "✓"
                                : String(index + 1).padStart(2, "0")}
                            </span>
                            {active && (
                              <div className="map-avatar">{avatar}</div>
                            )}
                          </div>
                          <small>{path.era}</small>
                          <strong>{path.title}</strong>
                          <em>
                            {done}/5 memórias {unlocked ? "" : "· bloqueado"}
                          </em>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
            <aside className="atelier-banner">
              <div>
                <p className="eyebrow">HOJE, AS CORES SÃO SUAS</p>
                <h2>Uma pausa no seu ateliê.</h2>
                <p>
                  Revisite uma época, experimente uma mistura ou pinte uma roupa
                  só sua.
                </p>
              </div>
              <button onClick={() => navigate("livre")}>
                Entrar no ateliê ↗
              </button>
            </aside>
            {readyCount < 75 && (
              <p className="production-note">
                Catálogo narrativo: 15 caminhos e 75 etapas. Ilustrações prontas
                e integradas: {readyCount}/75. Etapas sem arte não são
                oferecidas como fases jogáveis.
              </p>
            )}
          </>
        )}
        {view === "livre" && (
          <>
            <PageHeading
              eyebrow="SEU ESPAÇO DE CRIAÇÃO"
              title="O mundo, nas suas cores."
              text="Crie novas versões dos cenários que já descobriu. Sem metas de cores, sem uma maneira certa."
            />
            <div className="atelier-tools-banner">
              <div>{avatar}</div>
              <div>
                <h2>Vista sua criatividade.</h2>
                <p>Pinte uma peça com os mesmos pincéis das suas paisagens.</p>
                <div className="button-row">
                  {wardrobe
                    .filter((item) => isClothingUnlocked(p, item))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => void openClothing(item.id)}
                      >
                        {item.title} ↗
                      </button>
                    ))}
                </div>
              </div>
            </div>
            <h2 className="subheading">Páginas que você descobriu</h2>
            <div className="gallery-grid">
              {stages
                .filter((s) => s.asset && isStageUnlocked(p, s.id))
                .map((stage) => (
                  <button
                    className="art-card"
                    key={stage.id}
                    onClick={() => void openStage(stage, true)}
                  >
                    <img
                      src={previewAsset(stage.asset!)}
                      alt={stage.title}
                      loading="lazy"
                    />
                    <div>
                      <small>
                        {paths.find((path) => path.id === stage.pathId)?.title}
                      </small>
                      <h3>{stage.title}</h3>
                      <span>Nova versão · pintura livre →</span>
                    </div>
                  </button>
                ))}
            </div>
          </>
        )}
        {view === "colecao" && (
          <>
            <PageHeading
              eyebrow="PEQUENOS MOMENTOS PARA GUARDAR"
              title="Sua história em cores."
              text="Suas obras continuam editáveis. Volte a cada traço quando quiser."
            />
            {!works.length && (
              <div className="empty-state">
                <h2>Sua primeira marca está por vir.</h2>
                <p>Comece uma pintura. Ela encontrará um lugar por aqui.</p>
                <button className="primary" onClick={() => navigate("jornada")}>
                  Encontrar meu caminho →
                </button>
              </div>
            )}
            <div className="gallery-grid">
              {works.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  onOpen={() => void openWork(work)}
                  onRename={async (title) => {
                    const d = await database.get(work.id);
                    if (d) {
                      d.title = title.slice(0, 100) || d.title;
                      d.updatedAt = new Date().toISOString();
                      await database.save(d);
                      await reloadWorks();
                    }
                  }}
                />
              ))}
            </div>
          </>
        )}
        {view === "perfil" && (
          <>
            <PageHeading
              eyebrow="SEU COMPANHEIRO DE VIAGEM"
              title="Cada detalhe conta uma história."
              text="Seu personagem acompanha as descobertas e veste as suas próprias pinturas."
            />
            <div className="profile-layout">
              <div className="profile-portrait">
                {avatar}
                <h2>{p.name}</h2>
                <p>
                  Nível {xp.level} · {p.xp} XP
                </p>
                <progress max={1} value={xp.ratio} />
                <small>
                  {xp.level === 50
                    ? "Mestre das cores"
                    : `${xp.end - p.xp} XP para o próximo nível`}
                </small>
              </div>
              <div>
                <CharacterFields
                  player={p}
                  onChange={(next) => void updatePlayer(next)}
                />
                <div className="clothing-list">
                  <h2>Guarda-roupa pintável</h2>
                  <p>
                    Suas peças são projetos editáveis. A pintura salva aparece
                    no personagem.
                  </p>
                  {wardrobe.map((item) => (
                    <button
                      key={item.id}
                      disabled={!isClothingUnlocked(p, item)}
                      onClick={() => void openClothing(item.id)}
                    >
                      <img src={item.asset} alt="" />
                      <span>
                        {item.title}
                        <small>
                          {!isClothingUnlocked(p, item)
                            ? `Conclua o caminho ${Number(item.unlockPath!.slice(-2))}`
                            : works.some(
                                  (w) =>
                                    w.asset === item.asset &&
                                    p.equipped[item.slot] === w.id,
                                )
                              ? "Sua arte está equipada"
                              : "Uma peça esperando suas cores"}
                        </small>
                      </span>
                      <b>
                        {isClothingUnlocked(p, item)
                          ? "Pintar ↗"
                          : "Bloqueada"}
                      </b>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="button-row">
              {(["shirt", "hat", "bag"] as const)
                .filter((slot) => p.equipped[slot])
                .map((slot) => (
                  <button
                    key={slot}
                    onClick={() => {
                      const equipped = { ...p.equipped };
                      delete equipped[slot];
                      void updatePlayer({
                        ...p,
                        equipped,
                        accessory: p.accessory === slot ? "none" : p.accessory,
                      });
                    }}
                  >
                    {slot === "shirt"
                      ? "Guardar roupa pintada"
                      : slot === "hat"
                        ? "Guardar chapéu pintado"
                        : "Guardar bolsa pintada"}
                  </button>
                ))}
            </div>
            <Inventory player={p} />
            <button className="wide" onClick={() => navigate("conquistas")}>
              Ver minhas conquistas →
            </button>
          </>
        )}
        {view === "conquistas" && (
          <>
            <PageHeading
              eyebrow="PEQUENAS DESCOBERTAS"
              title="Marcas da sua viagem."
              text="Conquistas por explorar e criar. Nenhuma exige copiar uma paleta ou receber uma nota pela sua arte."
            />
            <div className="achievement-grid">
              {achievements.map((a) => (
                <article
                  className={
                    p.rewards.includes(`achievement:${a.id}`) ? "earned" : ""
                  }
                  key={a.id}
                >
                  <span>
                    {p.rewards.includes(`achievement:${a.id}`) ? "✦" : "◇"}
                  </span>
                  <h2>{a.title}</h2>
                  <p>{a.description}</p>
                  <small>
                    {p.rewards.includes(`achievement:${a.id}`)
                      ? "Conquistada · +40 XP"
                      : "Uma descoberta à sua espera"}
                  </small>
                </article>
              ))}
            </div>
          </>
        )}
        {view === "configuracoes" && (
          <>
            <PageHeading
              eyebrow="DO SEU JEITO"
              title="Uma pausa para ajustar."
              text="Seus dados ficam neste dispositivo. Você pode guardar uma cópia e levá-la a outro navegador."
            />
            <div className="settings-layout">
              <section className="settings-card">
                <h2>Som e narrativa</h2>
                <p>
                  Uma ambiência sintetizada suave, sem serviços externos. Os
                  controles de áudio são opcionais.
                </p>
                {(["music", "effects", "narration"] as const).map((key) => (
                  <label className="range-label" key={key}>
                    {
                      {
                        music: "Música ambiente",
                        effects: "Efeitos",
                        narration: "Narração",
                      }[key]
                    }
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={p.preferences[key]}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        void updatePlayer({
                          ...p,
                          preferences: { ...p.preferences, [key]: value },
                        });
                        if (key === "effects") sound(value, "reward");
                      }}
                    />
                  </label>
                ))}
                <button
                  onClick={() =>
                    voice("Cada cor deixa uma marca. A próxima pode ser sua.")
                  }
                >
                  Ouvir exemplo de narração
                </button>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={p.preferences.haptics}
                    onChange={(e) =>
                      void updatePlayer({
                        ...p,
                        preferences: {
                          ...p.preferences,
                          haptics: e.target.checked,
                        },
                      })
                    }
                  />{" "}
                  Feedback tátil em dispositivos compatíveis
                </label>
              </section>
              <section className="settings-card">
                <h2>Suas pinturas, com você.</h2>
                <p>
                  Armazenamento ativo: <strong>{mode}</strong>
                </p>
                <p>
                  O backup inclui perfil, projetos e traços editáveis. A
                  importação combina as obras e restaura o perfil do arquivo.
                </p>
                <div className="button-stack">
                  <button onClick={() => void backup()}>
                    ↓ Exportar backup completo
                  </button>
                  <label className="file-button">
                    ↑ Importar backup
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => void restore(e.target.files?.[0])}
                    />
                  </label>
                </div>
                <p>
                  {legacyCount
                    ? `${legacyCount} registros da versão anterior preservados.`
                    : "Nenhum dado V5 foi encontrado neste navegador."}
                </p>
                <a className="text-link" href="/legacy/">
                  Abrir versão V5 e exportar obras antigas ↗
                </a>
                <button className="wide" onClick={() => navigate("conquistas")}>
                  Minhas conquistas →
                </button>
              </section>
            </div>
            <section className="settings-card">
              <h2>Guardar ilustrações offline</h2>
              <p>
                O aplicativo guarda a interface localmente após a primeira
                carga. Baixe as ilustrações de cada caminho para garantir que
                estejam disponíveis sem internet.
              </p>
              <div className="download-paths">
                {paths.map((path) => (
                  <button
                    disabled={downloading || !path.stages.some((s) => s.asset)}
                    key={path.id}
                    onClick={() => void cachePath(path)}
                  >
                    {path.title}
                    <small>
                      {path.stages.filter((s) => s.asset).length}/5 ilustrações
                      · baixar ↓
                    </small>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {![
          "jornada",
          "livre",
          "colecao",
          "perfil",
          "conquistas",
          "configuracoes",
          "colorir",
        ].includes(view) && (
          <div className="empty-state">
            <h1>Seu caminho começa aqui.</h1>
            <button onClick={() => navigate("jornada")}>
              Ir para a jornada
            </button>
          </div>
        )}
        <footer>
          <span className="brand-text">colorê.</span>
          <span>Respire. Pinte. Descubra.</span>
          <small>{mode} · seus traços, neste dispositivo</small>
        </footer>
      </main>
      {selectedPath && (
        <Modal title={selectedPath.title} onClose={() => setSelectedPath(null)}>
          <p className="eyebrow">
            CAMINHO {selectedPath.index + 1} · {selectedPath.era}
          </p>
          <p className="narrative">{selectedPath.intro}</p>
          <button onClick={() => voice(selectedPath.intro)}>
            ◖ Ouvir esta história
          </button>
          <ol className="stage-list">
            {selectedPath.stages.map((stage, i) => {
              const unlocked = isStageUnlocked(p, stage.id),
                done = p.completed.includes(stage.id);
              return (
                <li key={stage.id}>
                  <button
                    disabled={!unlocked || !stage.asset}
                    onClick={() => void openStage(stage)}
                  >
                    {stage.asset && (
                      <img src={previewAsset(stage.asset)} alt="" />
                    )}
                    <div>
                      <small>
                        MARCO {i + 1} {done ? "· CONCLUÍDO" : ""}
                      </small>
                      <strong>{stage.title}</strong>
                      <p>{stage.intro}</p>
                      <span>
                        {!stage.asset
                          ? "Ilustração em produção"
                          : !unlocked
                            ? "Conclua o marco anterior"
                            : done
                              ? "Revisitar minhas cores →"
                              : "Abrir minha página →"}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="path-reward">
            <strong>Uma descoberta para guardar</strong>
            <p>{selectedPath.reward}</p>
            <small>
              +220 XP ao concluir o caminho · +120 XP por fase inédita
            </small>
          </div>
          <p className="quiet">{selectedPath.outro}</p>
        </Modal>
      )}
      {onboarding && (
        <Modal title="Sua viagem começa com você.">
          <p className="narrative">
            Crie um companheiro para descobrir histórias e deixar suas próprias
            marcas.
          </p>
          <CharacterCreator onCreate={(p) => void createProfile(p)} />
        </Modal>
      )}
      {completion && (
        <Modal
          title={
            completion.kind === "clothing"
              ? "Pronta para vestir sua arte?"
              : "Uma memória para guardar."
          }
          onClose={() => setCompletion(null)}
        >
          <p className="narrative">
            {completion.kind === "clothing"
              ? "A peça será salva e equipada no personagem. Você pode voltar e editar depois."
              : "Você decide quando a pintura está pronta. Todas as cores são bem-vindas. Seus traços continuarão editáveis na coleção."}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />{" "}
            Quero marcar esta obra como concluída.
          </label>
          <button
            className="primary wide"
            disabled={!confirm || completing}
            onClick={() => void complete()}
          >
            {completion.kind === "clothing"
              ? "Salvar e equipar"
              : "Guardar esta memória"}{" "}
            →
          </button>
        </Modal>
      )}
      {reward && (
        <Modal
          title="Sua história ganhou mais uma cor."
          onClose={() => setReward(null)}
        >
          <div className="reward-flower">✦</div>
          <p className="narrative">{reward.text}</p>
          <p className="xp-reward">
            {reward.xp ? `+${reward.xp} XP` : "Uma memória revisitada"}
          </p>
          <p>
            Agora você está no nível {getLevel(p.xp)}. Novas ferramentas e
            materiais aparecem no seu inventário conforme a viagem continua.
          </p>
          <button
            className="primary wide"
            onClick={() => {
              setReward(null);
              if (nextStage) void openStage(nextStage);
            }}
          >
            Continuar a viagem →
          </button>
          <button
            className="wide"
            onClick={() => {
              setReward(null);
              navigate("colecao");
            }}
          >
            Ver minha obra na coleção
          </button>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
function PageHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      onCancel={(e) => {
        if (onClose) onClose();
        else e.preventDefault();
      }}
    >
      {onClose && (
        <button className="close-modal" aria-label="Fechar" onClick={onClose}>
          ×
        </button>
      )}
      <h1>{title}</h1>
      {children}
    </dialog>
  );
}
function CharacterCreator({ onCreate }: { onCreate: (p: Player) => void }) {
  const [p, setP] = useState(initialPlayer());
  return (
    <>
      <div className="create-avatar">
        <Avatar player={p} />
      </div>
      <CharacterFields player={p} onChange={setP} />
      <button
        className="primary wide"
        onClick={() => onCreate({ ...p, name: p.name.trim() || "Viajante" })}
      >
        Começar minha viagem →
      </button>
    </>
  );
}
function CharacterFields({
  player: p,
  onChange,
}: {
  player: Player;
  onChange: (p: Player) => void;
}) {
  return (
    <div className="character-fields">
      <label>
        Como vamos chamar você?
        <input
          aria-label="Nome do personagem"
          maxLength={32}
          value={p.name}
          onChange={(e) => onChange({ ...p, name: e.target.value })}
        />
      </label>
      <fieldset>
        <legend>Tom de pele</legend>
        <div className="skin-tones">
          {[
            "#F1D3B8",
            "#DCB18A",
            "#B98260",
            "#936447",
            "#6C4634",
            "#442C23",
          ].map((color) => (
            <button
              key={color}
              aria-label={`Tom de pele ${color}`}
              aria-pressed={p.skin === color}
              style={{ background: color }}
              onClick={() => onChange({ ...p, skin: color })}
            />
          ))}
        </div>
      </fieldset>
      <div className="field-grid">
        {(
          [
            [
              "hair",
              "Cabelo",
              [
                ["curly", "Cacheado"],
                ["short", "Curto"],
                ["long", "Longo"],
                ["straight", "Liso"],
                ["bald", "Sem cabelo"],
              ],
            ],
            [
              "face",
              "Rosto",
              [
                ["round", "Arredondado"],
                ["oval", "Oval"],
              ],
            ],
            [
              "expression",
              "Expressão",
              [
                ["smile", "Sorriso"],
                ["calm", "Serena"],
                ["surprise", "Curiosa"],
              ],
            ],
            [
              "outfit",
              "Roupa inicial",
              [
                ["shirt", "Camiseta"],
                ["coat", "Casaco"],
                ["dress", "Túnica"],
              ],
            ],
            [
              "shoes",
              "Calçado",
              [
                ["boots", "Botas"],
                ["sandals", "Sandálias"],
              ],
            ],
            [
              "accessory",
              "Acessório",
              [
                ["none", "Nenhum"],
                ["glasses", "Óculos"],
                ["hat", "Chapéu"],
                ["bag", "Bolsa"],
              ],
            ],
          ] as const
        ).map(([key, label, options]) => (
          <label key={key}>
            {label}
            <select
              value={p[key]}
              onChange={(e) => onChange({ ...p, [key]: e.target.value })}
            >
              {options.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Cor do cabelo
          <input
            type="color"
            value={p.hairColor}
            onChange={(e) => onChange({ ...p, hairColor: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
function Inventory({ player }: { player: Player }) {
  const level = getLevel(player.xp);
  return (
    <section className="inventory">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SEU INVENTÁRIO</p>
          <h2>Um ateliê que cresce com você.</h2>
        </div>
        <span>Nível {level} / 50</span>
      </div>
      <div className="inventory-grid">
        {[
          ...tools.map((t) => ({ ...t, level: toolUnlocks[t.id] })),
          ...materials.map((m) => ({ ...m, level: materialUnlocks[m.id] })),
        ].map((item, i) => (
          <article
            key={`${item.id}-${i}`}
            className={level >= item.level ? "owned" : ""}
          >
            <small>{i < tools.length ? "FERRAMENTA" : "MATERIAL"}</small>
            <strong>{item.name}</strong>
            <p>{item.description}</p>
            <span>
              {level >= item.level ? "✓ Disponível" : `Nível ${item.level}`}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
function WorkCard({
  work,
  onOpen,
  onRename,
}: {
  work: DrawingSummary;
  onOpen: () => void;
  onRename: (s: string) => void;
}) {
  const [url, setUrl] = useState(previewAsset(work.asset)),
    [editing, setEditing] = useState(false),
    [title, setTitle] = useState(work.title);
  useEffect(() => {
    let cancelled = false,
      url: string | undefined;
    setUrl(previewAsset(work.asset));
    void thumbnailFor(work)
      .then((bytes) => {
        if (cancelled) return;
        url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        setUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [work.id, work.updatedAt, work.thumbnail, work.asset]);
  return (
    <article className="art-card">
      <button className="work-open" onClick={onOpen}>
        <img src={url} alt={`Pintura: ${work.title}`} />
        <div>
          <small>
            {work.kind === "clothing"
              ? "SEU GUARDA-ROUPA"
              : work.completed
                ? "MEMÓRIA CONCLUÍDA"
                : "EM CRIAÇÃO"}
          </small>
          <h3>{work.title}</h3>
          <span>
            {new Date(work.updatedAt).toLocaleDateString("pt-BR")} · Continuar
            pintando ↗
          </span>
        </div>
      </button>
      {editing ? (
        <form
          className="rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(title);
            setEditing(false);
          }}
        >
          <input
            aria-label="Nome da obra"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button>Salvar</button>
        </form>
      ) : (
        <button className="rename" onClick={() => setEditing(true)}>
          Renomear obra
        </button>
      )}
    </article>
  );
}
const appRoot =
  import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
appRoot.render(<App />);
if (import.meta.hot)
  import.meta.hot.dispose((data) => {
    data.root = appRoot;
  });
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
