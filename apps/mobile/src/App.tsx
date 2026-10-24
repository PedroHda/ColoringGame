import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { paths, stages } from "../../../packages/game-content";
import {
  achievements,
  completeStage,
  discover,
  getLevel,
  initialPlayer,
  isMaterialUnlocked,
  isStageUnlocked,
  isToolUnlocked,
  levelProgress,
  materialUnlocks,
  toolUnlocks,
  type Player,
} from "../../../packages/core";
import {
  createDocument,
  DEFAULT_BRUSH_SETTINGS,
  getDefaultBrushSettings,
  materials,
  tools,
  type BrushSettings,
  type DrawingDocument,
} from "../../../packages/drawing-engine/model";
import {
  illustrationAssets,
  illustrationThumbnails,
} from "./generated/illustrations";
import {
  exportBackup,
  importBackup,
  listPaintings,
  loadPainting,
  loadPlayer,
  newPainting,
  savePainting,
  savePlayer,
  type Painting,
  type PaintingSummary,
} from "./storage";
import NativePainting, {
  clothingAssets,
  type PaintingHandle,
} from "./NativePainting";
import ColorPanel, { Control } from "./ColorPanel";
import Avatar from "./Avatar";
import { useAmbience } from "./useAmbience";
import {
  wardrobe,
  clothingByAsset,
  isClothingUnlocked,
} from "../../../packages/core/wardrobe";
import { ambienceForPath } from "../../../packages/core/ambience";

type Screen =
  | "home"
  | "journey"
  | "atelier"
  | "gallery"
  | "profile"
  | "inventory"
  | "achievements"
  | "settings"
  | "editor";
type Stage = (typeof stages)[number];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const available = (stage: Stage) =>
  !!stage.asset && !!illustrationAssets[stage.asset];
const previewFile = (id: string) =>
  new File(Paths.document, `preview-${id.replace(/[^a-z0-9-]/gi, "_")}.png`);
