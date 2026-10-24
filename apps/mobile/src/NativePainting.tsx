import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  Canvas,
  Group,
  Picture,
  Rect,
  Image as SkiaImage,
  ImageSVG,
  Skia,
  BlendMode,
  ColorType,
  AlphaType,
  ImageFormat,
  useImage,
  useSVG,
  type SkPicture,
  type SkImage,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import {
  type BrushSettings,
  type DrawingDocument,
  type Point,
  type Stroke,
} from "../../../packages/drawing-engine/model";
import { illustrationAssets } from "./generated/illustrations";
import { recordStroke, drawStroke } from "./native-renderer";

export const clothingAssets: Record<string, number> = {
  "/clothing/shirt.svg": require("../../../assets/clothing/shirt.svg"),
  "/clothing/hat.svg": require("../../../assets/clothing/hat.svg"),
  "/clothing/bag.svg": require("../../../assets/clothing/bag.svg"),
  "/clothing/fiber-hat.svg": require("../../../assets/clothing/fiber-hat.svg"),
  "/clothing/cape.svg": require("../../../assets/clothing/cape.svg"),
  "/clothing/explorer-hat.svg": require("../../../assets/clothing/explorer-hat.svg"),
  "/clothing/apron.svg": require("../../../assets/clothing/apron.svg"),
  "/clothing/workshop-bag.svg": require("../../../assets/clothing/workshop-bag.svg"),
  "/clothing/future-jacket.svg": require("../../../assets/clothing/future-jacket.svg"),
};
export interface PaintingHandle {
  exportPng: (maxWidth?: number) => Promise<Uint8Array>;
  resetView: () => void;
}
interface Props {
  base: string;
  document: DrawingDocument;
  brush: BrushSettings;
  onChange: (document: DrawingDocument) => void;
  eyedropper: boolean;
  onSample: (color: string) => void;
}

