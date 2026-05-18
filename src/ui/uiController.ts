import { ActionResult } from '../actions/actions';
import type { GlowSettings } from '../render/worldRenderer';
import { AvatarState, BlockShape, BLOCK_DEFINITIONS, CameraMode, PersonalityWeights, WORLD_RULES } from '../world/types';
import { WorldState } from '../world/worldState';

type UICallbacks = {
  onCreateAvatar: (options: { name: string; color: string; personality: PersonalityWeights }) => void;
  onCameraModeChange: (mode: CameraMode) => void;
};

const SHAPES: BlockShape[] = ['cube', 'half_cube', 'ramp', 'tile', 'pillar', 'tesla_node'];
const COLORS = ['#00ff88', '#44f2ff', '#2f7dff', '#00d4c8', '#9b7cff', '#d34dff'];

export class UIController {
  readonly root: HTMLElement;
  cameraMode: CameraMode = 'third_person';
  buildOpen = false;
  selectedShape: BlockShape = 'cube';
  selectedColor = COLORS[0];
  rotation: 0 | 90 | 180 | 270 = 0;
  orbitHorizontalInverted = false;
  orbitVerticalInverted = false;
  avatarWalkSpeed: number = WORLD_RULES.avatarWalkSpeed;
  freeCameraSpeed = 10;
  sceneBloom = 22;
  teslaGlow = 42;
  teslaHalo = 42;
  reactorGlow = 44;
  reactorBloom = 54;
  eyeGlow = 36;
  eyeBloom = 36;
  teslaContribution = 0;
  transferCap = 0;

  private readonly shapeButtons = new Map<BlockShape, HTMLButtonElement>();
  private readonly modeButtons = new Map<CameraMode, HTMLButtonElement>();
  private readonly buildPanel: HTMLElement;
  private readonly energyFill: HTMLElement;
  private readonly energyValue: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly fieldLine: HTMLElement;
  private readonly contextLine: HTMLElement;
  private readonly personalityLine: HTMLElement;
  private readonly povReactorReflection: HTMLElement;
  private readonly freeSpeedWrap: HTMLElement;
  private readonly contributionInput: HTMLInputElement;
  private readonly transferInput: HTMLInputElement;

