import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import * as THREE from 'three';

@Component({
  selector: 'app-rocket-3d',
  standalone: true,
  template: `
    <canvas #rocketCanvas class="rocket-canvas"></canvas>
  `,
  styles: [`
    .rocket-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  `]
})
export class Rocket3DComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('rocketCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private rocket!: THREE.Group;
  private animationId!: number;
  private particleSystem!: THREE.Points;
  private smokeSystem!: THREE.Points;

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    // Use setTimeout to ensure the DOM is fully rendered
    setTimeout(() => {
      this.initThreeJS();
      this.createRocket();
      this.createParticleEffects();
      this.animate();
    }, 0);
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  private initThreeJS(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement;
    
    if (!container) {
      console.error('Rocket container not found');
      return;
    }

    // Ensure container has dimensions
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 600;
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = null; // Transparent background

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      width / height,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 12);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Enhanced Lighting for modern look
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    // Main directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 8);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    this.scene.add(directionalLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);

    // Engine glow
    const pointLight = new THREE.PointLight(0xff6b00, 2, 50);
    pointLight.position.set(0, -3.5, 0);
    this.scene.add(pointLight);

    // Rim light for edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, 0, -10);
    this.scene.add(rimLight);

    // Handle resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private createRocket(): void {
    this.rocket = new THREE.Group();

    // Main Body - Sleek, modern design
    const bodyGeometry = new THREE.CylinderGeometry(0.6, 0.65, 5, 64);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.1,
      envMapIntensity: 1.0
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0;
    body.castShadow = true;
    body.receiveShadow = true;
    this.rocket.add(body);

    // Red accent sections
    const accentGeometry = new THREE.CylinderGeometry(0.6, 0.65, 0.3, 64);
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.8,
      roughness: 0.2
    });
    
    const accent1 = new THREE.Mesh(accentGeometry, accentMaterial);
    accent1.position.y = 1.5;
    this.rocket.add(accent1);

    const accent2 = new THREE.Mesh(accentGeometry, accentMaterial);
    accent2.position.y = -1.5;
    this.rocket.add(accent2);

    // Sleek Nose Cone - More aerodynamic
    const noseGeometry = new THREE.ConeGeometry(0.6, 1.8, 64);
    const noseMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.95,
      roughness: 0.05,
      envMapIntensity: 1.2
    });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.y = 3.4;
    nose.castShadow = true;
    this.rocket.add(nose);

    // Nose tip - Red accent
    const tipGeometry = new THREE.SphereGeometry(0.15, 32, 32);
    const tipMaterial = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xdc2626,
      emissiveIntensity: 0.3
    });
    const tip = new THREE.Mesh(tipGeometry, tipMaterial);
    tip.position.y = 4.3;
    this.rocket.add(tip);

    // Modern window - Larger, more prominent
    const windowGeometry = new THREE.CircleGeometry(0.25, 64);
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e40af,
      metalness: 0.95,
      roughness: 0.05,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    });
    const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
    windowMesh.position.set(0.61, 0.8, 0);
    windowMesh.rotation.y = Math.PI / 2;
    this.rocket.add(windowMesh);

    // Window frame
    const frameGeometry = new THREE.RingGeometry(0.25, 0.28, 64);
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.9,
      roughness: 0.1
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.set(0.61, 0.8, 0);
    frame.rotation.y = Math.PI / 2;
    this.rocket.add(frame);

    // Modern fins - Sleeker, more aerodynamic
    const finGeometry = new THREE.BoxGeometry(0.15, 1.2, 0.4);
    const finMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.8,
      roughness: 0.2
    });

    const finPositions = [
      { pos: [0.75, -2.2, 0], rot: [0, 0, 0.2] },
      { pos: [-0.75, -2.2, 0], rot: [0, 0, -0.2] },
      { pos: [0, -2.2, 0.75], rot: [0, 0, 0.2] },
      { pos: [0, -2.2, -0.75], rot: [0, 0, -0.2] }
    ];

    finPositions.forEach(({ pos, rot }) => {
      const fin = new THREE.Mesh(finGeometry, finMaterial);
      fin.position.set(pos[0], pos[1], pos[2]);
      fin.rotation.set(rot[0], rot[1], rot[2]);
      fin.castShadow = true;
      this.rocket.add(fin);
    });

    // Advanced engine nozzle - More detailed
    const nozzleGeometry = new THREE.CylinderGeometry(0.5, 0.7, 0.6, 64);
    const nozzleMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.95,
      roughness: 0.05
    });
    const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
    nozzle.position.y = -2.8;
    this.rocket.add(nozzle);

    // Nozzle interior
    const nozzleInteriorGeometry = new THREE.CylinderGeometry(0.3, 0.5, 0.65, 32);
    const nozzleInteriorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.1
    });
    const nozzleInterior = new THREE.Mesh(nozzleInteriorGeometry, nozzleInteriorMaterial);
    nozzleInterior.position.y = -2.75;
    this.rocket.add(nozzleInterior);

    // Tech details - Antennas
    const antennaGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 16);
    const antennaMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.9,
      roughness: 0.1
    });
    
    const antenna1 = new THREE.Mesh(antennaGeometry, antennaMaterial);
    antenna1.position.set(0.5, 2.5, 0);
    this.rocket.add(antenna1);

    const antenna2 = new THREE.Mesh(antennaGeometry, antennaMaterial);
    antenna2.position.set(-0.5, 2.5, 0);
    this.rocket.add(antenna2);

    // Scale the entire rocket to be more visible
    this.rocket.scale.set(1.2, 1.2, 1.2);

    this.scene.add(this.rocket);
  }

  private createParticleEffects(): void {
    // Fire particles
    const fireGeometry = new THREE.BufferGeometry();
    const fireCount = 200;
    const firePositions = new Float32Array(fireCount * 3);
    const fireColors = new Float32Array(fireCount * 3);
    const fireSizes = new Float32Array(fireCount);

    for (let i = 0; i < fireCount; i++) {
      const i3 = i * 3;
      firePositions[i3] = (Math.random() - 0.5) * 1.5;
      firePositions[i3 + 1] = -2.5 - Math.random() * 3;
      firePositions[i3 + 2] = (Math.random() - 0.5) * 1.5;

      const color = new THREE.Color();
      const hue = Math.random() * 0.1 + 0.05; // Orange to red
      color.setHSL(hue, 1, 0.5);
      fireColors[i3] = color.r;
      fireColors[i3 + 1] = color.g;
      fireColors[i3 + 2] = color.b;

      fireSizes[i] = Math.random() * 0.1 + 0.05;
    }

    fireGeometry.setAttribute('position', new THREE.BufferAttribute(firePositions, 3));
    fireGeometry.setAttribute('color', new THREE.BufferAttribute(fireColors, 3));
    fireGeometry.setAttribute('size', new THREE.BufferAttribute(fireSizes, 1));

    const fireMaterial = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    this.particleSystem = new THREE.Points(fireGeometry, fireMaterial);
    this.scene.add(this.particleSystem);

    // Smoke particles
    const smokeGeometry = new THREE.BufferGeometry();
    const smokeCount = 100;
    const smokePositions = new Float32Array(smokeCount * 3);
    const smokeSizes = new Float32Array(smokeCount);

    for (let i = 0; i < smokeCount; i++) {
      const i3 = i * 3;
      smokePositions[i3] = (Math.random() - 0.5) * 2;
      smokePositions[i3 + 1] = -2.5 - Math.random() * 4;
      smokePositions[i3 + 2] = (Math.random() - 0.5) * 2;
      smokeSizes[i] = Math.random() * 0.3 + 0.2;
    }

    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
    smokeGeometry.setAttribute('size', new THREE.BufferAttribute(smokeSizes, 1));

    const smokeMaterial = new THREE.PointsMaterial({
      color: 0x666666,
      size: 0.5,
      transparent: true,
      opacity: 0.4,
      blending: THREE.NormalBlending
    });

    this.smokeSystem = new THREE.Points(smokeGeometry, smokeMaterial);
    this.scene.add(this.smokeSystem);
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    // Rocket animation - upward movement with wobble
    const time = Date.now() * 0.001;
    this.rocket.position.y = Math.sin(time * 0.5) * 0.3 - 0.5;
    this.rocket.rotation.y = Math.sin(time * 0.3) * 0.05;
    this.rocket.rotation.z = Math.cos(time * 0.4) * 0.02;

    // Animate fire particles
    const firePositions = this.particleSystem.geometry.attributes['position'].array as Float32Array;
    for (let i = 0; i < firePositions.length; i += 3) {
      firePositions[i + 1] += 0.05;
      if (firePositions[i + 1] > 2) {
        firePositions[i + 1] = -2.5;
        firePositions[i] = (Math.random() - 0.5) * 1.5;
        firePositions[i + 2] = (Math.random() - 0.5) * 1.5;
      }
    }
    this.particleSystem.geometry.attributes['position'].needsUpdate = true;

    // Animate smoke particles
    const smokePositions = this.smokeSystem.geometry.attributes['position'].array as Float32Array;
    const smokeSizes = this.smokeSystem.geometry.attributes['size'].array as Float32Array;
    for (let i = 0; i < smokePositions.length; i += 3) {
      smokePositions[i + 1] += 0.03;
      smokeSizes[i / 3] += 0.01;
      if (smokePositions[i + 1] > 3) {
        smokePositions[i + 1] = -2.5;
        smokePositions[i] = (Math.random() - 0.5) * 2;
        smokePositions[i + 2] = (Math.random() - 0.5) * 2;
        smokeSizes[i / 3] = Math.random() * 0.3 + 0.2;
      }
    }
    this.smokeSystem.geometry.attributes['position'].needsUpdate = true;
    this.smokeSystem.geometry.attributes['size'].needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  };

  private onWindowResize(): void {
    const container = this.canvasRef.nativeElement.parentElement;
    if (!container || !this.camera || !this.renderer) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 600;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