/** A native Skia canvas, with a transparent isolated ink layer below multiply-composited line art. */
const NativePainting = forwardRef<PaintingHandle, Props>(
  function NativePainting(
    { base, document, brush, onChange, eyedropper, onSample },
    ref,
  ) {
    const lineImage = useImage(illustrationAssets[base] ?? null);
    const lineSvg = useSVG(clothingAssets[base] ?? null);
    const [layout, setLayout] = useState({ width: 1, height: 1 });
    const [active, setActive] = useState<Stroke | null>(null);
    const activeRef = useRef<Stroke | null>(null);
    const pictures = useRef(new Map<string, SkPicture>());
    const fit = Math.min(
      layout.width / document.width,
      layout.height / document.height,
    );
    const offsetX = (layout.width - document.width * fit) / 2,
      offsetY = (layout.height - document.height * fit) / 2;
    const zoom = useSharedValue(1),
      panX = useSharedValue(0),
      panY = useSharedValue(0);
    const oldZoom = useSharedValue(1),
      oldX = useSharedValue(0),
      oldY = useSharedValue(0),
      focalX = useSharedValue(0),
      focalY = useSharedValue(0);
    const panOriginX = useSharedValue(0),
      panOriginY = useSharedValue(0);
    const transform = useDerivedValue(
      () => [
        { translateX: offsetX + panX.value },
        { translateY: offsetY + panY.value },
        { scale: fit * zoom.value },
      ],
      [fit, offsetX, offsetY],
    );
    const committed = useMemo(
      () =>
        document.strokes.map((stroke) => {
          if (!pictures.current.has(stroke.id))
            pictures.current.set(
              stroke.id,
              recordStroke(stroke, document.width, document.height),
            );
          return { id: stroke.id, picture: pictures.current.get(stroke.id)! };
        }),
      [document.strokes, document.width, document.height],
    );
    const activePicture = useMemo(
      () =>
        active ? recordStroke(active, document.width, document.height) : null,
      [active, document.width, document.height],
    );
    useEffect(
      () => () => {
        activePicture?.dispose();
      },
      [activePicture],
    );
    useEffect(() => {
      const retained = new Set(
        [...document.strokes, ...document.redo].map((s) => s.id),
      );
      for (const [id, picture] of pictures.current)
        if (!retained.has(id)) {
          picture.dispose();
          pictures.current.delete(id);
        }
    }, [document.strokes, document.redo]);
    useEffect(
      () => () => {
        for (const picture of pictures.current.values()) picture.dispose();
        pictures.current.clear();
      },
      [],
    );

    const makeFullImage = (maxWidth = document.width): SkImage => {
      const scale = Math.min(1, maxWidth / document.width);
      const surface = Skia.Surface.MakeOffscreen(
        Math.round(document.width * scale),
        Math.round(document.height * scale),
      );
      if (!surface)
        throw new Error(
          "Não foi possível reservar memória para exportar esta pintura.",
        );
      const canvas = surface.getCanvas();
      canvas.clear(Skia.Color("white"));
      canvas.scale(scale, scale);
      canvas.saveLayer();
      for (const stroke of document.strokes) drawStroke(canvas, stroke);
      canvas.restore();
      const paint = Skia.Paint();
      paint.setBlendMode(BlendMode.Multiply);
      if (lineImage)
        canvas.drawImageRect(
          lineImage,
          Skia.XYWHRect(0, 0, lineImage.width(), lineImage.height()),
          Skia.XYWHRect(0, 0, document.width, document.height),
          paint,
        );
      if (lineSvg) {
        canvas.saveLayer(paint);
        canvas.drawSvg(lineSvg, document.width, document.height);
        canvas.restore();
      }
      surface.flush();
      const image = surface.makeImageSnapshot();
      paint.dispose();
      surface.dispose();
      return image;
    };
    useImperativeHandle(ref, () => ({
      exportPng: async (maxWidth?: number) => {
        if (!lineImage && !lineSvg)
          throw new Error("A ilustração ainda está carregando.");
        const image = makeFullImage(maxWidth);
        const png = image.encodeToBytes(ImageFormat.PNG, 100);
        image.dispose();
        return png;
      },
      resetView: () => {
        zoom.value = 1;
        panX.value = 0;
        panY.value = 0;
      },
    }));
    const point = (x: number, y: number, pressure?: number): Point => ({
      x: Math.max(
        0,
        Math.min(
          document.width,
          (x - offsetX - panX.value) / (fit * zoom.value),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          document.height,
          (y - offsetY - panY.value) / (fit * zoom.value),
        ),
      ),
      pressure: pressure || 0.65,
      time: Date.now(),
    });
    const cancel = () => {
      activeRef.current = null;
      setActive(null);
    };
    const drawGesture = Gesture.Pan()
      .minDistance(0)
      .maxPointers(1)
      .runOnJS(true)
      .onStart((e) => {
        if (e.numberOfPointers !== 1 || (!lineImage && !lineSvg)) return;
        const p = point(e.x, e.y, e.stylusData?.pressure);
        if (eyedropper) {
          const image = makeFullImage();
          const pixels = image.readPixels(Math.floor(p.x), Math.floor(p.y), {
            width: 1,
            height: 1,
            colorType: ColorType.RGBA_8888,
            alphaType: AlphaType.Unpremul,
          });
          if (pixels?.length)
            onSample(
              "#" +
                Array.from(pixels.slice(0, 3))
                  .map((n) => Math.round(n).toString(16).padStart(2, "0"))
                  .join("")
                  .toUpperCase(),
            );
          image.dispose();
          return;
        }
        const stroke = {
          id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          seed: Math.floor(Math.random() * 0xffffffff),
          settings: { ...brush },
          points: [p],
        };
        activeRef.current = stroke;
        setActive(stroke);
      })
      .onUpdate((e) => {
        if (e.numberOfPointers !== 1) {
          cancel();
          return;
        }
        const stroke = activeRef.current;
        if (!stroke) return;
        const p = point(e.x, e.y, e.stylusData?.pressure),
          last = stroke.points[stroke.points.length - 1];
        if (Math.hypot(last.x - p.x, last.y - p.y) < 0.6) return;
        p.x = last.x * 0.12 + p.x * 0.88;
        p.y = last.y * 0.12 + p.y * 0.88;
        // Active data is capped by stroke finalization; immutable commits are persisted separately.
        activeRef.current = { ...stroke, points: [...stroke.points, p] };
        setActive(activeRef.current);
      })
      .onEnd((_e, success) => {
        const stroke = activeRef.current;
        if (success && stroke)
          onChange({
            ...document,
            strokes: [...document.strokes, stroke],
            redo: [],
          });
        cancel();
      })
      .onFinalize(() => cancel());
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        oldZoom.value = zoom.value;
        oldX.value = panX.value;
        oldY.value = panY.value;
        focalX.value = e.focalX - offsetX;
        focalY.value = e.focalY - offsetY;
      })
      .onUpdate((e) => {
        const next = Math.max(1, Math.min(8, oldZoom.value * e.scale));
        zoom.value = next;
        panX.value =
          e.focalX -
          offsetX -
          ((focalX.value - oldX.value) * next) / oldZoom.value;
        panY.value =
          e.focalY -
          offsetY -
          ((focalY.value - oldY.value) * next) / oldZoom.value;
      });
    const pan = Gesture.Pan()
      .minPointers(2)
      .maxPointers(2)
      .averageTouches(true)
      .onStart(() => {
        panOriginX.value = panX.value;
        panOriginY.value = panY.value;
      })
      .onUpdate((e) => {
        panX.value = panOriginX.value + e.translationX;
        panY.value = panOriginY.value + e.translationY;
      });
    const gesture = Gesture.Simultaneous(drawGesture, pinch, pan);
    return (
      <View
        style={styles.frame}
        onLayout={(e) => setLayout(e.nativeEvent.layout)}
      >
        <GestureDetector gesture={gesture}>
          <Canvas
            style={styles.canvas}
            accessibilityLabel="Ilustração para pintar. Um dedo pinta; dois dedos movem e ampliam."
          >
            <Group
              transform={transform}
              clip={Skia.XYWHRect(0, 0, document.width, document.height)}
            >
              <Rect
                x={0}
                y={0}
                width={document.width}
                height={document.height}
                color="white"
              />
              <Group layer>
                {committed.map(({ id, picture }) => (
                  <Picture key={id} picture={picture} />
                ))}
                {activePicture && <Picture picture={activePicture} />}
              </Group>
              <Group blendMode="multiply">
                {lineImage && (
                  <SkiaImage
                    image={lineImage}
                    x={0}
                    y={0}
                    width={document.width}
                    height={document.height}
                    fit="fill"
                  />
                )}
                {lineSvg && (
                  <ImageSVG
                    svg={lineSvg}
                    x={0}
                    y={0}
                    width={document.width}
                    height={document.height}
                  />
                )}
              </Group>
            </Group>
          </Canvas>
        </GestureDetector>
        {!lineImage && !lineSvg && (
          <View pointerEvents="none" style={styles.loading}>
            <Text>Preparando a ilustração offline…</Text>
          </View>
        )}
      </View>
    );
  },
);
export default NativePainting;
const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 120,
    overflow: "hidden",
    backgroundColor: "#DFD1B6",
    borderRadius: 14,
  },
  canvas: { flex: 1 },
  loading: {
    position: "absolute",
    top: "45%",
    alignSelf: "center",
    backgroundColor: "#FFF7E7",
    padding: 14,
    borderRadius: 10,
  },
});