  constructor(private readonly callbacks: UICallbacks) {
    const app = document.querySelector<HTMLDivElement>('#app');
    if (!app) {
      throw new Error('Missing #app root.');
    }

    this.root = document.createElement('div');
    this.root.className = 'ui-root';
    app.appendChild(this.root);

    this.root.innerHTML = `
      <div class="world-vignette"></div>
      <div class="pov-reactor-reflection" data-pov-reactor-reflection></div>
      <div class="crosshair"></div>
      <section class="avatar-create" data-create-panel>
        <div class="create-shell">
          <p class="eyebrow">Tron World MVP</p>
          <h1>Create Avatar</h1>
          <div class="field-row">
            <label for="avatarName">Name</label>
            <input id="avatarName" value="Grid Runner" maxlength="24" />
          </div>
          <div class="field-row">
            <label>Color</label>
            <div class="swatches" data-create-colors></div>
          </div>
          <div class="personality-grid" data-personality></div>
          <button class="primary-action" data-create-button>Enter World</button>
        </div>
      </section>
      <section class="hud">
        <div class="hud-main">
          <div class="meter">
            <div class="meter-label">
              <span>Energy</span>
              <span data-energy-value>--</span>
            </div>
            <div class="meter-track"><div class="meter-fill" data-energy-fill></div></div>
          </div>
          <div class="mode-strip">
            <button data-mode="third_person">Third</button>
            <button data-mode="avatar_pov">POV</button>
            <button data-mode="free_camera">Free</button>
          </div>
          <div class="orbit-controls" data-orbit-controls>
            <button class="orbit-toggle" data-orbit-horizontal-toggle>L/R normal</button>
            <button class="orbit-toggle" data-orbit-vertical-toggle>U/D normal</button>
          </div>
          <div class="avatar-speed">
            <label for="avatarSpeed">Move speed</label>
            <input id="avatarSpeed" type="range" min="1.8" max="7.5" step="0.1" value="${WORLD_RULES.avatarWalkSpeed}" />
            <span data-avatar-speed-value>${WORLD_RULES.avatarWalkSpeed.toFixed(1)}</span>
          </div>
          <div class="free-speed" data-free-speed-wrap>
            <label for="freeSpeed">Free speed</label>
            <input id="freeSpeed" type="range" min="3" max="28" step="1" value="10" />
            <span data-free-speed-value>10</span>
          </div>
          <div class="glow-control">
            <label for="glowLevel">Tesla Bloom</label>
            <input id="glowLevel" type="range" min="0" max="100" step="1" value="22" />
            <span data-glow-value>22</span>
          </div>
        </div>
        <div class="glow-grid">
          <label>
            <span>Tesla Glow</span>
            <input id="teslaGlow" type="range" min="0" max="100" step="1" value="42" />
            <strong data-tesla-glow-value>42</strong>
          </label>
          <label>
            <span>Tesla Halo</span>
            <input id="teslaHalo" type="range" min="0" max="100" step="1" value="42" />
            <strong data-tesla-halo-value>42</strong>
          </label>
          <label>
            <span>Reactor Glow</span>
            <input id="reactorGlow" type="range" min="0" max="100" step="1" value="44" />
            <strong data-reactor-glow-value>44</strong>
          </label>
          <label>
            <span>Reactor Bloom</span>
            <input id="reactorBloom" type="range" min="0" max="100" step="1" value="54" />
            <strong data-reactor-bloom-value>54</strong>
          </label>
          <label>
            <span>Eyes Glow</span>
            <input id="eyeGlow" type="range" min="0" max="100" step="1" value="36" />
            <strong data-eye-glow-value>36</strong>
          </label>
          <label>
            <span>Eyes Bloom</span>
            <input id="eyeBloom" type="range" min="0" max="100" step="1" value="36" />
            <strong data-eye-bloom-value>36</strong>
          </label>
        </div>
        <div class="hud-lines">
          <span data-field-line>Field: --</span>
          <span data-personality-line>Personality: --</span>
        </div>
      </section>
      <section class="build-panel" data-build-panel>
        <div class="panel-header">
          <span>Build</span>
          <button data-rotate>Rotate 0°</button>
        </div>
        <div class="shape-grid" data-shapes></div>
        <div class="panel-subrow">
          <span>Color</span>
          <div class="swatches" data-build-colors></div>
        </div>
        <div class="tesla-row" data-tesla-row>
          <label for="teslaContribution">Tesla contribution</label>
          <input id="teslaContribution" type="number" min="0" max="100" step="1" placeholder="Amount" />
        </div>
        <div class="tesla-row">
          <label for="transferCap">Transfer cap</label>
          <input id="transferCap" type="number" min="0" max="100" step="1" placeholder="Amount" />
        </div>
      </section>
      <details class="keybind-panel">
        <summary>Bindings</summary>
        <div class="bind-row"><span>Forward</span><button disabled>W</button></div>
        <div class="bind-row"><span>Back</span><button disabled>S</button></div>
        <div class="bind-row"><span>Turn left</span><button disabled>A</button></div>
        <div class="bind-row"><span>Turn right</span><button disabled>D</button></div>
        <div class="bind-row"><span>Jump</span><button disabled>Space</button></div>
        <div class="bind-row"><span>Build</span><button disabled>1</button></div>
        <div class="bind-row"><span>Interact</span><button disabled>E</button></div>
        <div class="bind-row"><span>Steer move</span><button disabled>Right mouse</button></div>
        <div class="bind-row"><span>Orbit view</span><button disabled>Left mouse</button></div>
      </details>
      <section class="status-stack">
        <div data-context-line></div>
        <div data-status-line>Create an avatar to begin.</div>
      </section>
    `;

    this.buildPanel = this.get('[data-build-panel]');
    this.energyFill = this.get('[data-energy-fill]');
    this.energyValue = this.get('[data-energy-value]');
    this.statusLine = this.get('[data-status-line]');
    this.fieldLine = this.get('[data-field-line]');
    this.contextLine = this.get('[data-context-line]');
    this.personalityLine = this.get('[data-personality-line]');
    this.povReactorReflection = this.get('[data-pov-reactor-reflection]');
    this.freeSpeedWrap = this.get('[data-free-speed-wrap]');
    this.contributionInput = this.get<HTMLInputElement>('#teslaContribution');
    this.transferInput = this.get<HTMLInputElement>('#transferCap');

    this.bindCreatePanel();
    this.bindHud();
    this.bindBuildPanel();
    this.releaseControlsAfterPointerUse();
    this.refreshBuildPanel();
    this.setCameraMode(this.cameraMode);
  }

