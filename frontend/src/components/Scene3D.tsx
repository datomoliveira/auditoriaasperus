import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Scene3DProps {
  className?: string;
}

/**
 * Cena 3D (WebGL) de fundo — um "núcleo" wireframe com anéis orbitais e um campo
 * de partículas. Reage suavemente ao ponteiro, pausa fora de foco e respeita
 * `prefers-reduced-motion`.
 */
export function Scene3D({ className }: Scene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0b0c, 0.05);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    camera.position.set(0, 0.3, 8.2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      // Ambiente sem WebGL — o fundo CSS cobre o caso.
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const disposables: { dispose: () => void }[] = [];

    // ---- Núcleo: icosaedro wireframe -------------------------------------
    const coreGeo = new THREE.IcosahedronGeometry(2.1, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xe9e6df,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    disposables.push(coreGeo, coreMat);

    const innerGeo = new THREE.IcosahedronGeometry(1.02, 0);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xff5a2c,
      transparent: true,
      opacity: 0.1,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    disposables.push(innerGeo, innerMat);

    const group = new THREE.Group();
    group.add(core, inner);
    scene.add(group);

    // ---- Anéis orbitais ---------------------------------------------------
    const ringGeoA = new THREE.TorusGeometry(3.05, 0.004, 6, 220);
    const ringGeoB = new THREE.TorusGeometry(3.7, 0.0035, 6, 240);
    const ringMatA = new THREE.MeshBasicMaterial({
      color: 0xe9e6df,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const ringMatB = new THREE.MeshBasicMaterial({
      color: 0xff5a2c,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    const ringA = new THREE.Mesh(ringGeoA, ringMatA);
    const ringB = new THREE.Mesh(ringGeoB, ringMatB);
    ringA.rotation.x = Math.PI / 2.35;
    ringB.rotation.x = Math.PI / 1.75;
    ringB.rotation.y = 0.55;
    group.add(ringA, ringB);
    disposables.push(ringGeoA, ringGeoB, ringMatA, ringMatB);

    // ---- Campo de partículas em casca esférica ---------------------------
    const shellCount = 900;
    const shellPos = new Float32Array(shellCount * 3);
    for (let i = 0; i < shellCount; i++) {
      const r = 2.7 + Math.random() * 3.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      shellPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      shellPos[i * 3 + 1] = r * Math.cos(phi);
      shellPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute("position", new THREE.BufferAttribute(shellPos, 3));
    const shellMat = new THREE.PointsMaterial({
      color: 0xd9d5cc,
      size: 0.021,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const shell = new THREE.Points(shellGeo, shellMat);
    scene.add(shell);
    disposables.push(shellGeo, shellMat);

    // ---- Poeira distante --------------------------------------------------
    const dustCount = 420;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 34;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 22;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 6;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xff5a2c,
      size: 0.035,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);
    disposables.push(dustGeo, dustMat);

    // ---- Interação / loop -------------------------------------------------
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const onPointerMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 0.7;
      target.y = (e.clientY / window.innerHeight - 0.5) * 0.7;
    };

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const clock = new THREE.Clock();
    let raf = 0;
    let visible = !document.hidden;

    const render = (t: number) => {
      if (!reduce) {
        group.rotation.y = t * 0.11;
        group.rotation.x = Math.sin(t * 0.17) * 0.16;
        ringA.rotation.z = t * 0.22;
        ringB.rotation.z = -t * 0.16;
        shell.rotation.y = -t * 0.028;
        dust.rotation.y = t * 0.012;

        current.x += (target.x - current.x) * 0.045;
        current.y += (target.y - current.y) * 0.045;
        group.rotation.z = current.x * 0.35;
        group.position.y = -current.y * 0.45;
      }
      renderer.render(scene, camera);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      render(clock.getElapsedTime());
    };

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) clock.getDelta();
    };

    if (reduce) {
      render(0);
    } else {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className={className}
      style={{ pointerEvents: "none" }}
    />
  );
}

export default Scene3D;