function Button({
  title,
  onPress,
  quiet = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  quiet?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        quiet && s.quietButton,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[s.buttonText, quiet && s.quietButtonText]}>{title}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Colorê />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
function Colorê() {
  const [player, setPlayer] = useState<Player>(initialPlayer());
  const [bootError, setBootError] = useState("");
  const [ready, setReady] = useState(false),
    [screen, setScreen] = useState<Screen>("home");
  const [pathId, setPathId] = useState<string | null>(null),
    [intro, setIntro] = useState<Stage | null>(null);
  const [painting, setPainting] = useState<Painting | null>(null),
    [gallery, setGallery] = useState<PaintingSummary[]>([]);
  const playFeedback = useAmbience(
    player.preferences.music,
    player.preferences.effects,
    ambienceForPath(
      stages.find((s) => s.id === painting?.stageId)?.pathId ?? pathId,
    ),
  );
  const [previews, setPreviews] = useState<Record<string, string>>({}),
    [status, setStatus] = useState("Salvo neste aparelho");
  const equipmentAssets = useMemo(
    () => Object.fromEntries(gallery.map((item) => [item.id, item.base])),
    [gallery],
  );
  const [brush, setBrush] = useState<BrushSettings>({
    ...DEFAULT_BRUSH_SETTINGS,
  });
  const [panel, setPanel] = useState<"tools" | "colors" | "materials" | null>(
      null,
    ),
    [hideControls, setHideControls] = useState(false),
    [eyedropper, setEyedropper] = useState(false);
  const [history, setHistory] = useState([
    "#B9684E",
    "#D4A34E",
    "#728452",
    "#548E98",
    "#795D49",
    "#403830",
  ]);
  const editor = useRef<PaintingHandle>(null),
    paintingRef = useRef<Painting | null>(null);
  const saveQueue = useRef(Promise.resolve()),
    dirty = useRef(false);
  const { width, height } = useWindowDimensions(),
    landscape = width > height;
  const error = (e: unknown) => {
    setStatus("Falha ao salvar — tente novamente");
    Alert.alert(
      "Não foi possível concluir",
      e instanceof Error ? e.message : String(e),
    );
  };
  const refresh = useCallback(async () => {
    const list = await listPaintings();
    setGallery(list);
    const thumbnails: Record<string, string> = {};
    for (const item of list) {
      const file = previewFile(item.id);
      if (file.exists)
        thumbnails[item.id] =
          `${file.uri}?v=${encodeURIComponent(item.updated)}`;
    }
    setPreviews(thumbnails);
  }, []);
  useEffect(() => {
    loadPlayer()
      .then(async (saved) => {
        setPlayer(saved);
        if (
          saved.name === "Viajante" &&
          saved.xp === 0 &&
          !saved.rewards.includes("profile:created")
        )
          setScreen("profile");
        await refresh();
        setReady(true);
      })
      .catch((e) => {
        setBootError(e instanceof Error ? e.message : String(e));
      });
  }, [refresh]);
  const queueSave = useCallback((next: Painting, nextPlayer?: Player) => {
    setStatus("Salvando…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => savePainting(next, nextPlayer));
    saveQueue.current
      .then(() => {
        if (paintingRef.current?.updated === next.updated) {
          dirty.current = false;
          setStatus("Salvo neste aparelho");
        }
      })
      .catch(error);
    return saveQueue.current;
  }, []);
  const changeDrawing = (document: DrawingDocument) => {
    if (!paintingRef.current) return;
    const next = {
      ...paintingRef.current,
      document,
      updated: new Date().toISOString(),
    };
    paintingRef.current = next;
    setPainting(next);
    dirty.current = true;
    // Save each completed operation, never full raster images per pointer movement.
    void queueSave(next);
    const recent = [
      brush.color,
      ...history.filter((c) => c !== brush.color),
    ].slice(0, 10);
    setHistory(recent);
  };
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && dirty.current && paintingRef.current)
        void queueSave(paintingRef.current);
    });
    return () => sub.remove();
  }, [queueSave]);
  const updatePlayer = async (next: Player) => {
    await savePlayer(next);
    setPlayer(next);
  };
  const feedback = () => {
    playFeedback();
    if (player.preferences.haptics)
      void Haptics.selectionAsync().catch(() => {});
  };
  const makePreview = async () => {
    const current = paintingRef.current;
    if (!current || !editor.current) return;
    const bytes = await editor.current.exportPng(360);
    const file = previewFile(current.id);
    file.create({ overwrite: true });
    file.write(bytes);
    setPreviews((prior) => ({
      ...prior,
      [current.id]: `${file.uri}?v=${Date.now()}`,
    }));
  };
  const leaveEditor = async (destination: Screen = "gallery") => {
    try {
      if (paintingRef.current) {
        await queueSave(paintingRef.current);
        await makePreview();
      }
      await refresh();
      setScreen(destination);
      setPanel(null);
      setHideControls(false);
    } catch (e) {
      error(e);
    }
  };
  const openPainting = async (next: Painting) => {
    if (!illustrationAssets[next.base] && !clothingAssets[next.base]) {
      Alert.alert(
        "Esta arte ainda não está instalada",
        "A obra e seus traços foram preservados. Atualize o aplicativo com esta ilustração para continuar a pintura.",
      );
      return;
    }
    try {
      await savePainting(next);
      paintingRef.current = next;
      setPainting(next);
      setScreen("editor");
      setPanel(null);
      setEyedropper(false);
      feedback();
    } catch (e) {
      error(e);
    }
  };
  const openStage = async (stage: Stage, free: boolean) => {
    if (!available(stage) || !isStageUnlocked(player, stage.id)) return;
    const id = free ? undefined : `journey-${stage.id}`;
    const saved = id ? await loadPainting(id) : null;
    const next =
      saved ??
      newPainting(stage.title, stage.asset!, free ? null : stage.id, id);
    if (!saved) next.document = createDocument(stage.width, stage.height);
    await openPainting(next);
    setIntro(null);
  };
  const complete = async () => {
    const current = paintingRef.current;
    if (!current) return;
    if (
      !current.document.strokes.some(
        (stroke) => stroke.settings.tool !== "eraser",
      )
    ) {
      Alert.alert(
        "Sua primeira marca",
        "Faça ao menos uma pincelada antes de concluir. Você decide quando a obra está pronta.",
      );
      return;
    }
    try {
      const result = current.stageId
        ? completeStage(player, current.stageId)
        : { player, xpGranted: 0, newRewards: [] };
      const next = {
        ...current,
        completed: true,
        updated: new Date().toISOString(),
      };
      await queueSave(next, result.player);
      paintingRef.current = next;
      setPainting(next);
      setPlayer(result.player);
      await makePreview();
      await refresh();
      const stage = stages.find((item) => item.id === current.stageId);
      feedback();
      Alert.alert(
        result.xpGranted
          ? `Obra concluída · +${result.xpGranted} XP`
          : "Obra guardada na coleção",
        [
          stage?.outro ?? "Cada cor guarda uma escolha sua.",
          result.newRewards.length
            ? `${result.newRewards.length} nova(s) conquista(s) e recompensa(s).`
            : "",
          "Você pode continuar editando esta pintura na coleção.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        [
          { text: "Ver coleção", onPress: () => setScreen("gallery") },
          { text: "Continuar pintando" },
        ],
      );
    } catch (e) {
      error(e);
    }
  };
  const sharePng = async () => {
    try {
      if (!editor.current) return;
      const bytes = await editor.current.exportPng();
      const file = new File(Paths.cache, `colore-${uid()}.png`);
      file.create();
      file.write(bytes);
      await queueSave(paintingRef.current!);
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(file.uri, {
          mimeType: "image/png",
          dialogTitle: "Compartilhar sua pintura Colorê",
        });
      else Alert.alert("PNG exportado", file.uri);
    } catch (e) {
      error(e);
    }
  };
  const backup = async (share = true) => {
    const file = new File(Paths.document, `backup-colore-${Date.now()}.json`);
    file.create();
    file.write(await exportBackup());
    if (share && (await Sharing.isAvailableAsync()))
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    return file.uri;
  };
  const restore = async () => {
    try {
      const selected = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (selected.canceled) return;
      const text = await new File(selected.assets[0].uri).text();
      Alert.alert(
        "Restaurar backup?",
        "O estado atual será copiado para um backup local antes de restaurar. A restauração substitui o perfil e as obras deste aparelho.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Restaurar",
            onPress: () => {
              void (async () => {
                const previous = await backup(false);
                await importBackup(text);
                setPlayer(await loadPlayer());
                await refresh();
                Alert.alert(
                  "Backup restaurado",
                  `Cópia anterior preservada em ${previous}`,
                );
              })().catch(error);
            },
          },
        ],
      );
    } catch (e) {
      error(e);
    }
  };
  const chooseTool = (id: BrushSettings["tool"]) => {
    if (!isToolUnlocked(player, id)) return;
    setBrush((prior) => ({
      ...prior,
      ...getDefaultBrushSettings(id),
      material: prior.material,
      color: prior.color,
      alpha: prior.alpha,
    }));
    setEyedropper(false);
    void updatePlayer(discover(player, "tool", id)).catch(error);
    feedback();
  };
  const chooseMaterial = (id: BrushSettings["material"]) => {
    if (!isMaterialUnlocked(player, id)) return;
    setBrush((prior) => ({ ...prior, material: id }));
    void updatePlayer(discover(player, "material", id)).catch(error);
    feedback();
  };
  const currentPath = paths.find((path) => path.id === pathId);
  const navigation = (next: Screen) => {
    if (screen === "editor") void leaveEditor(next);
    else {
      setScreen(next);
      setPathId(null);
    }
  };
  const narrate = async (text: string) => {
    try {
      if (await Speech.isSpeakingAsync()) await Speech.stop();
      else
        Speech.speak(text, {
          language: "pt-BR",
          rate: 0.9,
          volume: player.preferences.narration,
          onError: () =>
            Alert.alert(
              "Narração indisponível",
              "A voz em português precisa estar instalada no dispositivo. O texto permanece disponível para leitura.",
            ),
        });
    } catch (e) {
      error(e);
    }
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (screen === "editor") {
          void leaveEditor();
          return true;
        }
        if (pathId) {
          setPathId(null);
          return true;
        }
        if (screen !== "home") {
          setScreen("home");
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [screen, pathId, painting]);

  if (!ready)
    return (
      <SafeAreaView style={s.loading}>
        <Text style={s.logo}>Colorê</Text>
        <Text style={s.muted}>
          {bootError || "Abrindo seu ateliê neste aparelho…"}
        </Text>
        {!!bootError && (
          <Button
            title="Tentar abrir novamente"
            onPress={() => {
              setBootError("");
              void loadPlayer()
                .then(async (saved) => {
                  setPlayer(saved);
                  await refresh();
                  setReady(true);
                })
                .catch((e) =>
                  setBootError(e instanceof Error ? e.message : String(e)),
                );
            }}
          />
        )}
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      {!(screen === "editor" && landscape) && (
        <View style={s.header}>
          <Pressable
            onPress={() => navigation("home")}
            accessibilityRole="button"
          >
            <Text style={s.logo}>Colorê</Text>
          </Pressable>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.eyebrow}>
              {player.name} · nível {getLevel(player.xp)}
            </Text>
            <Text style={s.small}>
              {player.xp} XP · {player.completed.length}/75 memórias
            </Text>
          </View>
        </View>
      )}
      {screen === "editor" && painting ? (
        <View style={s.editor}>
          {!hideControls && (
            <View style={s.editorHeading}>
              <TextInput
                accessibilityLabel="Nome da pintura"
                maxLength={160}
                value={painting.title}
                style={[s.title, { flex: 1, fontSize: 19 }]}
                onChangeText={(title) => {
                  const next = {
                    ...painting,
                    title,
                    updated: new Date().toISOString(),
                  };
                  paintingRef.current = next;
                  setPainting(next);
                  dirty.current = true;
                }}
                onEndEditing={() =>
                  paintingRef.current && void queueSave(paintingRef.current)
                }
              />
              <Button title="Sair" quiet onPress={() => void leaveEditor()} />
            </View>
          )}
          <View style={[s.workbench, landscape && { flexDirection: "row" }]}>
            <NativePainting
              key={painting.id}
              ref={editor}
              base={painting.base}
              document={painting.document}
              brush={brush}
              onChange={changeDrawing}
              eyedropper={eyedropper}
              onSample={(color) => {
                setBrush((p) => ({ ...p, color }));
                setEyedropper(false);
                setPanel("colors");
              }}
            />
            {!hideControls && landscape && (
              <ScrollView
                style={s.sideRail}
                contentContainerStyle={{ gap: 10 }}
              >
                <Button
                  title="Pincéis"
                  quiet
                  onPress={() => setPanel("tools")}
                />
                <Button
                  title="Cores"
                  quiet
                  onPress={() => setPanel("colors")}
                />
                <Button
                  title="Materiais"
                  quiet
                  onPress={() => setPanel("materials")}
                />
                <Button title="Concluir" onPress={() => void complete()} />
                <Button
                  title="Exportar PNG"
                  quiet
                  onPress={() => void sharePng()}
                />
              </ScrollView>
            )}
          </View>
          <View style={s.editorToolbar}>
            <Button
              title={hideControls ? "Mostrar controles" : "Ocultar"}
              quiet
              onPress={() => setHideControls(!hideControls)}
            />
            {!hideControls && (
              <>
                <Button
                  title="↶"
                  quiet
                  disabled={!painting.document.strokes.length}
                  onPress={() => {
                    const strokes = [...painting.document.strokes];
                    const last = strokes.pop()!;
                    changeDrawing({
                      ...painting.document,
                      strokes,
                      redo: [...painting.document.redo, last],
                    });
                  }}
                />
                <Button
                  title="↷"
                  quiet
                  disabled={!painting.document.redo.length}
                  onPress={() => {
                    const redo = [...painting.document.redo];
                    const last = redo.pop()!;
                    changeDrawing({
                      ...painting.document,
                      strokes: [...painting.document.strokes, last],
                      redo,
                    });
                  }}
                />
                <Button
                  title="Ajustar"
                  quiet
                  onPress={() => editor.current?.resetView()}
                />
              </>
            )}
          </View>
          {!hideControls && !landscape && (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                contentContainerStyle={s.editorToolbar}
              >
                <Button
                  title={
                    tools.find((t) => t.id === brush.tool)?.name ?? "Pincel"
                  }
                  quiet
                  onPress={() => setPanel("tools")}
                />
                <Pressable
                  style={[s.colorButton, { backgroundColor: brush.color }]}
                  accessibilityLabel="Escolher cor"
                  onPress={() => setPanel("colors")}
                />
                <Button
                  title="Materiais"
                  quiet
                  onPress={() => setPanel("materials")}
                />
                <Button
                  title={eyedropper ? "Toque uma cor" : "Conta-gotas"}
                  quiet
                  onPress={() => setEyedropper(!eyedropper)}
                />
                <Button
                  title="Borracha"
                  quiet
                  onPress={() => chooseTool("eraser")}
                />
                <Button
                  title="Exportar PNG"
                  quiet
                  onPress={() => void sharePng()}
                />
                <Button title="Concluir" onPress={() => void complete()} />
              </ScrollView>
              <View style={s.quickSettings}>
                <View style={{ flex: 1 }}>
                  <Control
                    label="Tamanho"
                    min={1}
                    max={256}
                    value={brush.size}
                    onChange={(size) => setBrush((p) => ({ ...p, size }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Control
                    label="Opacidade"
                    value={brush.opacity}
                    onChange={(opacity) => setBrush((p) => ({ ...p, opacity }))}
                  />
                </View>
              </View>
              <Text style={s.status}>
                {status} · 1 dedo pinta · 2 dedos movem e ampliam
              </Text>
            </>
          )}
        </View>
      ) : (
        <ScrollView style={s.main} contentContainerStyle={s.content}>
          {screen === "home" && (
            <>
              <Text style={s.eyebrow}>UMA AVENTURA ARTÍSTICA OFFLINE</Text>
              <Text style={s.hero}>O caminho das cores começa com você.</Text>
              <Text style={s.body}>
                Viaje por histórias, escolha seus pigmentos e pinte livremente
                sob os contornos. Cada pincelada fica guardada neste aparelho.
              </Text>
              <View style={s.homeArt}>
                <Avatar
                  player={player}
                  previews={previews}
                  equipmentAssets={equipmentAssets}
                  size={180}
                />
                {stages.find(available)?.asset && (
                  <Image
                    source={
                      illustrationThumbnails[stages.find(available)!.asset!]
                    }
                    style={s.homeImage}
                    resizeMode="cover"
                  />
                )}
              </View>
              <Button
                title="Continuar minha jornada"
                onPress={() => navigation("journey")}
              />
              <View style={s.row}>
                <Button
                  title="Ateliê livre"
                  quiet
                  onPress={() => navigation("atelier")}
                />
                <Button
                  title="Meu personagem"
                  quiet
                  onPress={() => navigation("profile")}
                />
              </View>
              <Text style={s.muted}>
                {stages.filter(available).length} ilustrações instaladas · 15
                caminhos narrativos · 75 fases no catálogo
              </Text>
            </>
          )}
          {screen === "journey" && (
            <>
              <Text style={s.eyebrow}>O MAPA DAS MEMÓRIAS</Text>
              <Text style={s.hero}>
                {currentPath?.title ?? "Nossa jornada pela história"}
              </Text>
              {currentPath ? (
                <>
                  <Button
                    title="← Todos os caminhos"
                    quiet
                    onPress={() => setPathId(null)}
                  />
                  <Text style={s.body}>{currentPath.intro}</Text>
                  <Button
                    title="Ouvir esta história"
                    quiet
                    onPress={() => void narrate(currentPath.intro)}
                  />
                  {currentPath.stages.map((stage, index) => {
                    const unlocked = isStageUnlocked(player, stage.id),
                      installed = available(stage);
                    return (
                      <View key={stage.id} style={s.card}>
                        {installed && (
                          <Image
                            source={illustrationThumbnails[stage.asset!]}
                            style={s.cardImage}
                            resizeMode="cover"
                          />
                        )}
                        <Text style={s.eyebrow}>
                          MEMÓRIA {index + 1} ·{" "}
                          {player.completed.includes(stage.id)
                            ? "CONCLUÍDA"
                            : !installed
                              ? "ARTE EM PRODUÇÃO"
                              : unlocked
                                ? "DISPONÍVEL"
                                : "BLOQUEADA"}
                        </Text>
                        <Text style={s.title}>{stage.title}</Text>
                        <Text style={s.body}>{stage.intro}</Text>
                        <Button
                          title={
                            player.completed.includes(stage.id)
                              ? "Revisitar pintura"
                              : "Entrar nesta história"
                          }
                          disabled={!unlocked || !installed}
                          onPress={() => setIntro(stage)}
                        />
                      </View>
                    );
                  })}
                  {currentPath.stages.every((stage) =>
                    player.completed.includes(stage.id),
                  ) && (
                    <View style={s.card}>
                      <Text style={s.title}>Caminho concluído</Text>
                      <Text style={s.body}>{currentPath.outro}</Text>
                      <Text style={s.body}>{currentPath.reward}</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Avatar
                    player={player}
                    previews={previews}
                    equipmentAssets={equipmentAssets}
                    size={100}
                  />
                  {paths.map((path, index) => {
                    const first = path.stages[0],
                      art = path.stages.find(available)?.asset,
                      active =
                        stages.find(
                          (stage) => !player.completed.includes(stage.id),
                        )?.pathId === path.id,
                      unlocked = isStageUnlocked(player, first.id),
                      completed = path.stages.filter((stage) =>
                        player.completed.includes(stage.id),
                      ).length;
                    return (
                      <View
                        key={path.id}
                        style={[
                          s.mapStop,
                          active && {
                            borderLeftColor: "#648270",
                            borderLeftWidth: 5,
                          },
                          {
                            marginLeft: index % 2 ? 32 : 0,
                            marginRight: index % 2 ? 0 : 32,
                          },
                        ]}
                      >
                        <View
                          style={{ width: 76, alignItems: "center", gap: 8 }}
                        >
                          {art && (
                            <Image
                              source={illustrationThumbnails[art]}
                              style={{
                                width: 76,
                                height: 58,
                                borderRadius: 12,
                                opacity: unlocked ? 1 : 0.5,
                              }}
                              resizeMode="cover"
                              accessibilityLabel={`Paisagem do caminho ${index + 1}`}
                            />
                          )}
                          <Text style={s.mapNumber}>
                            {completed === 5
                              ? "✓"
                              : String(index + 1).padStart(2, "0")}
                          </Text>
                          {active && (
                            <Avatar
                              player={player}
                              previews={previews}
                              equipmentAssets={equipmentAssets}
                              size={62}
                            />
                          )}
                        </View>
                        <View style={{ flex: 1, gap: 7 }}>
                          <Text style={s.title}>{path.title}</Text>
                          <Text style={s.small}>
                            {completed}/5 memórias ·{" "}
                            {path.stages.filter(available).length} artes
                            instaladas
                          </Text>
                          <Text style={s.small}>
                            {completed === 5
                              ? "Caminho concluído"
                              : active
                                ? "Seu próximo encontro"
                                : unlocked
                                  ? "Disponível para revisitar"
                                  : "Conclua o caminho anterior para jogar"}
                          </Text>
                          <Button
                            title={
                              isStageUnlocked(player, first.id)
                                ? "Explorar caminho"
                                : "Conhecer este caminho"
                            }
                            quiet
                            onPress={() => setPathId(path.id)}
                          />
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}
          {screen === "atelier" && (
            <>
              <Text style={s.eyebrow}>TEMPO PARA EXPERIMENTAR</Text>
              <Text style={s.hero}>Seu ateliê livre</Text>
              <Text style={s.body}>
                Crie novas versões das ilustrações descobertas. Pinte sem
                objetivo ou tempo limite. Três peças iniciais esperam suas
                cores; outras são descobertas ao longo da jornada.
              </Text>
              {stages
                .filter(
                  (stage) =>
                    available(stage) && isStageUnlocked(player, stage.id),
                )
                .map((stage) => (
                  <View style={s.card} key={stage.id}>
                    <Image
                      source={illustrationThumbnails[stage.asset!]}
                      style={s.cardImage}
                      resizeMode="cover"
                    />
                    <Text style={s.title}>{stage.title}</Text>
                    <Button
                      title="Criar nova versão"
                      onPress={() => void openStage(stage, true)}
                    />
                  </View>
                ))}
              <Text style={s.title}>Um guarda-roupa com a sua assinatura</Text>
              {wardrobe.map((item) => (
                <View key={item.id} style={s.card}>
                  <Text style={s.title}>{item.title}</Text>
                  <Text style={s.body}>
                    {isClothingUnlocked(player, item)
                      ? "Pinte com os mesmos pincéis e equipe a peça no seu personagem."
                      : `Conclua o caminho ${Number(item.unlockPath!.slice(-2))} para desbloquear esta peça.`}
                  </Text>
                  <Button
                    title="Pintar esta peça"
                    quiet
                    disabled={!isClothingUnlocked(player, item)}
                    onPress={() => {
                      const next = newPainting(item.title, item.asset);
                      next.document = createDocument(512, 512);
                      void openPainting(next);
                    }}
                  />
                </View>
              ))}
            </>
          )}
          {screen === "gallery" && (
            <>
              <Text style={s.eyebrow}>SEU CADERNO DE VIAGENS</Text>
              <Text style={s.hero}>Coleção de pinturas</Text>
              {!gallery.length && (
                <Text style={s.body}>
                  Sua primeira obra aparecerá aqui assim que você começar a
                  pintar.
                </Text>
              )}
              {gallery.map((item) => (
                <View key={item.id} style={s.card}>
                  {previews[item.id] && (
                    <Image
                      source={{ uri: previews[item.id] }}
                      style={s.cardImage}
                      resizeMode="contain"
                    />
                  )}
                  <Text style={s.title}>{item.title}</Text>
                  <Text style={s.small}>
                    {item.completed ? "Concluída" : "Em criação"} · alterada em{" "}
                    {new Date(item.updated).toLocaleDateString("pt-BR")}
                  </Text>
                  <Button
                    title="Continuar editando"
                    onPress={() => {
                      void loadPainting(item.id)
                        .then((saved) => {
                          if (saved) void openPainting(saved);
                        })
                        .catch(error);
                    }}
                  />
                  {item.base.startsWith("/clothing/") && (
                    <Button
                      title="Equipar no personagem"
                      quiet
                      onPress={() => {
                        const slot =
                          clothingByAsset(item.base)?.slot ?? "shirt";
                        void updatePlayer({
                          ...player,
                          accessory: slot === "shirt" ? player.accessory : slot,
                          equipped: { ...player.equipped, [slot]: item.id },
                        })
                          .then(() => {
                            feedback();
                            Alert.alert(
                              "Peça equipada",
                              "Sua pintura agora faz parte do personagem. Abra o perfil para ver.",
                            );
                          })
                          .catch(error);
                      }}
                    />
                  )}
                </View>
              ))}
            </>
          )}
          {screen === "profile" && (
            <>
              <Text style={s.eyebrow}>QUEM VIAJA COM AS CORES</Text>
              <Text style={s.hero}>Seu personagem</Text>
              <View style={s.avatarCard}>
                <Avatar
                  player={player}
                  previews={previews}
                  equipmentAssets={equipmentAssets}
                  size={220}
                />
              </View>
              <Text style={s.label}>Nome do viajante</Text>
              <TextInput
                accessibilityLabel="Nome do personagem"
                value={player.name}
                maxLength={48}
                style={s.input}
                onChangeText={(name) => setPlayer((p) => ({ ...p, name }))}
                onEndEditing={() => void savePlayer(player).catch(error)}
              />
              <Text style={s.body}>
                Nível {getLevel(player.xp)} · {player.xp} XP
              </Text>
              <View style={s.progress}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${levelProgress(player.xp).ratio * 100}%` },
                  ]}
                />
              </View>
              <Text style={s.label}>Tom de pele</Text>
              <View style={s.row}>
                {[
                  "#F0C9A1",
                  "#D8A37B",
                  "#B98260",
                  "#956342",
                  "#68432F",
                  "#432D25",
                ].map((skin) => (
                  <Pressable
                    key={skin}
                    accessibilityLabel={`Pele ${skin}`}
                    style={[s.colorButton, { backgroundColor: skin }]}
                    onPress={() =>
                      void updatePlayer({ ...player, skin }).catch(error)
                    }
                  />
                ))}
              </View>
              {(
                [
                  {
                    label: "Cabelo",
                    key: "hair",
                    options: [
                      ["curly", "Ondulado"],
                      ["straight", "Liso"],
                      ["short", "Curto"],
                      ["long", "Comprido"],
                      ["bald", "Sem cabelo"],
                    ],
                  },
                  {
                    label: "Formato do rosto",
                    key: "face",
                    options: [
                      ["round", "Redondo"],
                      ["oval", "Oval"],
                    ],
                  },
                  {
                    label: "Expressão",
                    key: "expression",
                    options: [
                      ["smile", "Sorriso"],
                      ["serene", "Serenidade"],
                      ["surprise", "Surpresa"],
                    ],
                  },
                  {
                    label: "Roupa base",
                    key: "outfit",
                    options: [
                      ["shirt", "Camiseta"],
                      ["coat", "Casaco"],
                      ["dress", "Túnica"],
                    ],
                  },
                  {
                    label: "Calçados",
                    key: "shoes",
                    options: [
                      ["boots", "Botas"],
                      ["sandals", "Sandálias"],
                    ],
                  },
                  {
                    label: "Acessório",
                    key: "accessory",
                    options: [
                      ["none", "Nenhum"],
                      ["glasses", "Óculos"],
                      ["hat", "Chapéu"],
                      ["bag", "Bolsa"],
                    ],
                  },
                ] as const
              ).map((group) => (
                <View key={group.key} style={{ gap: 8 }}>
                  <Text style={s.label}>{group.label}</Text>
                  <View style={s.row}>
                    {group.options.map(([value, label]) => (
                      <Button
                        key={value}
                        title={`${player[group.key] === value ? "✓ " : ""}${label}`}
                        quiet
                        onPress={() =>
                          void updatePlayer({
                            ...player,
                            [group.key]: value,
                          }).catch(error)
                        }
                      />
                    ))}
                  </View>
                </View>
              ))}
              <Text style={s.label}>Cor do cabelo</Text>
              <View style={s.row}>
                {["#3D3028", "#68432F", "#AB773E", "#D6B96E", "#717172"].map(
                  (hairColor) => (
                    <Pressable
                      key={hairColor}
                      accessibilityLabel={`Cabelo ${hairColor}`}
                      style={[s.colorButton, { backgroundColor: hairColor }]}
                      onPress={() =>
                        void updatePlayer({ ...player, hairColor }).catch(error)
                      }
                    />
                  ),
                )}
              </View>
              <Button
                title="Salvar personagem e viajar"
                onPress={() => {
                  void updatePlayer({
                    ...player,
                    rewards: [
                      ...new Set([...player.rewards, "profile:created"]),
                    ],
                  })
                    .then(() => navigation("journey"))
                    .catch(error);
                }}
              />
              <Button
                title="Pintar minhas roupas"
                onPress={() => navigation("atelier")}
              />
              {(["shirt", "hat", "bag"] as const)
                .filter((slot) => player.equipped[slot])
                .map((slot) => (
                  <Button
                    key={slot}
                    title={
                      slot === "shirt"
                        ? "Guardar roupa pintada"
                        : slot === "hat"
                          ? "Guardar chapéu pintado"
                          : "Guardar bolsa pintada"
                    }
                    quiet
                    onPress={() => {
                      const equipped = { ...player.equipped };
                      delete equipped[slot];
                      void updatePlayer({
                        ...player,
                        equipped,
                        accessory:
                          player.accessory === slot ? "none" : player.accessory,
                      }).catch(error);
                    }}
                  />
                ))}
              <Button
                title="Inventário e ferramentas"
                quiet
                onPress={() => navigation("inventory")}
              />
            </>
          )}
          {screen === "inventory" && (
            <>
              <Text style={s.hero}>Inventário do viajante</Text>
              <Text style={s.body}>
                Os pincéis básicos e a borracha estão sempre à mão. Novas
                ferramentas aparecem conforme as memórias e os níveis
                conquistados.
              </Text>
              {tools.map((tool) => (
                <View key={tool.id} style={s.card}>
                  <Text style={s.title}>
                    {isToolUnlocked(player, tool.id)
                      ? "✓ "
                      : "Nível " + toolUnlocks[tool.id] + " · "}
                    {tool.name}
                  </Text>
                  <Text style={s.body}>{tool.description}</Text>
                </View>
              ))}
              {materials.map((material) => (
                <View key={material.id} style={s.card}>
                  <Text style={s.title}>
                    {isMaterialUnlocked(player, material.id)
                      ? "✓ "
                      : "Nível " + materialUnlocks[material.id] + " · "}
                    {material.name}
                  </Text>
                  <Text style={s.body}>{material.description}</Text>
                </View>
              ))}
              <Text style={s.title}>Peças do guarda-roupa</Text>
              {wardrobe.map((item) => (
                <View key={item.id} style={s.card}>
                  <Text style={s.title}>{item.title}</Text>
                  <Text style={s.body}>
                    {isClothingUnlocked(player, item)
                      ? "Disponível no ateliê para pintar e equipar."
                      : `Recompensa do caminho ${Number(item.unlockPath!.slice(-2))}.`}
                  </Text>
                </View>
              ))}
            </>
          )}
          {screen === "achievements" && (
            <>
              <Text style={s.hero}>Conquistas</Text>
              {achievements.map((achievement) => (
                <View key={achievement.id} style={s.card}>
                  <Text style={s.title}>
                    {achievement.test(player) ? "✓ " : ""}
                    {achievement.title}
                  </Text>
                  <Text style={s.body}>{achievement.description}</Text>
                  <Text style={s.small}>
                    {achievement.test(player)
                      ? "Conquistada"
                      : "Ainda há histórias para descobrir"}
                  </Text>
                </View>
              ))}
            </>
          )}
          {screen === "settings" && (
            <>
              <Text style={s.hero}>Seu jeito de criar</Text>
              <Control
                label="Música ambiente"
                value={player.preferences.music}
                onChange={(music) => {
                  const next = {
                    ...player,
                    preferences: { ...player.preferences, music },
                  };
                  setPlayer(next);
                  void savePlayer(next).catch(error);
                }}
              />
              <Control
                label="Efeitos de interface"
                value={player.preferences.effects}
                onChange={(effects) => {
                  const next = {
                    ...player,
                    preferences: { ...player.preferences, effects },
                  };
                  setPlayer(next);
                  void savePlayer(next).catch(error);
                }}
              />
              <View style={s.row}>
                <Text style={s.body}>Feedback tátil</Text>
                <Switch
                  value={player.preferences.haptics}
                  onValueChange={(haptics) =>
                    void updatePlayer({
                      ...player,
                      preferences: { ...player.preferences, haptics },
                    }).catch(error)
                  }
                />
              </View>
              <Control
                label="Volume da narração"
                value={player.preferences.narration}
                onChange={(narration) => {
                  const next = {
                    ...player,
                    preferences: { ...player.preferences, narration },
                  };
                  setPlayer(next);
                  void savePlayer(next).catch(error);
                }}
              />
              <Text style={s.body}>
                A narração utiliza a voz do aparelho. A voz em português deve
                estar instalada para ouvir sem internet. A ambiência musical e
                os efeitos são sínteses originais armazenadas no aplicativo; a
                música pausa quando ele vai para segundo plano.
              </Text>
              <Button
                title="Exportar backup editável"
                onPress={() => void backup().catch(error)}
              />
              <Button
                title="Importar backup"
                quiet
                onPress={() => void restore()}
              />
              <Text style={s.small}>
                O arquivo inclui perfil, inventário e traços editáveis. As
                ilustrações acompanham o aplicativo. Contornos e pinturas não
                dependem de serviços de IA.
              </Text>
              <Text style={s.title}>Sobre esta versão</Text>
              <Text style={s.body}>
                Colorê 6.0 · React Native, Skia e SQLite.{" "}
                {stages.filter(available).length} artes instaladas de um
                catálogo narrativo de 75 fases. Não é necessária conta para
                jogar. As fases sem ilustração estão identificadas e não
                aparecem como prontas.
              </Text>
            </>
          )}
        </ScrollView>
      )}
      {screen !== "editor" && (
        <View style={s.nav}>
          {(
            [
              ["journey", "Jornada"],
              ["atelier", "Ateliê"],
              ["gallery", "Coleção"],
              ["profile", "Perfil"],
              ["achievements", "Conquistas"],
              ["settings", "Ajustes"],
            ] as const
          ).map(([target, label]) => (
            <Pressable
              key={target}
              accessibilityRole="button"
              accessibilityState={{ selected: screen === target }}
              onPress={() => navigation(target)}
              style={[
                s.navItem,
                screen === target && { backgroundColor: "#E8D9BB" },
              ]}
            >
              <Text style={s.navText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Modal
        visible={!!intro}
        animationType="slide"
        transparent
        onRequestClose={() => setIntro(null)}
      >
        <View style={s.modalScrim}>
          <View style={s.modal}>
            <ScrollView>
              <Text style={s.eyebrow}>UMA NOVA MEMÓRIA</Text>
              <Text style={s.hero}>{intro?.title}</Text>
              <Text style={s.body}>{intro?.intro}</Text>
              <Text style={s.muted}>
                Pinte como desejar. Você escolhe quando esta memória está
                pronta.
              </Text>
              <Button
                title="Ouvir narração"
                quiet
                onPress={() => intro && void narrate(intro.intro)}
              />
              <Button
                title="Abrir minha pintura"
                onPress={() =>
                  intro && void openStage(intro, false).catch(error)
                }
              />
              <Button title="Voltar" quiet onPress={() => setIntro(null)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!panel && screen === "editor"}
        animationType="slide"
        transparent
        onRequestClose={() => setPanel(null)}
      >
        <View style={s.modalScrim}>
          <View style={[s.modal, { maxHeight: "88%" }]}>
            <View style={s.row}>
              <Text style={[s.title, { flex: 1 }]}>
                {panel === "colors"
                  ? "Sua paleta"
                  : panel === "tools"
                    ? "Escolha o pincel"
                    : "Pigmentos e materiais"}
              </Text>
              <Button title="Pronto" quiet onPress={() => setPanel(null)} />
            </View>
            <ScrollView>
              {panel === "colors" ? (
                <ColorPanel
                  color={brush.color}
                  onChange={(color) => setBrush((p) => ({ ...p, color }))}
                  history={history}
                  favorites={player.favorites}
                  onFavorite={() =>
                    void updatePlayer({
                      ...player,
                      favorites: [
                        ...player.favorites,
                        [
                          brush.color,
                          ...history.filter((c) => c !== brush.color),
                        ].slice(0, 8),
                      ].slice(-30),
                    }).catch(error)
                  }
                />
              ) : panel === "tools" ? (
                tools.map((tool) => (
                  <View key={tool.id} style={s.choice}>
                    <Button
                      title={`${brush.tool === tool.id ? "✓ " : ""}${tool.name}${!isToolUnlocked(player, tool.id) ? ` · nível ${toolUnlocks[tool.id]}` : ""}`}
                      quiet
                      disabled={!isToolUnlocked(player, tool.id)}
                      onPress={() => chooseTool(tool.id)}
                    />
                    <Text style={s.small}>{tool.description}</Text>
                  </View>
                ))
              ) : (
                materials.map((material) => (
                  <View key={material.id} style={s.choice}>
                    <Button
                      title={`${brush.material === material.id ? "✓ " : ""}${material.name}${!isMaterialUnlocked(player, material.id) ? ` · nível ${materialUnlocks[material.id]}` : ""}`}
                      quiet
                      disabled={!isMaterialUnlocked(player, material.id)}
                      onPress={() => chooseMaterial(material.id)}
                    />
                    <Text style={s.small}>{material.description}</Text>
                  </View>
                ))
              )}
              {panel !== "colors" && (
                <>
                  <Control
                    label="Tamanho"
                    min={1}
                    max={256}
                    value={brush.size}
                    onChange={(size) => setBrush((p) => ({ ...p, size }))}
                  />
                  <Control
                    label="Opacidade"
                    value={brush.opacity}
                    onChange={(opacity) => setBrush((p) => ({ ...p, opacity }))}
                  />
                </>
              )}
              {panel === "colors" && (
                <Button
                  title="Escolher cor da pintura com conta-gotas"
                  quiet
                  onPress={() => {
                    setEyedropper(true);
                    setPanel(null);
                  }}
                />
              )}
              {panel !== "colors" &&
                (
                  ["intensity", "softness", "texture", "mix", "alpha"] as const
                ).map((key, index) => (
                  <Control
                    key={key}
                    label={
                      [
                        "Intensidade",
                        "Suavidade",
                        "Textura",
                        "Mistura por multiplicação",
                        "Alfa",
                      ][index]
                    }
                    value={brush[key]}
                    onChange={(value) =>
                      setBrush((p) => ({ ...p, [key]: value }))
                    }
                  />
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7EEDC" },
  loading: {
    flex: 1,
    backgroundColor: "#F7EEDC",
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5D7BB",
  },
  logo: {
    color: "#856344",
    fontSize: 31,
    fontWeight: "800",
    letterSpacing: -1.2,
  },
  eyebrow: {
    color: "#827453",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  small: { fontSize: 12, color: "#7A6C54", lineHeight: 18 },
  muted: { fontSize: 14, color: "#897C65", lineHeight: 22 },
  main: { flex: 1 },
  content: {
    padding: 20,
    gap: 17,
    paddingBottom: 32,
    alignSelf: "center",
    width: "100%",
    maxWidth: 850,
  },
  hero: { color: "#493B2C", fontSize: 32, fontWeight: "700", lineHeight: 39 },
  title: { color: "#493B2C", fontSize: 22, fontWeight: "700" },
  body: { color: "#665744", fontSize: 16, lineHeight: 25 },
  label: { color: "#665744", fontSize: 14, fontWeight: "700" },
  button: {
    borderRadius: 12,
    backgroundColor: "#6D7C51",
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#FFFDF6", fontWeight: "700", fontSize: 14 },
  quietButton: {
    backgroundColor: "#EDE1C9",
    borderWidth: 1,
    borderColor: "#D8C9AA",
  },
  quietButtonText: { color: "#66543B" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  homeArt: { alignItems: "center", gap: 12 },
  homeImage: {
    width: "100%",
    height: 200,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8C9AA",
  },
  card: {
    backgroundColor: "#FFF9ED",
    borderRadius: 18,
    padding: 18,
    gap: 13,
    borderWidth: 1,
    borderColor: "#E3D4B5",
  },
  cardImage: {
    width: "100%",
    height: 170,
    borderRadius: 10,
    backgroundColor: "white",
  },
  mapStop: {
    borderLeftWidth: 3,
    borderLeftColor: "#AC9270",
    paddingVertical: 18,
    paddingLeft: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    backgroundColor: "#FFF9ED",
  },
  mapNumber: { color: "#9F6E4A", fontSize: 24, fontWeight: "800" },
  nav: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderColor: "#E0D1B4",
    padding: 5,
    justifyContent: "space-evenly",
    gap: 3,
  },
  navItem: {
    padding: 10,
    minHeight: 42,
    alignItems: "center",
    borderRadius: 12,
  },
  navText: { color: "#66543B", fontSize: 12, fontWeight: "700" },
  editor: { flex: 1, padding: 10, gap: 8 },
  editorHeading: { flexDirection: "row", gap: 12, alignItems: "center" },
  workbench: { flex: 1, gap: 9 },
  sideRail: { width: 115, flexGrow: 0 },
  editorToolbar: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    flexWrap: "wrap",
  },
  quickSettings: { flexDirection: "row", gap: 15 },
  status: { color: "#8B7C61", fontSize: 10, textAlign: "center" },
  colorButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderColor: "#AF9E80",
    borderWidth: 2,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "#281D1755",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#FFF9ED",
    maxHeight: "85%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 21,
    gap: 15,
  },
  choice: { gap: 7, marginVertical: 8 },
  avatarCard: {
    alignItems: "center",
    backgroundColor: "#EFE1C6",
    borderRadius: 24,
    padding: 18,
  },
  input: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#CAB897",
    borderRadius: 12,
    color: "#493B2C",
    backgroundColor: "#FFF9ED",
  },
  progress: {
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E2D3B7",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#7B8B60" },
});
