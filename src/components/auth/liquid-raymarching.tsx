"use client";

import { AdaptiveDpr } from "@react-three/drei";
import { Canvas, useThree, type GLProps } from "@react-three/fiber";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
} from "three";
import {
  Break,
  Fn,
  If,
  Loop,
  MeshBasicNodeMaterial,
  abs,
  dot,
  float,
  max,
  min,
  mix,
  normalize,
  reflect,
  sin,
  timerLocal,
  uv,
  vec2,
  vec3,
  viewportResolution,
} from "three/tsl";
import { WebGPURenderer } from "three/webgpu";

// Adapted from phobon/raymarching-tsl (MIT):
// https://github.com/phobon/raymarching-tsl
const liquidMaterial = new MeshBasicNodeMaterial();
type TslNode = ReturnType<typeof float>;
type RendererFactoryProps<T> = T extends (props: infer P) => unknown ? P : never;
type CanvasRendererProps = RendererFactoryProps<GLProps>;

const sphereDistance = Fn(([point, radius]: [TslNode, TslNode]) =>
  point.length().sub(radius),
);

const smoothMinimum = Fn(([a, b, smoothness]: [TslNode, TslNode, TslNode]) => {
  const blend = max(smoothness.sub(abs(a.sub(b))), 0).div(smoothness);
  return min(a, b).sub(blend.mul(blend).mul(smoothness).mul(0.25));
});

const animationTime = timerLocal(0.72);

const sceneDistance = Fn(([position]: [TslNode]) => {
  const movingPosition = position.add(vec3(sin(animationTime), 0, 0));
  const movingSphere = sphereDistance(movingPosition, 0.5);
  const anchorSphere = sphereDistance(position, 0.3);

  return smoothMinimum(anchorSphere, movingSphere, 0.3);
});

const calculateNormal = Fn(([point]: [TslNode]) => {
  const epsilon = float(0.0001);
  const offset = vec2(epsilon, 0);

  return normalize(
    vec3(
      sceneDistance(point.add(offset.xyy)).sub(
        sceneDistance(point.sub(offset.xyy)),
      ),
      sceneDistance(point.add(offset.yxy)).sub(
        sceneDistance(point.sub(offset.yxy)),
      ),
      sceneDistance(point.add(offset.yyx)).sub(
        sceneDistance(point.sub(offset.yyx)),
      ),
    ),
  );
});

const lightScene = Fn(([rayOrigin, rayPoint]: [TslNode, TslNode]) => {
  const normal = calculateNormal(rayPoint);
  const viewDirection = normalize(rayOrigin.sub(rayPoint));
  const ambientLight = vec3(0.2);
  const lightDirection = normalize(vec3(1, 1, 1));
  const lightColor = vec3(0.92, 1, 0.94);
  const diffuseAmount = max(0, dot(lightDirection, normal));
  const diffuseLight = diffuseAmount.mul(lightColor);
  const skyColor = vec3(0.02, 0.42, 0.2);
  const groundColor = vec3(0.18, 0.06, 0.025);
  const hemisphereMix = normal.y.mul(0.5).add(0.5);
  const hemisphereLight = mix(groundColor, skyColor, hemisphereMix);
  const reflectedLight = normalize(reflect(lightDirection.negate(), normal));
  const phongAmount = max(0, dot(viewDirection, reflectedLight)).pow(32);
  const specularLight = vec3(phongAmount).toVar();
  const fresnelAmount = float(1)
    .sub(max(0, dot(viewDirection, normal)))
    .pow(2);

  specularLight.mulAssign(fresnelAmount);

  const combinedLight = ambientLight.mul(0.1);
  combinedLight.addAssign(diffuseLight.mul(0.5));
  combinedLight.addAssign(hemisphereLight.mul(0.2));

  const finalColor = vec3(0.1).mul(combinedLight).toVar();
  finalColor.addAssign(specularLight);

  return finalColor;
});

liquidMaterial.colorNode = Fn(() => {
  const screenPosition = uv()
    .mul(viewportResolution.xy)
    .mul(2)
    .sub(viewportResolution.xy)
    .div(viewportResolution.y);
  const rayOrigin = vec3(0, 0, -3);
  const rayDirection = vec3(screenPosition, 1).normalize();
  const travelledDistance = float(0).toVar();
  const rayPoint = rayOrigin
    .add(rayDirection.mul(travelledDistance))
    .toVar();

  Loop({ start: 1, end: 80 }, () => {
    const distance = sceneDistance(rayPoint);
    travelledDistance.addAssign(distance.mul(0.8));
    rayPoint.assign(rayOrigin.add(rayDirection.mul(travelledDistance)));

    If(distance.lessThan(0.005), () => {
      Break();
    });

    If(travelledDistance.greaterThan(50), () => {
      Break();
    });
  });

  return lightScene(rayOrigin, rayPoint);
})();

function LiquidPlane() {
  const { width, height } = useThree((state) => state.viewport);

  return (
    <mesh scale={[width, height, 1]}>
      <planeGeometry args={[1, 1]} />
      <primitive object={liquidMaterial} attach="material" />
    </mesh>
  );
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

function LiquidCanvas({
  children,
  onUnavailable,
}: {
  children: ReactNode;
  onUnavailable: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [rendererReady, setRendererReady] = useState(false);
  const renderer = useMemo(() => {
    return ({ canvas }: CanvasRendererProps) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("El efecto requiere un canvas del navegador.");
      }

      const webGPURenderer = new WebGPURenderer({
        canvas,
        antialias: true,
        alpha: true,
        // WebGPU puede estar anunciado por el navegador aunque el adaptador no
        // sea estable (VM, escritorio remoto, software rendering). El backend
        // WebGL2 conserva el efecto TSL y degrada de forma mucho más predecible.
        forceWebGL: true,
      });

      canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        onUnavailable();
      }, { once: true });

      webGPURenderer.toneMapping = ACESFilmicToneMapping;
      webGPURenderer.outputColorSpace = SRGBColorSpace;
      void webGPURenderer.init().then(
        () => setRendererReady(true),
        () => onUnavailable(),
      );

      return webGPURenderer;
    };
  }, [onUnavailable]);

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={rendererReady ? (reducedMotion ? "demand" : "always") : "never"}
      gl={renderer}
    >
      <AdaptiveDpr pixelated />
      {children}
    </Canvas>
  );
}

export default function LiquidRaymarching() {
  const [unavailable, setUnavailable] = useState(false);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-black"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_38%,rgba(50,185,99,0.34),transparent_34%),linear-gradient(145deg,#020403,#07120b)]" />
      {!unavailable && (
        <LiquidCanvas onUnavailable={() => setUnavailable(true)}>
          <LiquidPlane />
        </LiquidCanvas>
      )}
    </div>
  );
}