  toggleBuildPanel(): void {
    this.buildOpen = !this.buildOpen;
    this.refreshBuildPanel();
  }

  setBuildOpen(open: boolean): void {
    this.buildOpen = open;
    this.refreshBuildPanel();
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.modeButtons.forEach((button, key) => button.classList.toggle('active', key === mode));
    this.freeSpeedWrap.classList.toggle('visible', mode === 'free_camera');
    this.root.querySelector<HTMLElement>('[data-orbit-controls]')?.classList.toggle('visible', mode === 'third_person');
    this.callbacks.onCameraModeChange(mode);
  }

  setStatus(message: string): void {
    this.statusLine.textContent = message;
  }

  getGlowSettings(): GlowSettings {
    return {
      sceneBloom: this.sceneBloom,
      tesla: {
        active: this.teslaGlow,
        activeHalo: this.teslaHalo,
        unfinished: this.teslaGlow,
        unfinishedHalo: this.teslaHalo,
      },
      avatar: {
        reactor: this.reactorGlow,
        reactorBloom: this.reactorBloom,
        eyes: this.eyeGlow,
        eyesBloom: this.eyeBloom,
      },
    };
  }

  update(world: WorldState, placement?: ActionResult, context = ''): void {
    const avatar = world.getSelectedAvatar();

    if (!avatar) {
      this.energyValue.textContent = '--';
      this.energyFill.style.width = '0%';
      this.fieldLine.textContent = 'Field: --';
      this.personalityLine.textContent = 'Personality: --';
      this.contextLine.textContent = context;
      this.statusLine.textContent = world.lastMessage;
      this.updatePovReactorReflection(undefined);
      return;
    }

    const energy = Math.max(0, avatar.energy);
    this.energyValue.textContent = `${energy.toFixed(0)} / ${WORLD_RULES.maxEnergy}`;
    this.energyFill.style.width = `${energy}%`;
    this.energyFill.classList.toggle('medium', energy <= 65 && energy > 25);
    this.energyFill.classList.toggle('critical', energy <= 25);
    this.energyFill.classList.toggle('shutdown', avatar.shutdown);

    const field = world.getTeslaFieldEffectAt(avatar.position);
    if (avatar.shutdown) {
      this.fieldLine.textContent = 'Field: shutdown';
    } else if (field > 0) {
      this.fieldLine.textContent = 'Field: recharge +3/s';
    } else if (field < 0) {
      this.fieldLine.textContent = 'Field: interference -3/s';
    } else {
      this.fieldLine.textContent = 'Field: grid drain';
    }

    const personality = Object.entries(avatar.personality)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name)
      .join(' / ');
    this.personalityLine.textContent = `Personality: ${personality}`;

