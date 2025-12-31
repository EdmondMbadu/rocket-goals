import { Component, signal, computed, inject, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone, HostListener, effect } from '@angular/core';
import { Router, RouterLink, RouterOutlet, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ElevenLabsService } from './elevenlabs.service';
import { SpeechRecognitionService } from './speech-recognition.service';
import { FirestoreAIService } from './firestore-ai.service';
import { AuthService } from './auth.service';
import { RocketGoalsService } from './rocket-goals.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { stripMarkdownForTTS } from './text-utils';
import { ThemeService } from './theme.service';
import { BlogService } from './blog.service';
import type * as THREE from 'three';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

type ChallengeAuthStage = 'email' | 'existing-login' | 'new-profile' | 'verify' | 'saving';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, FormsModule, CommonModule, AvatarDropdownComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit, OnDestroy {
  protected readonly title = signal('rocket-goals');

  @ViewChild('rocketCanvas') rocketCanvas!: ElementRef<HTMLCanvasElement>;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private stars: THREE.Points[] = [];
  private animationId: number | null = null;
  private animationLoop: (() => void) | null = null;
  private threeModule: typeof import('three') | null = null;
  private resizeHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private isAnimationPaused = false;
  private prefersReducedMotion: MediaQueryList | null = null;

  // Conversation state
  isConversationActive = signal(false);
  isSpeaking = signal(false);
  isListening = signal(false);
  isThinking = signal(false); // Indicates AI is processing
  userMessage = '';
  conversationHistory: Array<{ role: 'user' | 'avatar', message: string, displayedMessage?: string }> = [];
  errorMessage = signal<string | null>(null);
  speechSupported = signal(false);

  // Conversation mode: 'voice' (default) or 'chat'
  conversationMode = signal<'voice' | 'chat'>('voice');

  // Conversation state management
  conversationState = signal<'idle' | 'waiting_for_user' | 'ai_speaking' | 'user_speaking' | 'processing'>('idle');
  isWaitingForUser = signal(false); // Indicates AI is waiting for user response

  // Timer state management
  conversationStartTime = signal<number | null>(null);
  private currentTime = signal<number>(Date.now()); // Signal that updates every second to trigger recomputation
  private readonly CONVERSATION_TIME_LIMIT = 180; // 3 minutes in seconds to keep chats tight
  private readonly MAX_LISTEN_DURATION_MS = 15000; // Let users respond without lingering too long
  conversationElapsedTime = computed(() => {
    const start = this.conversationStartTime();
    const now = this.currentTime();
    if (!start) return 0;
    return Math.floor((now - start) / 1000);
  });
  conversationTimeRemaining = computed(() => {
    return Math.max(0, this.CONVERSATION_TIME_LIMIT - this.conversationElapsedTime());
  });
  isTimeUp = computed(() => this.conversationTimeRemaining() === 0);
  shouldAskForEmail = signal(false);
  isWaitingForEmail = signal(false);
  userEmail = signal<string | null>(null);
  isGeneratingPlan = signal(false);
  private timerInterval: any = null;
  private timeUpPending = false; // Prevents overlapping plan generation when time runs out mid-speech

  // Typewriter effect state
  private typewriterIntervals: Map<number, any> = new Map();
  private typewriterSpeed = 6; // Faster character cadence for snappier responses
  private typewriterCatchUpSpeed = 3; // Aggressive catch-up to avoid visible lag

  // Welcome messages
  private welcomeMessages = [
    "Hi! I'm Jim. I'll help you create your instant Rocket Goals Launch Plan. It's free and takes less than three minutes - let's get started! What's the one goal you're most excited about achieving?",
    "Hi! I'm Jim. I'll help you create your instant Rocket Goals Launch Plan. It's free and takes less than three minutes - let's get started! What's the one goal you're most excited about achieving?",
    "Hi! I'm Jim. I'll help you create your instant Rocket Goals Launch Plan. It's free and takes less than three minutes - let's get started! What's the one goal you're most excited about achieving?"
  ];

  // Lazy load services only when needed
  private elevenLabsService = inject(ElevenLabsService);
  private speechRecognitionService = inject(SpeechRecognitionService);
  private firestoreAIService = inject(FirestoreAIService);
  protected authService = inject(AuthService);
  private rocketGoalsService = inject(RocketGoalsService);
  private themeService = inject(ThemeService);
  protected blogService = inject(BlogService);
  protected readonly isDarkMode = this.themeService.isDarkMode;
  private router = inject(Router);
  private routerSubscription: Subscription | null = null;
  private authOnlyRoutes = new Set(['/login', '/signup', '/welcome']);
  private componentRoutes = new Set(['/goals', '/rocketgoal', '/profile', '/admin', '/ai', '/pricing', '/contact', '/about', '/quiz', '/schedule']);
  protected currentRoute = signal<string>(this.router.url || '/');
  protected readonly isAuthRoute = computed(() => {
    const route = this.currentRoute();
    // Show router outlet for auth routes and component routes (goals, rocketgoal, profile)
    // Remove query params for matching
    const routePath = route.split('?')[0];
    return this.authOnlyRoutes.has(routePath) ||
      this.componentRoutes.has(routePath) ||
      routePath.startsWith('/rocketgoal/') ||
      routePath.startsWith('/admin/');
  });

  constructor() {
    // Check speech support without initializing the full service
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.speechSupported.set(!!SpeechRecognition);
    this.prefersReducedMotion = typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    // Warm up Firestore client early to trim first-response latency
    this.firestoreAIService.preload().catch(error => {
      console.warn('Firestore preload skipped:', error);
    });

    // Initialize countdown for dashboard
    this.startCountdown();

    // Load custom dashboard title from localStorage
    const savedTitle = localStorage.getItem('dashboardTitle');
    if (savedTitle) {
      this.dashboardTitle.set(savedTitle);
    }

    // Check initial URL for startChallenge param
    this.checkAndStartChallenge(this.router.url);

    // Listen for custom startChallenge event (for same-route navigation)
    window.addEventListener('startChallenge', (event: any) => {
      console.log('startChallenge event received', event);
      this.checkAndStartChallenge(this.router.url);
    });

    // Fetch blog posts when component initializes (only on landing page)
    if (!this.isAuthRoute()) {
      this.blogService.fetchBlogPosts();
    }

    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.currentRoute.set(event.urlAfterRedirects || event.url);
        // Auto-start challenge if query param is present (works on any route)
        const urlString = event.urlAfterRedirects || event.url;
        this.checkAndStartChallenge(urlString);
      });

    // Watch for when landing page becomes visible and re-initialize animation if needed
    effect(() => {
      const isAuth = this.isAuthRoute();
      // When navigating away from landing page, clean up animation
      if (isAuth && this.animationInitialized) {
        this.cleanupAnimation();
      }
      // When landing page becomes visible (isAuthRoute becomes false)
      // Use setTimeout to ensure the canvas is fully rendered in the DOM after Angular updates
      if (!isAuth && !this.animationInitialized) {
        setTimeout(() => {
          // Check if canvas exists in DOM and animation hasn't been initialized yet
          if (this.rocketCanvas?.nativeElement && !this.animationInitialized) {
            void this.initThreeJs();
          }
        }, 150);
        // Fetch blog posts when landing page is visible
        if (this.blogService.blogPosts().length === 0) {
          this.blogService.fetchBlogPosts();
        }
      }
    });
  }

  toggleDarkMode() {
    this.themeService.toggleDarkMode();
  }

  private checkAndStartChallenge(urlString: string) {
    if (urlString.includes('startChallenge=true')) {
      console.log('checkAndStartChallenge: URL contains startChallenge=true', urlString);
      // Use a small delay to ensure the component is ready
      setTimeout(() => {
        if (!this.isChallengeActive()) {
          console.log('Starting challenge...');
          this.startChallenge();
        } else {
          console.log('Challenge already active');
        }
      }, 100);
    } else if (urlString.includes('editGoal=')) {
      const match = urlString.match(/editGoal=([^&]+)/);
      if (match && match[1]) {
        const goalId = match[1];
        console.log('checkAndStartChallenge: URL contains editGoal=', goalId);
        setTimeout(async () => {
          if (!this.isChallengeActive()) {
            await this.startChallengeWithGoal(goalId);
          }
        }, 100);
      }
    }
  }

  private ngZone = inject(NgZone);
  private animationInitialized = false;

  ngAfterViewInit() {
    // Only initialize if landing page is visible
    if (this.rocketCanvas?.nativeElement && !this.isAuthRoute() && !this.animationInitialized) {
      void this.initThreeJs();
    }
  }

  ngOnDestroy() {
    this.cleanupAnimation();
    this.routerSubscription?.unsubscribe();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.typewriterIntervals.forEach(interval => clearInterval(interval));
    this.typewriterIntervals.clear();
  }

  private cleanupAnimation() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.animationLoop = null;
    this.isAnimationPaused = false;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null as any;
    }
    if (this.scene) {
      this.scene.traverse(object => {
        const geometry = (object as any).geometry;
        if (geometry?.dispose) {
          geometry.dispose();
        }
        const material = (object as any).material;
        if (Array.isArray(material)) {
          material.forEach(item => item?.dispose?.());
        } else if (material?.dispose) {
          material.dispose();
        }
      });
      // Clear scene
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]);
      }
    }
    this.animationInitialized = false;
  }

  private async initThreeJs(): Promise<void> {
    // Clean up any existing animation first
    this.cleanupAnimation();

    const canvas = this.rocketCanvas?.nativeElement;
    if (!canvas) {
      return;
    }

    const THREE = await this.loadThree();
    // Ensure we have dimensions
    let width = canvas.clientWidth || window.innerWidth;
    let height = canvas.clientHeight || 600;

    // Scene setup
    this.scene = new THREE.Scene();
    // White fog to fade distant stars into the white background
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.002);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    this.camera.position.z = 20; // Move back a bit to see the rocket
    this.camera.position.y = 2;
    this.camera.rotation.x = -0.1;

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    // --- 1. Create Stars (Warp effect) - BLACK and RED for contrast on White ---
    const starGeometry = new THREE.BufferGeometry();
    const reducedMotion = this.prefersReducedMotion?.matches ?? false;
    const deviceMemory = (navigator as any).deviceMemory || 4;
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const perfScale = Math.min(1, deviceMemory / 4, hardwareConcurrency / 4);
    const baseStarCount = 6000;
    const starCount = reducedMotion ? 1500 : Math.max(2500, Math.floor(baseStarCount * perfScale));
    const positions = new Float32Array(starCount * 3);
    const velocities = new Float32Array(starCount);
    const colors = new Float32Array(starCount * 3);

    const color1 = new THREE.Color(0x000000); // Black
    const color2 = new THREE.Color(0xdc2626); // Red-600

    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 600;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 600;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 600;
      velocities[i] = 0;

      // Mix Black and Red stars (mostly black)
      const color = Math.random() > 0.9 ? color2 : color1;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: 0.7,
      vertexColors: true, // Use the colors attribute
      transparent: true,
      opacity: 0.8
    });

    const starSystem = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(starSystem);

    // --- 2. Create Low-Poly Rocket Model ---
    const rocketGroup = new THREE.Group();

    // Body (Cylinder) - White with Black outline feel
    const bodyGeometry = new THREE.CylinderGeometry(1, 1, 8, 8);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff }); // White body
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

    // Add edges for "sketchy" look
    const bodyEdges = new THREE.EdgesGeometry(bodyGeometry);
    const bodyLine = new THREE.LineSegments(bodyEdges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    body.add(bodyLine);

    rocketGroup.add(body);

    // Nose Cone - Red
    const noseGeometry = new THREE.ConeGeometry(1, 3, 8);
    const noseMaterial = new THREE.MeshBasicMaterial({ color: 0xdc2626 }); // Red
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.y = 5.5;

    // Edges for nose
    const noseEdges = new THREE.EdgesGeometry(noseGeometry);
    const noseLine = new THREE.LineSegments(noseEdges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    nose.add(noseLine);

    rocketGroup.add(nose);

    // Fins (3 fins)
    const finGeometry = new THREE.BoxGeometry(1, 3, 0.2);
    const finMaterial = new THREE.MeshBasicMaterial({ color: 0xdc2626 }); // Red

    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(finGeometry, finMaterial);
      const angle = (i / 3) * Math.PI * 2;
      fin.position.x = Math.cos(angle) * 1.2;
      fin.position.z = Math.sin(angle) * 1.2;
      fin.position.y = -2.5;
      fin.rotation.y = -angle;

      // Edges for fins
      const finEdges = new THREE.EdgesGeometry(finGeometry);
      const finLine = new THREE.LineSegments(finEdges, new THREE.LineBasicMaterial({ color: 0x000000 }));
      fin.add(finLine);

      rocketGroup.add(fin);
    }

    // Engine Glow (Point Light visualizer)
    const engineGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const engineMaterial = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const engine = new THREE.Mesh(engineGeometry, engineMaterial);
    engine.position.y = -4.5;
    rocketGroup.add(engine);

    // Orientation
    rocketGroup.rotation.x = Math.PI / 3;
    rocketGroup.rotation.z = -Math.PI / 6;

    this.scene.add(rocketGroup);

    // Animation Loop - Run outside Angular to avoid change detection cycles
    this.ngZone.runOutsideAngular(() => {
      const animate = () => {
        if (this.isAnimationPaused) {
          return;
        }
        this.animationId = requestAnimationFrame(animate);

        // Update star positions (Warp Speed)
        const positions = starGeometry.attributes['position'].array as Float32Array;
        const velocities = starGeometry.attributes['velocity'].array as Float32Array;

        for (let i = 0; i < starCount; i++) {
          // Accelerate
          velocities[i] += 0.05; // Faster acceleration

          // Move star towards camera (positive Z)
          positions[i * 3 + 2] += velocities[i];

          // Reset if passed camera
          if (positions[i * 3 + 2] > 50) {
            positions[i * 3 + 2] = -400; // Reset far back
            velocities[i] = 0; // Reset speed

            // Randomize X/Y again
            positions[i * 3] = (Math.random() - 0.5) * 600;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 600;
          }
        }

        starGeometry.attributes['position'].needsUpdate = true;

        // Animate Rocket
        // Gentle float
        const time = Date.now() * 0.001;
        rocketGroup.position.y = Math.sin(time) * 0.5;
        rocketGroup.rotation.z = -Math.PI / 6 + Math.sin(time * 0.5) * 0.05;

        // Rotate star system slightly
        starSystem.rotation.z += 0.001;

        this.renderer.render(this.scene, this.camera);
      };

      this.animationLoop = animate;
      if (!reducedMotion) {
        animate();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    });

    // Handle Resize
    this.resizeHandler = () => {
      if (!this.rocketCanvas) return;
      const newWidth = this.rocketCanvas.nativeElement.clientWidth;
      const newHeight = this.rocketCanvas.nativeElement.clientHeight;
      this.camera.aspect = newWidth / newHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', this.resizeHandler, { passive: true });

    this.visibilityHandler = () => {
      if (document.hidden) {
        this.isAnimationPaused = true;
        if (this.animationId) {
          cancelAnimationFrame(this.animationId);
          this.animationId = null;
        }
        return;
      }

      if (!reducedMotion && this.animationLoop && !this.animationId) {
        this.isAnimationPaused = false;
        this.animationLoop();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler, { passive: true });

    this.animationInitialized = true;
  }

  private async loadThree(): Promise<typeof import('three')> {
    if (this.threeModule) {
      return this.threeModule;
    }
    const module = await import('three');
    this.threeModule = module;
    return module;
  }

  public scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async startConversation(): Promise<void> {
    this.isConversationActive.set(true);
    this.conversationHistory = []; // Reset conversation history
    this.errorMessage.set(null); // Clear any previous errors
    this.timeUpPending = false;

    // Start timer
    this.conversationStartTime.set(Date.now());
    this.shouldAskForEmail.set(false);
    this.isWaitingForEmail.set(false);
    this.userEmail.set(null);
    this.isGeneratingPlan.set(false);
    this.startTimerCheck();

    const welcomeMessage = this.welcomeMessages[Math.floor(Math.random() * this.welcomeMessages.length)];
    this.conversationHistory.push({ role: 'avatar', message: welcomeMessage });

    // Only speak welcome message in voice mode
    if (this.conversationMode() === 'voice') {
      await this.speakMessage(welcomeMessage, 'avatar');
    }

    // Auto-start listening after welcome message only in Voice mode
    if (this.conversationMode() === 'voice' && this.speechSupported() && !this.isListening()) {
      setTimeout(() => {
        if (this.isConversationActive() && !this.isListening() && !this.isSpeaking()) {
          console.log('🎤 Auto-starting microphone after welcome message (Voice mode)');
          this.startListening();
        }
      }, 1400); // Give user a quick breather before the mic opens
    }
  }

  private startTimerCheck(): void {
    // Clear any existing interval
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      // Update currentTime signal to trigger recomputation of elapsed time
      this.currentTime.set(Date.now());

      // If time is up, set a pending flag but only act when we're idle to avoid overlap
      if (this.isTimeUp() && !this.shouldAskForEmail() && !this.isGeneratingPlan() && !this.isWaitingForEmail()) {
        this.timeUpPending = true;
      }

      const readyForTimeUp = this.timeUpPending
        && !this.isListening()
        && !this.isSpeaking()
        && !this.isThinking()
        && this.conversationState() === 'waiting_for_user';

      if (readyForTimeUp) {
        this.timeUpPending = false;
        // Time is up - generate plan first, then ask for email
        this.generatePlanAndRequestEmail();
      }
    }, 1000);
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private async generatePlanAndRequestEmail(): Promise<void> {
    if (this.isGeneratingPlan()) {
      return; // Already generating
    }

    this.isGeneratingPlan.set(true);
    this.shouldAskForEmail.set(true);

    // Stop listening if active
    this.stopListening();

    // Clear any pending time-up flag now that we're generating
    this.timeUpPending = false;

    // Interrupt AI if speaking
    if (this.isSpeaking()) {
      this.interruptAI();
    }

    // Add message that plan is being generated
    const generatingMessage = "Great conversation! I'm now creating your personalized Rocket Goals Launch Plan based on everything we discussed. This will just take a moment...";
    this.conversationHistory.push({ role: 'avatar', message: generatingMessage });

    // Speak the message (voice mode only)
    if (this.conversationMode() === 'voice') {
      await this.speakMessage(generatingMessage, 'avatar');
    }

    try {
      // Generate the plan with generatePlan: true
      // Use a more explicit prompt and exclude the "generating plan" message from history
      const planPrompt = "Generate a comprehensive Rocket Goals Launch Plan based on the entire conversation. Create a well-structured document with:\n\n1. EXECUTIVE SUMMARY\n   - User's primary goals and aspirations\n   - Key motivations and values identified\n\n2. KEY INSIGHTS\n   - Important discoveries from the conversation\n   - Challenges and opportunities identified\n\n3. ACTIONABLE STEPS\n   - Specific, measurable actions the user can take\n   - Prioritized by importance and impact\n   - Timeline recommendations where relevant\n\n4. PERSONALIZED RECOMMENDATIONS\n   - Customized strategies based on the user's unique situation\n   - Resources and next steps\n\n5. INSPIRATION & MOTIVATION\n   - Encouraging message tailored to the user\n\nFormat with clear headers (use ## for main sections, ### for subsections), bullet points, and organized structure. Make it comprehensive and detailed - this is the final deliverable.";

      // Exclude the "generating plan" message from history - only pass actual conversation
      const conversationForPlan = this.conversationHistory.filter((item, index) => {
        // Exclude the last message (the "generating plan" message we just added)
        return index < this.conversationHistory.length - 1;
      });

      this.isThinking.set(true);
      const plan = await this.firestoreAIService.getAIResponse(
        planPrompt,
        conversationForPlan, // Use filtered history without the "generating" message
        async (chunk: string) => {
          // Stream plan chunks (but don't speak them in voice mode - too long)
          const lastIndex = this.conversationHistory.length - 1;
          if (this.conversationHistory[lastIndex]?.role === 'avatar') {
            this.conversationHistory[lastIndex].message = chunk;
            this.conversationHistory[lastIndex].displayedMessage = chunk;
            this.conversationHistory = [...this.conversationHistory];
          }
        },
        this.conversationMode(),
        true // generatePlan: true
      );

      this.isThinking.set(false);

      // Update the last message with the full plan
      const lastIndex = this.conversationHistory.length - 1;
      if (this.conversationHistory[lastIndex]?.role === 'avatar') {
        this.conversationHistory[lastIndex].message = plan;
        this.conversationHistory[lastIndex].displayedMessage = plan;
        this.conversationHistory = [...this.conversationHistory];
      }

      // Now ask for email
      await this.requestEmail();
    } catch (error) {
      console.error('Error generating plan:', error);
      this.isThinking.set(false);
      // Still ask for email even if plan generation fails
      await this.requestEmail();
    }
  }

  private async requestEmail(): Promise<void> {
    this.isGeneratingPlan.set(false);
    this.isWaitingForEmail.set(true);

    const emailRequestMessage = "Perfect! Your Rocket Goals Launch Plan is ready. To receive it, I'll need your email address. Please type your email below:";
    this.conversationHistory.push({ role: 'avatar', message: emailRequestMessage });

    // Speak the request (voice mode only)
    if (this.conversationMode() === 'voice') {
      await this.speakMessage(emailRequestMessage, 'avatar');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  async sendMessage(message?: string): Promise<void> {
    const textToSend = message || this.userMessage.trim();

    if (!textToSend || this.isListening()) {
      return;
    }

    // Check if we're waiting for email
    if (this.isWaitingForEmail()) {
      const email = textToSend.trim();

      if (this.isValidEmail(email)) {
        // Valid email - capture it
        this.userEmail.set(email);
        this.isWaitingForEmail.set(false);

        // Add confirmation message
        const confirmationMessage = `Perfect! I've got your email (${email}). Your Rocket Goals Launch Plan is ready to download!`;
        this.conversationHistory.push({ role: 'avatar', message: confirmationMessage });

        // Speak confirmation (voice mode only)
        if (this.conversationMode() === 'voice') {
          await this.speakMessage(confirmationMessage, 'avatar');
        }

        this.userMessage = '';
        return; // Don't proceed with normal message flow
      } else {
        // Invalid email - ask again
        const errorMessage = "That doesn't look like a valid email address. Please enter your email in the format: yourname@example.com";
        this.conversationHistory.push({ role: 'avatar', message: errorMessage });

        if (this.conversationMode() === 'voice') {
          await this.speakMessage(errorMessage, 'avatar');
        }

        this.userMessage = '';
        return;
      }
    }

    // If AI is speaking, interrupt it first
    if (this.isSpeaking()) {
      console.log('🛑 User interrupting AI speech with typed message...');
      this.interruptAI();
    }

    this.userMessage = '';
    this.errorMessage.set(null);
    this.isThinking.set(true); // Show thinking indicator
    this.conversationState.set('processing');
    this.isWaitingForUser.set(false);

    // Add user message to history
    this.conversationHistory.push({ role: 'user', message: textToSend });

    const startTime = performance.now();
    let fullResponse = '';
    let firstChunkSpoken = false;

    try {
      // Get AI response from Firestore with streaming callback
      console.log('Getting AI response for:', textToSend);

      // Set up streaming callback for immediate TTS (only in voice mode)
      const streamCallback = async (chunk: string) => {
        const cleanedChunk = stripMarkdownForTTS(chunk);
        const isVoiceMode = this.conversationMode() === 'voice';

        if (!firstChunkSpoken) {
          // First chunk - start speaking immediately (only in voice mode)
          firstChunkSpoken = true;
          this.isThinking.set(false); // Hide thinking indicator
          if (isVoiceMode) {
            this.isSpeaking.set(true);
            this.conversationState.set('ai_speaking');

            const timeToFirstChunk = performance.now() - startTime;
            console.log(`⚡ Starting TTS in ${timeToFirstChunk.toFixed(0)}ms (Voice mode)`);

            // Start streaming TTS
            await this.elevenLabsService.startStreaming(cleanedChunk);
          } else {
            this.conversationState.set('waiting_for_user');
            console.log(`📝 Chat mode - skipping TTS`);
          }

          // Update conversation history with partial response
          fullResponse = chunk;
          // Find and remove only the LAST avatar message (current streaming one), not all avatar messages
          const lastAvatarIndex = this.conversationHistory.map((item, idx) =>
            item.role === 'avatar' ? idx : -1
          ).filter(idx => idx !== -1).pop();

          if (lastAvatarIndex !== undefined) {
            // Remove only the last avatar message (the one currently being streamed)
            this.conversationHistory.splice(lastAvatarIndex, 1);
          }

          const avatarIndex = this.conversationHistory.length;
          this.conversationHistory.push({
            role: 'avatar',
            message: fullResponse,
            displayedMessage: '' // Start with empty for typewriter effect
          });

          // Start typewriter effect
          this.startTypewriter(avatarIndex, fullResponse);
        } else {
          // Subsequent chunks - queue for TTS (only in voice mode)
          if (isVoiceMode) {
            // Note: chunk here is only the new text (not the full accumulated)
            await this.elevenLabsService.addStreamChunk(cleanedChunk);
          }

          // Update conversation history by appending the new chunk
          fullResponse += chunk;

          // Find the LAST avatar message (the one currently being streamed) and update it
          // Find all avatar indices, get the last one
          const avatarIndices = this.conversationHistory
            .map((item, idx) => item.role === 'avatar' ? idx : -1)
            .filter(idx => idx !== -1);
          const avatarIndex = avatarIndices.length > 0 ? avatarIndices[avatarIndices.length - 1] : -1;

          if (avatarIndex >= 0) {
            // Update the last avatar message (the one currently being streamed)
            this.conversationHistory[avatarIndex].message = fullResponse;
            // Continue typewriter effect with new text
            this.continueTypewriter(avatarIndex, fullResponse);
          } else {
            // If no avatar message found, create one
            const newIndex = this.conversationHistory.length;
            this.conversationHistory.push({
              role: 'avatar',
              message: fullResponse,
              displayedMessage: ''
            });
            this.startTypewriter(newIndex, fullResponse);
          }
        }
      };

      const response = await this.firestoreAIService.getAIResponse(textToSend, this.conversationHistory, streamCallback, this.conversationMode());

      const aiTime = performance.now() - startTime;
      console.log(`AI response received in ${aiTime.toFixed(0)}ms:`, response);

      // Store final formatted response for display
      fullResponse = response;

      // Ensure typewriter completes for final response
      // Find the LAST avatar message (the one currently being streamed)
      const avatarIndices = this.conversationHistory
        .map((item, idx) => item.role === 'avatar' ? idx : -1)
        .filter(idx => idx !== -1);
      const avatarIndex = avatarIndices.length > 0 ? avatarIndices[avatarIndices.length - 1] : -1;

      if (avatarIndex >= 0) {
        // Update the last avatar message
        this.conversationHistory[avatarIndex].message = fullResponse;
        // Complete typewriter effect
        this.completeTypewriter(avatarIndex, fullResponse);
      } else {
        // If no avatar message found, create one
        this.conversationHistory.push({
          role: 'avatar',
          message: fullResponse,
          displayedMessage: ''
        });
        this.startTypewriter(this.conversationHistory.length - 1, fullResponse);
      }

      // Finish streaming TTS (only in voice mode)
      if (this.conversationMode() === 'voice') {
        await this.elevenLabsService.finishStreaming();
        this.isSpeaking.set(false);
      }
      this.conversationState.set('waiting_for_user');
      this.isWaitingForUser.set(true);

      const totalTime = performance.now() - startTime;
      console.log(`Total time: ${totalTime.toFixed(0)}ms`);
      console.log('✅ AI finished speaking - waiting for user response');

      // Auto-start listening only in Voice mode - longer delay for more natural feel
      if (this.conversationMode() === 'voice' && this.speechSupported() && this.isConversationActive() && !this.isListening()) {
        // Longer delay to let the response sink in and feel more natural
        setTimeout(() => {
          if (this.isConversationActive() && !this.isListening() && !this.isSpeaking()) {
            console.log('🎤 Auto-starting microphone after AI finished speaking (Voice mode)');
            this.startListening();
          }
        }, 1400); // Longer pause gives the user space to think before the mic opens
      }
    } catch (error) {
      this.isThinking.set(false); // Hide thinking indicator on error
      this.isSpeaking.set(false);
      console.error('Error getting AI response:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to get AI response';
      this.errorMessage.set(errorMsg);

      // Add error message to history
      this.conversationHistory.push({
        role: 'avatar',
        message: 'Sorry, I encountered an error. Please try again.'
      });
    }
  }

  async startListening(): Promise<void> {
    if (!this.speechSupported() || this.isListening()) {
      return;
    }

    // If AI is speaking, interrupt it first
    if (this.isSpeaking()) {
      console.log('🛑 User interrupting AI speech...');
      this.interruptAI();
      // Small delay to ensure audio is fully stopped before starting speech recognition
      await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 100ms for faster response
    }

    this.isListening.set(true);
    this.conversationState.set('user_speaking');
    this.isWaitingForUser.set(false);
    this.errorMessage.set(null);

    try {
      const transcript = await this.speechRecognitionService.startListening({
        maxTotalMs: this.MAX_LISTEN_DURATION_MS, // Flexible total cap with auto-extend while user speaks
        silenceMs: 2500 // Reset on speech so users aren't cut off mid-thought, but tighter pause
      });
      console.log('Speech recognized:', transcript);

      // Set listening to false before sending message (so sendMessage doesn't return early)
      this.isListening.set(false);

      // Automatically send the transcribed message
      await this.sendMessage(transcript);

      // Note: sendMessage will auto-start listening again after AI responds
    } catch (error) {
      console.error('Speech recognition error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to recognize speech';
      this.errorMessage.set(errorMsg);
      this.isListening.set(false);
    }
  }

  /**
   * Interrupt AI speech and stop all audio playback with state preservation
   */
  private interruptAI(): void {
    console.log('🛑 Interrupting AI...');

    // Stop all audio playback
    this.elevenLabsService.stopAll();

    // Stop typewriter effects
    this.typewriterIntervals.forEach(interval => clearInterval(interval));
    this.typewriterIntervals.clear();

    // Complete any partial typewriter messages (preserve what was said)
    this.conversationHistory.forEach(item => {
      if (item.role === 'avatar' && item.displayedMessage !== undefined) {
        item.displayedMessage = item.message; // Complete the message display
      }
    });

    // Reset speaking state but preserve conversation state
    this.isSpeaking.set(false);
    this.isThinking.set(false);
    this.conversationState.set('waiting_for_user');

    console.log('✅ AI interrupted - ready for user input');
  }

  stopListening(): void {
    if (this.isListening()) {
      this.speechRecognitionService.stopListening();
      this.isListening.set(false);
    }
  }

  async speakMessage(message: string, role: 'user' | 'avatar'): Promise<void> {
    if (role !== 'avatar') {
      return;
    }

    this.isSpeaking.set(true);
    this.errorMessage.set(null);

    try {
      await this.elevenLabsService.speakAndPlay(message);
    } catch (error) {
      console.error('Error speaking message:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to generate speech. Please check your API key permissions.';
      this.errorMessage.set(errorMsg);
    } finally {
      this.isSpeaking.set(false);
    }
  }

  closeConversation(): void {
    console.log('🛑 Closing conversation and stopping all activity...');

    // Stop speech recognition
    this.stopListening();
    this.speechRecognitionService.abort();

    // Stop all audio playback (TTS)
    this.elevenLabsService.stopAll();

    // Cancel all AI requests
    this.firestoreAIService.cancelAll();

    // Clear timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Reset all state
    this.isConversationActive.set(false);
    this.isSpeaking.set(false);
    this.isListening.set(false);
    this.isThinking.set(false);
    this.conversationState.set('idle');
    this.isWaitingForUser.set(false);
    this.conversationStartTime.set(null);
    this.shouldAskForEmail.set(false);
    this.isWaitingForEmail.set(false);
    this.isGeneratingPlan.set(false);

    // Clear all typewriter intervals
    this.typewriterIntervals.forEach(interval => clearInterval(interval));
    this.typewriterIntervals.clear();

    // Clear conversation data
    this.conversationHistory = [];
    this.userMessage = '';
    this.errorMessage.set(null);
    this.userEmail.set(null);

    console.log('✅ Conversation closed and all activity stopped');
  }

  // --- Launch Challenge Feature ---

  // Challenge State
  isChallengeActive = signal(false);
  currentChallengeStep = signal(0);
  isDashboardActive = signal(false);
  challengeAnswers = signal<Record<string, any>>({});
  challengeAuthStage = signal<ChallengeAuthStage>('email');
  challengeAuthError = signal<string | null>(null);
  challengeInfoMessage = signal<string | null>(null);
  challengeLoading = signal(false);
  challengeEmail = signal('');
  challengePassword = signal('');
  challengeFirstName = signal('');
  challengeLastName = signal('');
  challengeCustomGoalTitle = signal('');
  private lastStageBeforeSaving: ChallengeAuthStage = 'email';
  isSavingGoal = signal(false);
  // Final User Info
  userInfo = signal({
    name: '',
    email: '',
    password: ''
  });
  // Dashboard title customization
  dashboardTitle = signal<string>('MISSION CONTROL');
  isEditingTitle = signal(false);
  editingTitleValue = signal<string>('');
  // Avatar dropdown
  showAvatarDropdown = signal(false);
  userGoals = signal<any[]>([]);
  loadingGoals = signal(false);
  currentGoalId = signal<string | null>(null);

  private readonly goalThemeOptions = [
    { id: 'career', label: '💼 Career / Project' },
    { id: 'health', label: '🏋️‍♂️ Health / Fitness' },
    { id: 'learning', label: '📚 Learning / Skills' },
    { id: 'finance', label: '💰 Finance' },
    { id: 'mindset', label: '🧠 Mindset / Clarity' },
    { id: 'habit', label: '🔄 Habit / Discipline' },
    { id: 'growth', label: '🚀 Personal Growth' }
  ];

  private readonly goalTitleOptionsMap: Record<string, Array<{ id: string; label: string }>> = {
    health: [
      { id: 'health_energy_boost', label: '🔥 7-Day Energy Boost' },
      { id: 'health_stronger_me', label: '🏋️ Operation Stronger Me' },
      { id: 'health_reset', label: '✨ My Health Reset' },
      { id: 'health_fitness_push', label: '⚡ One Week Fitness Push' },
      { id: 'custom', label: '✏️ Custom name…' }
    ],
    career: [
      { id: 'career_project_momentum', label: '🚀 Project Momentum' },
      { id: 'career_upgrade', label: '📈 One Week Career Upgrade' },
      { id: 'career_focus', label: '🧭 Focus My Work Week' },
      { id: 'career_finish', label: '💼 Finish My Key Task' },
      { id: 'custom', label: '✏️ Custom name…' }
    ],
    learning: [
      { id: 'learning_skill_sprint', label: '📚 Skill Sprint' },
      { id: 'learning_brain_upgrade', label: '🧠 Quick Brain Upgrade' },
      { id: 'learning_project', label: '💡 7-Day Learning Project' },
      { id: 'learning_focus', label: '🎯 Focused Study Mission' },
      { id: 'custom', label: '✏️ Custom name…' }
    ],
    finance: [
      { id: 'finance_reset', label: '💰 7-Day Money Reset' },
      { id: 'finance_push', label: '📊 Focused Finance Push' },
      { id: 'finance_expense', label: '🔍 Expense Control Sprint' },
      { id: 'finance_invest', label: '💵 Build Wealth Week' },
      { id: 'custom', label: '✏️ Custom name…' }
    ],
    mindset: [
      { id: 'mindset_clarity', label: '🧠 Clarity Week' },
      { id: 'mindset_calming', label: '🌊 Calm & Clear Mission' },
      { id: 'mindset_focus', label: '🎯 Mental Focus Reset' },
      { id: 'mindset_refresh', label: '✨ Mindset Refresh' },
      { id: 'custom', label: '✏️ Custom name…' }
    ],
    habit: [
      { id: 'habit_builder', label: '🔄 Habit Builder Week' },
      { id: 'habit_discipline', label: '⚙️ Discipline Sprint' },
      { id: 'habit_launch', label: '🚦 Habit Launchpad' },
      { id: 'habit_consistency', label: '📆 Consistency Charge' },
      { id: 'custom', label: '✏️ Custom name…' }
    ],
    growth: [
      { id: 'growth_launch', label: '🚀 Personal Growth Launch' },
      { id: 'growth_reset', label: '✨ One Week Reset' },
      { id: 'growth_upgrade', label: '📈 Upgrade Myself Week' },
      { id: 'growth_focus', label: '🧭 Mission Focus' },
      { id: 'custom', label: '✏️ Custom name…' }
    ],
    default: [
      { id: 'goal_momentum', label: '🚀 Project Momentum' },
      { id: 'goal_reset', label: '✨ My Goal Reset' },
      { id: 'goal_focus', label: '🧭 Focus Sprint' },
      { id: 'goal_push', label: '⚡ One Week Push' },
      { id: 'custom', label: '✏️ Custom name…' }
    ]
  };

  private readonly objectiveOptions = [
    { id: 'momentum', label: 'Build momentum' },
    { id: 'finish', label: 'Finish something' },
    { id: 'habit', label: 'Create a new habit' },
    { id: 'consistency', label: 'Improve consistency' },
    { id: 'skill', label: 'Level up a skill' },
    { id: 'clear_mind', label: 'Clear mental space' },
    { id: 'healthier', label: 'Get healthier' },
    { id: 'reduce_stress', label: 'Reduce stress' }
  ];

  private readonly futureResultOptions = [
    { id: 'motivated', label: 'Motivated' },
    { id: 'proud', label: 'Proud' },
    { id: 'calm', label: 'Calm' },
    { id: 'confident', label: 'Confident' },
    { id: 'focused', label: 'Focused' }
  ];

  private readonly progressOptions = [
    { id: 'time', label: '⏱ Time spent' },
    { id: 'tasks', label: '✔ Tasks completed' },
    { id: 'energy', label: '🔋 Mood / energy' },
    { id: 'percentage', label: '📈 % Progress' },
    { id: 'habit', label: '🧘 Habit performed' },
    { id: 'reflection', label: '✍️ Small reflection' }
  ];

  private readonly supportOptions = [
    { id: 'morning', label: '🔔 Morning reminder' },
    { id: 'evening', label: '🌙 Evening reminder' },
    { id: 'motivational', label: '🔥 Motivational tone' },
    { id: 'celebration', label: '🎉 Celebration tone' },
    { id: 'accountability', label: '🤝 Accountability tone' },
    { id: 'calm', label: '😌 Calm supportive tone' }
  ];

  private readonly dashboardStyleOptions = [
    { id: 'minimal', label: 'Minimal + Clean' },
    { id: 'colorful', label: 'Colorful + Fun' },
    { id: 'dark', label: 'Dark Mode' },
    { id: 'gamified', label: 'Gamified (badges, levels)' }
  ];

  // Countdown State
  countdown = signal('23:59:59');
  private countdownInterval: any;

  startCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    // Set target time to 24 hours from now (or just a fixed countdown)
    let totalSeconds = 24 * 60 * 60; // 24 hours

    this.countdownInterval = setInterval(() => {
      totalSeconds--;
      if (totalSeconds < 0) totalSeconds = 24 * 60 * 60;

      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      this.countdown.set(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);
  }

  readonly challengeQuestions = [
    {
      id: 'goal_theme',
      type: 'single-select',
      title: 'QUESTION 1 — Choose Your Goal Theme (O)',
      subtitle: 'Which type of goal are you launching?',
      options: this.goalThemeOptions
    },
    {
      id: 'goal_title',
      type: 'single-select',
      title: 'QUESTION 2 — Auto-Generate Your Goal Title',
      subtitle: 'Pick a name for your goal (options auto-match your theme). Tap to choose or enter your own.',
      options: []
    },
    {
      id: 'objective',
      type: 'single-select',
      title: 'QUESTION 3 — Your ONE Objective (O)',
      subtitle: 'What is your specific objective for this goal?',
      options: this.objectiveOptions
    },
    {
      id: 'future_result',
      type: 'multi-select',
      maxSelect: 2,
      title: 'QUESTION 4 — Your Future Result (R)',
      subtitle: 'At the end of 7 days, you want to feel:',
      options: this.futureResultOptions
    },
    {
      id: 'progress',
      type: 'multi-select',
      maxSelect: 2,
      title: 'QUESTION 5 — Daily Progress Type (C + E)',
      subtitle: 'What will you track each day?',
      options: this.progressOptions
    },
    {
      id: 'daily_effort',
      type: 'single-select',
      title: 'QUESTION 6 — Daily Effort Level (E)',
      subtitle: 'How much time will you commit each day?',
      options: [
        { id: '5min', label: '5 minutes' },
        { id: '10min', label: '10 minutes' },
        { id: '20min', label: '20 minutes' },
        { id: '30min', label: '30 minutes' },
        { id: '1hour', label: '1 hour' }
      ]
    },
    {
      id: 'support',
      type: 'single-select',
      title: 'QUESTION 7 — Motivational Support (K + T)',
      subtitle: 'How should we support you during the 7 days?',
      options: this.supportOptions
    },
    {
      id: 'dashboard_style',
      type: 'single-select',
      title: 'QUESTION 8 — Dashboard Style (Final Setup)',
      subtitle: 'Choose your dashboard style:',
      options: this.dashboardStyleOptions
    }
  ];

  goalTitleOptions() {
    const theme = this.challengeAnswers()['goal_theme'] as keyof typeof this.goalTitleOptionsMap | undefined;
    return this.goalTitleOptionsMap[theme || 'default'] || this.goalTitleOptionsMap['default'];
  }

  isGoalTitleCustomSelected() {
    return this.challengeAnswers()['goal_title'] === 'custom';
  }

  updateCustomGoalTitle(value: string) {
    this.challengeCustomGoalTitle.set(value);
  }

  getGoalTitleDisplay() {
    const selection = this.challengeAnswers()['goal_title'];
    if (!selection) {
      return '';
    }
    if (selection === 'custom') {
      return this.challengeCustomGoalTitle().trim();
    }
    return this.getGoalTitleLabel(selection) || '';
  }

  getGoalThemeDisplay() {
    const theme = this.challengeAnswers()['goal_theme'];
    const option = this.goalThemeOptions.find(opt => opt.id === theme);
    return option?.label || 'Personal Growth Mission';
  }

  getSupportDisplay() {
    const support = this.challengeAnswers()['support'];
    const option = this.supportOptions.find(opt => opt.id === support);
    return option?.label || '🔥 Motivational tone';
  }

  shouldShowConfirmButton(questionId: string, type: string) {
    if (type === 'multi-select') {
      return true;
    }
    return questionId === 'goal_title' && this.isGoalTitleCustomSelected();
  }

  canConfirmQuestion(questionId: string) {
    if (questionId === 'goal_title' && this.isGoalTitleCustomSelected()) {
      return this.challengeCustomGoalTitle().trim().length > 0;
    }
    return true;
  }

  private getGoalTitleLabel(optionId: string) {
    for (const options of Object.values(this.goalTitleOptionsMap)) {
      const match = options.find(opt => opt.id === optionId && opt.id !== 'custom');
      if (match) {
        return match.label;
      }
    }
    return undefined;
  }

  startChallenge() {
    // Navigate to AI page with 7-day challenge flag
    this.router.navigate(['/ai'], {
      queryParams: { sevenDayChallenge: 'true' }
    });
  }

  async startChallengeWithGoal(goalId: string) {
    try {
      // Load the goal data
      const goal = await this.rocketGoalsService.getRocketGoalById(goalId);
      if (!goal) {
        console.error('Goal not found:', goalId);
        return;
      }

      // Map goal answers to challenge answers
      const preFilledAnswers: Record<string, any> = {};

      // Map the goal's answers to challenge format
      if (goal.answers) {
        // Copy relevant answer fields
        if (goal.answers['goal_theme']) preFilledAnswers['goal_theme'] = goal.answers['goal_theme'];
        if (goal.answers['goal_title']) preFilledAnswers['goal_title'] = goal.answers['goal_title'];
        if (goal.answers['custom_goal_title']) {
          preFilledAnswers['goal_title'] = 'custom';
          preFilledAnswers['custom_goal_title'] = goal.answers['custom_goal_title'];
        }
        if (goal.answers['daily_effort']) preFilledAnswers['daily_effort'] = goal.answers['daily_effort'];
        if (goal.answers['support']) preFilledAnswers['support'] = goal.answers['support'];
        if (goal.answers['future_result']) preFilledAnswers['future_result'] = goal.answers['future_result'];
        // Copy any other relevant fields
        Object.keys(goal.answers).forEach(key => {
          if (!preFilledAnswers[key] && key !== 'goal_title_label' && key !== 'goal_theme_label' && key !== 'goal_support_label') {
            preFilledAnswers[key] = goal.answers[key];
          }
        });
      }

      // Store the goal ID for updating later
      preFilledAnswers['_editingGoalId'] = goalId;

      // Start challenge with pre-filled answers
      this.isChallengeActive.set(true);
      this.currentChallengeStep.set(0);
      this.challengeAnswers.set(preFilledAnswers);
      this.isDashboardActive.set(false);
      this.resetChallengeAuthFlow();
      this.userInfo.set({ name: '', email: '', password: '' });
      document.body.style.overflow = 'hidden';
    } catch (error) {
      console.error('Error loading goal for editing:', error);
    }
  }

  closeChallenge() {
    this.isChallengeActive.set(false);
    this.resetChallengeAuthFlow();
    document.body.style.overflow = '';
  }

  selectOption(questionId: string, optionId: string, type: string, maxSelect?: number) {
    const currentAnswers = { ...this.challengeAnswers() };

    if (type === 'single-select') {
      currentAnswers[questionId] = optionId;
      if (questionId === 'goal_theme') {
        delete currentAnswers['goal_title'];
        this.challengeCustomGoalTitle.set('');
      }
      if (questionId === 'goal_title' && optionId !== 'custom') {
        this.challengeCustomGoalTitle.set('');
      }
    } else {
      // Multi-select
      const currentSelection = (currentAnswers[questionId] as string[]) || [];

      if (currentSelection.includes(optionId)) {
        // Deselect
        currentAnswers[questionId] = currentSelection.filter(id => id !== optionId);
      } else {
        // Select if under max
        if (!maxSelect || currentSelection.length < maxSelect) {
          currentAnswers[questionId] = [...currentSelection, optionId];
        }
      }
    }

    this.challengeAnswers.set(currentAnswers);

    // Auto-advance for single select after a short delay
    if (type === 'single-select') {
      if (questionId === 'goal_title' && optionId === 'custom') {
        return;
      }
      setTimeout(() => {
        this.nextStep();
      }, 400);
    }
  }

  isOptionSelected(questionId: string, optionId: string): boolean {
    const answer = this.challengeAnswers()[questionId];
    if (Array.isArray(answer)) {
      return answer.includes(optionId);
    }
    return answer === optionId;
  }

  nextStep() {
    // Validate current step
    const currentQ = this.challengeQuestions[this.currentChallengeStep()];
    if (currentQ) {
      const answer = this.challengeAnswers()[currentQ.id];
      if (!answer || (Array.isArray(answer) && answer.length === 0)) {
        return; // Cannot proceed without answer
      }
      if (currentQ.id === 'goal_title' && answer === 'custom' && !this.challengeCustomGoalTitle().trim()) {
        return;
      }
    }

    const currentStep = this.currentChallengeStep();
    if (currentStep < this.challengeQuestions.length - 1) {
      // Move to next question
      this.currentChallengeStep.update(v => v + 1);
    } else {
      // We're on the last question, moving to completion
      this.currentChallengeStep.update(v => v + 1);

      // Check if user is logged in - if so, skip auth and save directly
      const profile = this.authService.profile();
      if (profile?.userId) {
        // User is already logged in, skip auth and save directly
        setTimeout(() => {
          this.completeChallengeAndSaveGoal();
        }, 100);
      }
      // If not logged in, the auth stage will be shown in the template
    }
  }

  prevStep() {
    if (this.currentChallengeStep() > 0) {
      this.currentChallengeStep.update(v => v - 1);
    }
  }

  updateChallengeEmail(value: string) {
    this.challengeEmail.set(value);
  }

  updateChallengePassword(value: string) {
    this.challengePassword.set(value);
  }

  updateChallengeFirstName(value: string) {
    this.challengeFirstName.set(value);
  }

  updateChallengeLastName(value: string) {
    this.challengeLastName.set(value);
  }

  async handleChallengeEmailContinue() {
    const email = this.challengeEmail()
      .trim()
      .toLowerCase();
    if (!this.isValidEmail(email)) {
      this.challengeAuthError.set('Enter a valid email to continue.');
      return;
    }

    this.challengeAuthError.set(null);
    this.challengeLoading.set(true);
    try {
      const exists = await this.authService.emailExists(email);
      this.challengeEmail.set(email);
      this.challengePassword.set('');
      this.challengeFirstName.set('');
      this.challengeLastName.set('');
      if (exists) {
        this.challengeAuthStage.set('existing-login');
        this.challengeInfoMessage.set('Welcome back! Enter your password to resume your mission.');
      } else {
        this.challengeAuthStage.set('new-profile');
        this.challengeInfoMessage.set('Create your RocketGoals profile to generate your dashboard.');
      }
    } catch (error) {
      console.error('Email lookup failed', error);
      this.challengeAuthError.set('Unable to check this email right now. Please try again.');
    } finally {
      this.challengeLoading.set(false);
    }
  }

  async handleChallengeExistingLogin() {
    const email = this.challengeEmail();
    const password = this.challengePassword();
    if (!password.trim()) {
      this.challengeAuthError.set('Enter your password to continue.');
      return;
    }

    this.challengeAuthError.set(null);
    this.challengeLoading.set(true);
    try {
      await this.authService.signInWithEmail(email, password);
      await this.completeChallengeAndSaveGoal();
    } catch (error) {
      console.error('Challenge login failed', error);
      this.challengeAuthError.set(this.authService.authError() || 'Invalid credentials. Try again.');
    } finally {
      this.challengeLoading.set(false);
    }
  }

  async handleChallengeSignup() {
    const email = this.challengeEmail();
    const firstName = this.challengeFirstName().trim();
    const lastName = this.challengeLastName().trim();
    const password = this.challengePassword().trim();

    if (!firstName || !lastName || password.length < 6) {
      this.challengeAuthError.set('Add your full name and a 6+ character password.');
      return;
    }

    this.challengeAuthError.set(null);
    this.challengeLoading.set(true);
    try {
      await this.authService.signUpWithEmail({ firstName, lastName, email, password });
      await this.authService.sendEmailVerification().catch(error => {
        console.warn('Verification email could not be sent immediately', error);
      });
      this.challengeAuthStage.set('verify');
      this.challengeInfoMessage.set(`Verification email sent to ${email}. Confirm it to continue.`);
    } catch (error) {
      console.error('Challenge signup failed', error);
      this.challengeAuthError.set(this.authService.authError() || 'Unable to create your account. Please try again.');
    } finally {
      this.challengeLoading.set(false);
    }
  }

  async confirmChallengeVerification() {
    this.challengeAuthError.set(null);
    this.challengeLoading.set(true);
    try {
      const user = await this.authService.reloadCurrentUser();
      if (user?.emailVerified) {
        await this.completeChallengeAndSaveGoal();
      } else {
        this.challengeAuthError.set('We have not detected the verification yet. Refresh your inbox and retry.');
      }
    } catch (error) {
      console.error('Verification check failed', error);
      this.challengeAuthError.set('Unable to verify your account at the moment. Please retry.');
    } finally {
      this.challengeLoading.set(false);
    }
  }

  async resendVerificationEmail() {
    this.challengeAuthError.set(null);
    try {
      await this.authService.sendEmailVerification();
      this.challengeInfoMessage.set(`Verification email re-sent to ${this.challengeEmail()}.`);
    } catch (error) {
      console.error('Resend verification failed', error);
      this.challengeAuthError.set('Unable to send another verification email right now.');
    }
  }

  restartChallengeAuthFlow() {
    this.resetChallengeAuthFlow();
  }

  closeDashboard() {
    this.isDashboardActive.set(false);
    document.body.style.overflow = '';
  }

  startEditingTitle() {
    this.editingTitleValue.set(this.dashboardTitle());
    this.isEditingTitle.set(true);
    // Focus the input after Angular updates the view
    setTimeout(() => {
      const input = document.querySelector('input[type="text"][ngModel]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  saveTitle() {
    const newTitle = this.editingTitleValue().trim() || 'MISSION CONTROL';
    this.dashboardTitle.set(newTitle);
    localStorage.setItem('dashboardTitle', newTitle);
    this.isEditingTitle.set(false);
  }

  cancelEditingTitle() {
    this.isEditingTitle.set(false);
    this.editingTitleValue.set('');
  }

  toggleAvatarDropdown() {
    this.showAvatarDropdown.set(!this.showAvatarDropdown());
    // Load goals when opening dropdown
    if (this.showAvatarDropdown() && this.userGoals().length === 0) {
      this.loadUserGoals();
    }
  }

  closeAvatarDropdown() {
    this.showAvatarDropdown.set(false);
  }

  async loadUserGoals() {
    const profile = this.authService.profile();
    if (!profile?.userId) return;

    this.loadingGoals.set(true);
    try {
      const goals = await this.rocketGoalsService.getRocketGoalsByUserId(profile.userId);
      this.userGoals.set(goals);
    } catch (err) {
      console.error('Error loading user goals:', err);
    } finally {
      this.loadingGoals.set(false);
    }
  }

  navigateToGoal(goalId: string) {
    this.router.navigateByUrl(`/rocketgoal/${goalId}`);
    this.closeAvatarDropdown();
  }

  navigateToProfile() {
    this.router.navigateByUrl('/profile');
    this.closeAvatarDropdown();
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      const fallback = img.nextElementSibling as HTMLElement;
      if (fallback) {
        fallback.style.display = 'flex';
      }
    }
  }

  async handleLogout() {
    try {
      await this.authService.signOut();
      this.router.navigateByUrl('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }


  private resetChallengeAuthFlow() {
    this.challengeAuthStage.set('email');
    this.challengeAuthError.set(null);
    this.challengeInfoMessage.set(null);
    this.challengeLoading.set(false);
    this.challengeEmail.set('');
    this.challengePassword.set('');
    this.challengeFirstName.set('');
    this.challengeLastName.set('');
    this.challengeCustomGoalTitle.set('');
    this.lastStageBeforeSaving = 'email';
    this.isSavingGoal.set(false);
  }

  private async completeChallengeAndSaveGoal() {
    const profile = this.authService.profile();
    if (!profile) {
      this.challengeAuthError.set('We need your profile before generating the dashboard.');
      return;
    }
    const previousStage = this.challengeAuthStage();
    this.lastStageBeforeSaving = previousStage;
    this.challengeAuthStage.set('saving');
    this.challengeAuthError.set(null);
    this.isSavingGoal.set(true);

    try {
      const challengeAnswers = this.challengeAnswers();
      const editingGoalId = challengeAnswers['_editingGoalId'] as string | undefined;

      const answers: Record<string, any> = {
        ...challengeAnswers,
        goal_title_label: this.getGoalTitleDisplay(),
        goal_theme_label: this.getGoalThemeDisplay(),
        goal_support_label: this.getSupportDisplay(),
        custom_goal_title: this.challengeCustomGoalTitle()
      };

      // Remove the editing flag from answers
      delete answers['_editingGoalId'];

      const participant = {
        firstName: profile.firstName || 'Rocketeer',
        lastName: profile.lastName || '',
        email: profile.email || this.challengeEmail()
      };

      let goalId: string;

      if (editingGoalId) {
        // Update existing goal (don't reset startTime)
        await this.rocketGoalsService.updateRocketGoal(editingGoalId, {
          primaryGoal: this.extractPrimaryGoal(answers),
          answers
        });
        goalId = editingGoalId;
      } else {
        // Create new goal with startTime set to now
        goalId = await this.rocketGoalsService.createRocketGoal({
          userId: profile.userId,
          participant,
          primaryGoal: this.extractPrimaryGoal(answers),
          answers,
          status: 'active',
          entryPoint: 'launch_challenge',
          startTime: Date.now() // Set start time when goal is created
        });
      }

      const participantName = `${participant.firstName} ${participant.lastName}`.trim() || participant.firstName;
      this.userInfo.set({
        name: participantName,
        email: participant.email,
        password: ''
      });
      this.isChallengeActive.set(false);
      document.body.style.overflow = '';
      // Redirect to goals list (home page) with refresh param to trigger reload
      await this.router.navigateByUrl('/goals?refresh=true');
    } catch (error) {
      console.error('Failed to save RocketGoal', error);
      this.challengeAuthError.set('We could not save your RocketGoal. Please try again.');
      this.challengeAuthStage.set(this.lastStageBeforeSaving);
    } finally {
      this.isSavingGoal.set(false);
    }
  }

  private extractPrimaryGoal(answers: Record<string, any>) {
    const label = typeof answers['goal_title_label'] === 'string' ? answers['goal_title_label'].trim() : '';
    if (label) {
      return label;
    }
    const custom = typeof answers['custom_goal_title'] === 'string' ? answers['custom_goal_title'].trim() : '';
    if (custom) {
      return custom;
    }
    const selection =
      typeof answers['goal_title'] === 'string' ? this.getGoalTitleLabel(answers['goal_title']) : '';
    if (selection) {
      return selection;
    }
    const theme =
      typeof answers['goal_theme_label'] === 'string' ? answers['goal_theme_label'].trim() : '';
    if (theme) {
      return theme;
    }
    return 'Rocket Goal';
  }

  /**
   * Start typewriter effect for a message
   */
  private startTypewriter(index: number, fullText: string): void {
    // Clear any existing interval for this index
    if (this.typewriterIntervals.has(index)) {
      clearInterval(this.typewriterIntervals.get(index));
    }

    const displayedLength = this.conversationHistory[index]?.displayedMessage?.length || 0;
    let currentLength = displayedLength;

    const interval = setInterval(() => {
      if (currentLength < fullText.length) {
        currentLength++;
        // Update displayed message
        if (this.conversationHistory[index]) {
          this.conversationHistory[index].displayedMessage = fullText.substring(0, currentLength);
          // Trigger change detection by creating new array reference
          this.conversationHistory = [...this.conversationHistory];
        }
      } else {
        // Typewriter complete
        clearInterval(interval);
        this.typewriterIntervals.delete(index);
      }
    }, this.typewriterSpeed);

    this.typewriterIntervals.set(index, interval);
  }

  /**
   * Continue typewriter effect with new text
   */
  private continueTypewriter(index: number, fullText: string): void {
    // If typewriter is already running, restart with faster speed to catch up
    if (this.typewriterIntervals.has(index)) {
      // Clear existing and restart with catch-up speed
      clearInterval(this.typewriterIntervals.get(index));
      this.typewriterIntervals.delete(index);
    }

    // Start with catch-up speed if there's a gap, otherwise normal speed
    const currentDisplayed = this.conversationHistory[index]?.displayedMessage?.length || 0;
    const gap = fullText.length - currentDisplayed;

    if (gap > 20) {
      // Large gap - use catch-up speed
      this.startTypewriterWithSpeed(index, fullText, this.typewriterCatchUpSpeed);
    } else {
      // Small gap - use normal speed
      this.startTypewriter(index, fullText);
    }
  }

  /**
   * Start typewriter with custom speed
   */
  private startTypewriterWithSpeed(index: number, fullText: string, speed: number): void {
    // Clear any existing interval for this index
    if (this.typewriterIntervals.has(index)) {
      clearInterval(this.typewriterIntervals.get(index));
    }

    const displayedLength = this.conversationHistory[index]?.displayedMessage?.length || 0;
    let currentLength = displayedLength;

    const interval = setInterval(() => {
      if (currentLength < fullText.length) {
        currentLength++;
        // Update displayed message
        if (this.conversationHistory[index]) {
          this.conversationHistory[index].displayedMessage = fullText.substring(0, currentLength);
          // Trigger change detection by creating new array reference
          this.conversationHistory = [...this.conversationHistory];
        }
      } else {
        // Typewriter complete
        clearInterval(interval);
        this.typewriterIntervals.delete(index);
      }
    }, speed);

    this.typewriterIntervals.set(index, interval);
  }

  /**
   * Complete typewriter effect immediately
   */
  private completeTypewriter(index: number, fullText: string): void {
    // Clear interval and set to full text
    if (this.typewriterIntervals.has(index)) {
      clearInterval(this.typewriterIntervals.get(index));
      this.typewriterIntervals.delete(index);
    }

    if (this.conversationHistory[index]) {
      this.conversationHistory[index].displayedMessage = fullText;
      this.conversationHistory = [...this.conversationHistory];
    }
  }

  copyConversation(): void {
    if (this.conversationHistory.length === 0) {
      return;
    }

    const conversationText = this.conversationHistory
      .map(item => {
        const role = item.role === 'user' ? 'You' : "Jim's Avatar";
        let message = item.role === 'avatar'
          ? item.message
          : item.message;

        // Convert HTML line breaks to actual newlines first
        message = message.replace(/<br\s*\/?>/gi, '\n');

        // Strip HTML tags but preserve line breaks
        message = message.replace(/<[^>]*>/g, '');

        // Clean up markdown asterisks and weird punctuation, but preserve spacing and line breaks
        message = message
          .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown (**text** -> text)
          .replace(/\*(.*?)\*/g, '$1') // Remove italic markdown (*text* -> text)
          .replace(/`(.*?)`/g, '$1') // Remove inline code
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove markdown links but keep text
          .replace(/[•·▪▫‣⁃]/g, '-') // Replace weird bullet points with dash
          .replace(/[—–]/g, '-') // Replace em/en dashes with regular dash
          .replace(/[""]/g, '"') // Replace smart quotes with regular quotes
          .replace(/['']/g, "'"); // Replace smart apostrophes with regular apostrophe
        // Note: We intentionally DON'T normalize whitespace to preserve line breaks and spacing

        return `${role}: ${message}`;
      })
      .join('\n\n');

    navigator.clipboard.writeText(conversationText).then(() => {
      // Show a brief success message (temporarily use errorMessage for display)
      const originalError = this.errorMessage();
      this.errorMessage.set('✓ Conversation copied to clipboard!');
      setTimeout(() => {
        // Only restore if there was an original error, otherwise clear
        this.errorMessage.set(originalError || null);
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      this.errorMessage.set('Failed to copy conversation. Please try again.');
    });
  }

  /**
   * Convert image to base64 data URL for PDF embedding
   */
  private async imageToBase64(imagePath: string): Promise<string> {
    try {
      const response = await fetch(imagePath);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      return ''; // Return empty string if conversion fails
    }
  }

  /**
   * Convert markdown to HTML for PDF rendering
   */
  private markdownToHtml(markdown: string): string {
    if (!markdown) return '';

    // Split into lines for better processing
    const lines = markdown.split('\n');
    let html = '';
    let inList = false;
    let listType = 'ul';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Headers
      if (line.startsWith('### ')) {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
        html += `<h3>${line.substring(4)}</h3>`;
        continue;
      }
      if (line.startsWith('## ')) {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
        html += `<h2>${line.substring(3)}</h2>`;
        continue;
      }
      if (line.startsWith('# ')) {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
        html += `<h1>${line.substring(2)}</h1>`;
        continue;
      }

      // Lists
      const bulletMatch = line.match(/^[\*\-] (.+)$/);
      const numberMatch = line.match(/^\d+\. (.+)$/);

      if (bulletMatch || numberMatch) {
        const newListType = bulletMatch ? 'ul' : 'ol';
        const content = bulletMatch ? bulletMatch[1] : numberMatch![1];

        if (!inList || listType !== newListType) {
          if (inList) {
            html += `</${listType}>`;
          }
          html += `<${newListType}>`;
          inList = true;
          listType = newListType;
        }

        // Process inline formatting
        let processedContent = content
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');

        html += `<li>${processedContent}</li>`;
        continue;
      }

      // End list if we hit a non-list line
      if (inList && line !== '') {
        html += `</${listType}>`;
        inList = false;
      }

      // Regular paragraph
      if (line !== '') {
        let processedLine = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Check if it's already a paragraph or header
        if (!processedLine.startsWith('<')) {
          html += `<p>${processedLine}</p>`;
        } else {
          html += processedLine;
        }
      } else if (!inList) {
        // Empty line - add spacing
        html += '<br>';
      }
    }

    // Close any open list
    if (inList) {
      html += `</${listType}>`;
    }

    return html;
  }

  /**
   * Check if a message is the generated plan (has markdown headers)
   */
  private isPlanMessage(message: string): boolean {
    // Check if message contains markdown headers (## or ###)
    return /^##?\s/.test(message) || message.includes('EXECUTIVE SUMMARY') || message.includes('KEY INSIGHTS') || message.includes('ACTIONABLE STEPS');
  }

  async downloadConversationAsPDF(): Promise<void> {
    if (this.conversationHistory.length === 0) {
      return;
    }

    // Convert logo to base64
    const logoBase64 = await this.imageToBase64('/assets/rocket-goals.png');
    const logoImg = logoBase64 ? `<img src="${logoBase64}" alt="RocketGoals" style="height: 60px; width: auto;" />` : '<div style="font-size: 24px; font-weight: bold; color: #dc2626;">RocketGoals</div>';

    // Extract only the plan messages
    const planMessages: Array<string> = [];

    for (const item of this.conversationHistory) {
      if (item.role === 'avatar' && this.isPlanMessage(item.message)) {
        planMessages.push(item.message);
      }
    }

    // If no plan messages found, show a message
    if (planMessages.length === 0) {
      console.warn('No plan messages found in conversation history');
      return;
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<title>RocketGoals Launch Plan</title>
<meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Latin+Modern+Roman:wght@400;700&display=swap');
:root {
  --accent: #dc2626;
  --ink: #0f172a;
  --muted: #4b5563;
  --border: #e5e7eb;
  --soft: #f8fafc;
}
@page {
  margin: 0.75in;
  size: letter;
}
body {
  font-family: 'Latin Modern Roman', 'Computer Modern Serif', 'STIX Two Text', Georgia, 'Times New Roman', Times, serif;
  line-height: 1.8;
  color: var(--ink);
  max-width: 850px;
  margin: 0 auto;
  padding: 20px;
  background: var(--soft);
}
.sheet {
  background: #ffffff;
  border: none;
  border-radius: 18px;
  box-shadow: 0 22px 55px rgba(15, 23, 42, 0.06);
  padding: 32px;
}
.header {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 28px;
  padding-bottom: 12px;
  border-bottom: none;
  page-break-after: avoid;
}
.header h1 {
  color: var(--accent);
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -0.5px;
  margin: 0 0 6px 0;
}
.header .subtitle {
  color: var(--muted);
  font-size: 15px;
  margin: 0;
}
.timestamp {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 6px;
}
.tagline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(220, 38, 38, 0.06);
  color: var(--accent);
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.4px;
}
.plan-section {
  page-break-before: avoid;
}
.card {
  background: #ffffff;
  border: none;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 18px;
}
.plan-content h1 {
  color: var(--ink);
  font-size: 26px;
  font-weight: 800;
  margin: 0 0 16px 0;
  padding-bottom: 4px;
}
.plan-content h2 {
  color: var(--ink);
  font-size: 20px;
  font-weight: 800;
  margin: 24px 0 12px 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.plan-content h2::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.12);
}
.plan-content h3 {
  color: var(--ink);
  font-size: 17px;
  font-weight: 700;
  margin: 16px 0 10px 0;
}
.plan-content p {
  margin: 12px 0;
  color: var(--muted);
}
.plan-content ul, .plan-content ol {
  margin: 12px 0;
  padding-left: 22px;
  color: var(--ink);
}
.plan-content li {
  margin: 8px 0;
  line-height: 1.6;
}
.plan-content strong {
  color: var(--accent);
  font-weight: 800;
}
.separator {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(15, 23, 42, 0.2), transparent);
  margin: 28px 0;
  page-break-inside: avoid;
}
.footer-note {
  margin-top: 10px;
  font-size: 12px;
  color: #9ca3af;
  text-align: right;
}
@media print {
  body {
    background: white;
    padding: 0.75in;
  }
  .sheet {
    box-shadow: none;
    border: none;
    padding: 0;
  }
  .header {
    page-break-after: avoid;
  }
  .plan-section {
    page-break-before: avoid;
    page-break-inside: avoid;
  }
}
</style>
</head>
<body>
<div class="sheet">
  <div class="header">
    ${logoImg}
    <div class="header-content" style="margin-left: 12px;">
      <div class="tagline">Launch Plan</div>
      <h1>RocketGoals Launch Plan</h1>
      <div class="subtitle">Your Personalized Goal Achievement Roadmap</div>
      <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
    </div>
  </div>

  ${planMessages.length > 0 ? `
  <div class="plan-section">
    <div class="card">
      <div class="plan-content">
        ${planMessages.map(plan => this.markdownToHtml(plan)).join('<div class="separator"></div>')}
      </div>
    </div>
    <div class="footer-note">Prepared for you by RocketGoals</div>
  </div>
  ` : ''}
</div>
</body>
</html>`;

    // Create a hidden iframe and trigger print to generate PDF
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';

    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      // Wait for content to load, then trigger print
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.print();
          // Remove iframe after a delay
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }, 500); // Increased delay to ensure images load
      };
    } else {
      // Fallback: open in new window
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }
  }

  /**
   * Format message for display (convert markdown to HTML)
   * This is a simple formatter - you might want to use a proper markdown library
   */
  formatMessage(message: string): string {
    if (!message) return message;

    // Simple markdown to HTML conversion for display
    let formatted = message
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Line breaks
      .replace(/\n/g, '<br>');

    return formatted;
  }
}