    this.contextLine.textContent = context || (placement ? placement.message : '');
    this.statusLine.textContent = world.lastMessage;
    this.refreshShapeCosts(energy);
    this.updatePovReactorReflection(avatar);
  }

  private updatePovReactorReflection(avatar: AvatarState | undefined): void {
    if (!avatar || this.cameraMode !== 'avatar_pov' || avatar.shutdown) {
      this.povReactorReflection.style.setProperty('--pov-reactor-opacity', '0');
      return;
    }

    const sceneBloom = this.sceneBloom / 100;
    const reactor = this.reactorGlow / 100;
    const reactorBloom = this.reactorBloom / 100;
    const sliderStrength = Math.pow(sceneBloom * 0.28 + reactor * 0.32 + reactorBloom * 0.4, 1.65);
    const energyStrength = avatar.energy > 65 ? 1 : avatar.energy > 25 ? 0.24 : 0.55;
    const opacity = Math.min(0.24, Math.max(0, sliderStrength * energyStrength * 0.22));
    const size = 0.68 + sliderStrength * 0.34;
    const color = avatar.energy > 65 ? '245, 255, 247' : avatar.energy > 25 ? '255, 138, 31' : '255, 32, 32';

    this.povReactorReflection.style.setProperty('--pov-reactor-color', color);
    this.povReactorReflection.style.setProperty('--pov-reactor-opacity', opacity.toFixed(3));
    this.povReactorReflection.style.setProperty('--pov-reactor-size', size.toFixed(3));
  }

  private bindCreatePanel(): void {
    const createPanel = this.get<HTMLElement>('[data-create-panel]');
    const colorWrap = this.get<HTMLElement>('[data-create-colors]');
    const personalityWrap = this.get<HTMLElement>('[data-personality]');
    const nameInput = this.get<HTMLInputElement>('#avatarName');
    let selectedCreateColor = COLORS[0];

    COLORS.forEach((color) => {
      const button = document.createElement('button');
      button.className = 'swatch';
      button.style.setProperty('--swatch', color);
      button.classList.toggle('active', color === selectedCreateColor);
      button.addEventListener('click', () => {
        selectedCreateColor = color;
        colorWrap.querySelectorAll('button').forEach((entry) => entry.classList.remove('active'));
        button.classList.add('active');
      });
      colorWrap.appendChild(button);
    });

    const sliders: Record<keyof PersonalityWeights, HTMLInputElement> = {
      focus: this.createPersonalitySlider(personalityWrap, 'Focus', 25),
      connection: this.createPersonalitySlider(personalityWrap, 'Connection', 20),
      curiosity: this.createPersonalitySlider(personalityWrap, 'Curiosity', 35),
      purpose: this.createPersonalitySlider(personalityWrap, 'Purpose', 20),
    };

    this.get<HTMLButtonElement>('[data-create-button]').addEventListener('click', () => {
      this.callbacks.onCreateAvatar({
        name: nameInput.value,
        color: selectedCreateColor,
        personality: {
          focus: Number(sliders.focus.value),
          connection: Number(sliders.connection.value),
          curiosity: Number(sliders.curiosity.value),
          purpose: Number(sliders.purpose.value),
        },
      });
      createPanel.classList.add('hidden');
    });
  }

  private createPersonalitySlider(parent: HTMLElement, label: string, value: number): HTMLInputElement {
    const row = document.createElement('label');
    row.className = 'personality-row';
    row.innerHTML = `<span>${label}</span><input type="range" min="0" max="100" step="1" value="${value}" />`;
    parent.appendChild(row);
    return row.querySelector('input') as HTMLInputElement;
  }

  private bindHud(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      const mode = button.dataset.mode as CameraMode;
      this.modeButtons.set(mode, button);
      button.addEventListener('click', () => this.setCameraMode(mode));
    });

    const freeSpeed = this.get<HTMLInputElement>('#freeSpeed');
    const value = this.get<HTMLElement>('[data-free-speed-value]');
    freeSpeed.addEventListener('input', () => {
      this.freeCameraSpeed = Number(freeSpeed.value);
      value.textContent = freeSpeed.value;
    });

    this.bindSlider('#avatarSpeed', '[data-avatar-speed-value]', (value) => {
      this.avatarWalkSpeed = value;
    }, 1);

    this.bindSlider('#glowLevel', '[data-glow-value]', (value) => {
      this.sceneBloom = value;
    });
    this.bindSlider('#teslaGlow', '[data-tesla-glow-value]', (value) => {
      this.teslaGlow = value;
    });
    this.bindSlider('#teslaHalo', '[data-tesla-halo-value]', (value) => {
      this.teslaHalo = value;
    });
    this.bindSlider('#reactorGlow', '[data-reactor-glow-value]', (value) => {
      this.reactorGlow = value;
    });
    this.bindSlider('#reactorBloom', '[data-reactor-bloom-value]', (value) => {
      this.reactorBloom = value;
    });
    this.bindSlider('#eyeGlow', '[data-eye-glow-value]', (value) => {
      this.eyeGlow = value;
    });
    this.bindSlider('#eyeBloom', '[data-eye-bloom-value]', (value) => {
      this.eyeBloom = value;
    });

    this.bindToggle('[data-orbit-horizontal-toggle]', (active) => {
      this.orbitHorizontalInverted = active;
      return active ? 'L/R inverted' : 'L/R normal';
    });
    this.bindToggle('[data-orbit-vertical-toggle]', (active) => {
      this.orbitVerticalInverted = active;
      return active ? 'U/D inverted' : 'U/D normal';
    });
  }

  private bindToggle(selector: string, onToggle: (active: boolean) => string): void {
    const button = this.get<HTMLButtonElement>(selector);
    button.addEventListener('click', () => {
      const active = !button.classList.contains('active');
      button.classList.toggle('active', active);
      button.textContent = onToggle(active);
    });
  }

  private bindSlider(inputSelector: string, valueSelector: string, onChange: (value: number) => void, decimals = 0): void {
    const input = this.get<HTMLInputElement>(inputSelector);
    const output = this.get<HTMLElement>(valueSelector);
    input.addEventListener('keydown', (event) => {
      event.preventDefault();
      input.blur();
    });
    input.addEventListener('input', () => {
      const value = Number(input.value);
      onChange(value);
      output.textContent = value.toFixed(decimals);
    });
  }

  private releaseControlsAfterPointerUse(): void {
    this.root.addEventListener('pointerup', (event) => {
      const target = (event.target as HTMLElement | null)?.closest('button, input[type="range"]') as HTMLElement | null;

      if (target) {
        window.setTimeout(() => target.blur(), 0);
      }
    });
  }

  private bindBuildPanel(): void {
    const shapeWrap = this.get<HTMLElement>('[data-shapes]');
    const colorWrap = this.get<HTMLElement>('[data-build-colors]');

    SHAPES.forEach((shape) => {
      const definition = BLOCK_DEFINITIONS[shape];
      const button = document.createElement('button');
      button.className = 'shape-card';
      button.innerHTML = `<span>${definition.label}</span><strong data-cost>${shape === 'tesla_node' ? WORLD_RULES.teslaNodeTargetEnergy : definition.energyCost}</strong>`;
      button.addEventListener('click', () => {
        this.selectedShape = shape;
        this.refreshBuildPanel();
      });
      shapeWrap.appendChild(button);
      this.shapeButtons.set(shape, button);
    });

    COLORS.forEach((color) => {
      const button = document.createElement('button');
      button.className = 'swatch';
      button.style.setProperty('--swatch', color);
      button.classList.toggle('active', color === this.selectedColor);
      button.addEventListener('click', () => {
        this.selectedColor = color;
        colorWrap.querySelectorAll('button').forEach((entry) => entry.classList.remove('active'));
        button.classList.add('active');
      });
      colorWrap.appendChild(button);
    });

    this.get<HTMLButtonElement>('[data-rotate]').addEventListener('click', (event) => {
      this.rotation = ((this.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      (event.currentTarget as HTMLButtonElement).textContent = `Rotate ${this.rotation}°`;
    });

    this.contributionInput.addEventListener('input', () => {
      this.teslaContribution = Math.max(0, Number(this.contributionInput.value) || 0);
    });
    this.transferInput.addEventListener('input', () => {
      this.transferCap = Math.max(0, Number(this.transferInput.value) || 0);
    });
  }

  private refreshBuildPanel(): void {
    this.buildPanel.classList.toggle('open', this.buildOpen);
    this.shapeButtons.forEach((button, shape) => {
      button.classList.toggle('active', shape === this.selectedShape);
    });
    this.get<HTMLElement>('[data-tesla-row]').classList.toggle('visible', this.selectedShape === 'tesla_node');
  }

  private refreshShapeCosts(energy: number): void {
    this.shapeButtons.forEach((button, shape) => {
      const cost = shape === 'tesla_node' ? WORLD_RULES.teslaNodeTargetEnergy : BLOCK_DEFINITIONS[shape].energyCost;
      const costNode = button.querySelector('[data-cost]');
      costNode?.classList.toggle('affordable', energy >= cost);
      costNode?.classList.toggle('expensive', energy < cost);
    });
  }

  private get<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing UI element: ${selector}`);
    }
    return element;
  }
}
