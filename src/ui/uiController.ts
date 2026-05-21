import { ActionResult } from '../actions/actions';
import { DEFAULT_LM_STUDIO_CONFIG, isLlmProvider, LLMProviderConfig, normalizeLlmBaseUrl, shouldPreferLmStudioRest } from '../llm/LLMProviderConfig';
import type { GlowSettings } from '../render/worldRenderer';
import type { WorldEvent } from '../world/WorldEvents';
import { AvatarState, BlockShape, BLOCK_DEFINITIONS, CameraMode, WORLD_RULES } from '../world/types';
import { WorldState } from '../world/worldState';
import { AmbientAudio } from './ambientAudio';
import { TeslaNodeLoopSound } from './soundEffects';

type UICallbacks = {
  onCreateAvatar: (options: {
    name: string;
    color: string;
    eyeStyle: 'normal';
    creationType: 'manual' | 'ai';
    provider?: string;
    model?: string;
  }) => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onSpawnAiAvatar: () => void;
  onLlmConfigChange: (config: LLMProviderConfig) => void;
  onMenuClick: () => void;
  onSelectAvatar: (avatarId: string, intent: 'view' | 'control') => void;
  onAssignAi: (avatarId: string) => void;
  onDisconnectAi: (avatarId: string) => void;
  onDeleteAvatar: (avatarId: string) => void;
  onAvatarChat: (avatarId: string, message: string) => Promise<string>;
};

const SHAPES: BlockShape[] = ['cube', 'tile', 'tesla_node'];
const COLORS = ['#00ff88', '#44f2ff', '#2f7dff', '#00d4c8', '#9b7cff', '#d34dff'];
const AMBIENT_TRACKS = [
  '/audio/ambient_music/Grid_Ambience_Suite_2026-05-18T195753.mp3',
  '/audio/ambient_music/Grid_Ambience_Suite_2026-05-18T195753%20(1).mp3',
  '/audio/ambient_music/Grid_Ambience_Suite_2026-05-18T195753%20(2).mp3',
  '/audio/ambient_music/Grid_Ambience_Suite_2026-05-18T195753%20(3).mp3',
];
const LLM_STORAGE_KEYS = {
  provider: 'tron-world:llm-provider',
  baseUrl: 'tron-world:llm-base-url',
  model: 'tron-world:llm-model',
  apiKey: 'tron-world:llm-api-key',
} as const;
const CONTROL_STORAGE_KEYS = {
  orbitHorizontalInverted: 'tron-world:orbit-horizontal-inverted',
  orbitVerticalInverted: 'tron-world:orbit-vertical-inverted',
  avatarWalkSpeed: 'tron-world:avatar-walk-speed',
} as const;
const WORLD_LOG_POSITION_KEY = 'tron-world:world-log-position';
const LM_STUDIO_REST_BASE_URL = '/lmstudio';
const LM_STUDIO_OPENAI_BASE_URL = '/lmstudio/v1';
const AVATAR_SPEED_MIN = 1.8;
const AVATAR_SPEED_MAX = 7.5;

type LMStudioModelListResponse = {
  models?: Array<{
    type?: string;
    key?: string;
    display_name?: string;
    params_string?: string | null;
    loaded_instances?: unknown[];
    capabilities?: {
      vision?: boolean;
      trained_for_tool_use?: boolean;
    };
  }>;
};

type WorldLogTab = 'actions' | 'thoughts' | 'system';
type LlmConnectionState = 'unchecked' | 'checking' | 'connected' | 'disconnected';
type AvatarChatEntry = {
  role: 'user' | 'model' | 'system';
  text: string;
};

export type ScreenPoint = {
  x: number;
  y: number;
};

function storageValue(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function storageBoolean(key: string, fallback: boolean): boolean {
  return storageValue(key, fallback ? 'true' : 'false') === 'true';
}

function storageNumber(key: string, fallback: number, min: number, max: number): number {
  const value = Number(storageValue(key, String(fallback)));
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function saveStorageValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Non-essential UI preference.
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class UIController {
  readonly root: HTMLElement;
  cameraMode: CameraMode = 'third_person';
  buildOpen = false;
  selectedShape: BlockShape = 'cube';
  selectedColor = COLORS[0];
  rotation: 0 | 90 | 180 | 270 = 0;
  orbitHorizontalInverted = storageBoolean(CONTROL_STORAGE_KEYS.orbitHorizontalInverted, false);
  orbitVerticalInverted = storageBoolean(CONTROL_STORAGE_KEYS.orbitVerticalInverted, false);
  avatarWalkSpeed: number = storageNumber(CONTROL_STORAGE_KEYS.avatarWalkSpeed, WORLD_RULES.avatarWalkSpeed, AVATAR_SPEED_MIN, AVATAR_SPEED_MAX);
  freeCameraSpeed = 10;
  sceneBloom = 22;
  teslaGlow = 42;
  teslaHalo = 42;
  reactorGlow = 44;
  reactorBloom = 54;
  eyeGlow = 36;
  eyeBloom = 36;
  ambientEnabled = true;
  ambientVolume = 14;
  teslaNodeSoundEnabled = true;
  teslaNodeVolume = 100;
  llmProvider = this.initialLlmProvider();
  llmBaseUrl = normalizeLlmBaseUrl(storageValue(LLM_STORAGE_KEYS.baseUrl, DEFAULT_LM_STUDIO_CONFIG.baseUrl ?? ''), this.llmProvider);
  llmModel = storageValue(LLM_STORAGE_KEYS.model, DEFAULT_LM_STUDIO_CONFIG.model ?? 'local-model');
  llmApiKey = storageValue(LLM_STORAGE_KEYS.apiKey, DEFAULT_LM_STUDIO_CONFIG.apiKey ?? 'not-needed');
  teslaContribution = 0;
  transferCap = 0;

  private readonly shapeButtons = new Map<BlockShape, HTMLButtonElement>();
  private readonly modeButtons = new Map<CameraMode, HTMLButtonElement>();
  private readonly buildPanel: HTMLElement;
  private readonly buildToggleButton: HTMLButtonElement;
  private readonly avatarNameLine: HTMLElement;
  private readonly avatarStatusLine: HTMLElement;
  private readonly avatarQuickSelect: HTMLSelectElement;
  private readonly avatarManagerList: HTMLElement;
  private readonly worldLogPanel: HTMLElement;
  private readonly worldLogList: HTMLElement;
  private readonly worldLogTabs: HTMLButtonElement[];
  private readonly worldLogFilters: HTMLElement;
  private readonly avatarPanel: HTMLElement;
  private readonly avatarPanelName: HTMLElement;
  private readonly avatarPanelStatus: HTMLElement;
  private readonly avatarPanelDetails: HTMLElement;
  private readonly avatarChatLog: HTMLElement;
  private readonly avatarChatInput: HTMLTextAreaElement;
  private readonly avatarChatStatus: HTMLElement;
  private readonly avatarChatSendButton: HTMLButtonElement;
  private readonly energyFill: HTMLElement;
  private readonly energyValue: HTMLElement;
  private readonly statOwnerLine: HTMLElement;
  private readonly statDrainLine: HTMLElement;
  private readonly statDrainDetails: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly fieldLine: HTMLElement;
  private readonly contextLine: HTMLElement;
  private readonly povReactorReflection: HTMLElement;
  private readonly freeSpeedWrap: HTMLElement;
  private readonly createPanel: HTMLElement;
  private readonly menuOverlay: HTMLElement;
  private readonly llmStatusLine: HTMLElement;
  private readonly llmEndpointLine: HTMLElement;
  private readonly llmConnectionLine: HTMLElement;
  private readonly llmSimulationLine: HTMLElement;
  private readonly llmModelsList: HTMLElement;
  private readonly ambientAudio = new AmbientAudio(AMBIENT_TRACKS);
  private readonly teslaNodeAudio = new TeslaNodeLoopSound();
  private readonly contributionInput: HTMLInputElement;
  private readonly transferInput: HTMLInputElement;
  private avatarManagerSignature = '';
  private worldLogSignature = '';
  private worldLogFilterSignature = '';
  private llmConnectionState: LlmConnectionState = 'unchecked';
  private readonly worldLogAgentFilters = new Map<string, boolean>();
  private readonly avatarChatHistory = new Map<string, AvatarChatEntry[]>();
  private avatarPanelAvatarId?: string;
  private latestWorld?: WorldState;
  private lastLlmAutoCheckAt = 0;
  private llmCheckInFlight = false;
  private activeWorldLogTab: WorldLogTab = 'actions';

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
      <button class="menu-button" data-menu-open>Menu</button>
      <section class="menu-overlay hidden" data-menu-overlay>
        <div class="menu-modal">
          <aside class="menu-nav">
            <span class="menu-nav-label">Agents</span>
            <button data-menu-tab="avatar">Avatar Manager</button>
            <button data-menu-tab="llm">AI Connection</button>
            <button data-menu-tab="spawn">Spawn</button>
            <span class="menu-nav-label">World</span>
            <button class="active" data-menu-tab="settings">Settings</button>
            <button data-menu-tab="audio">Audio</button>
            <button data-menu-tab="bindings">Bindings</button>
            <span class="menu-nav-label">Reference</span>
            <button data-menu-tab="manual">Manual</button>
          </aside>
          <div class="menu-content">
            <div class="menu-header">
              <strong data-menu-title>Settings</strong>
              <button data-menu-close>Close</button>
            </div>
            <section class="menu-section active" data-menu-section="settings">
              <div class="settings-grid">
                <label>
                  <span>Tesla Bloom</span>
                  <input id="glowLevel" type="range" min="0" max="100" step="1" value="22" />
                  <strong data-glow-value>22</strong>
                </label>
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
            </section>
            <section class="menu-section" data-menu-section="audio">
              <div class="settings-grid audio-grid">
                <label class="toggle-row">
                  <span>Ambient music</span>
                  <input id="ambientMusic" type="checkbox" checked />
                </label>
                <label>
                  <span>Music volume</span>
                  <input id="ambientVolume" type="range" min="0" max="100" step="1" value="14" />
                  <strong data-ambient-volume-value>14</strong>
                </label>
                <label class="toggle-row">
                  <span>Tesla Node sound</span>
                  <input id="teslaNodeSound" type="checkbox" checked />
                </label>
                <label>
                  <span>Tesla Node volume</span>
                  <input id="teslaNodeVolume" type="range" min="0" max="100" step="1" value="100" />
                  <strong data-tesla-node-volume-value>100</strong>
                </label>
              </div>
            </section>
            <section class="menu-section" data-menu-section="bindings">
              <div class="bind-row"><span>Forward</span><button disabled>W</button></div>
              <div class="bind-row"><span>Back</span><button disabled>S</button></div>
              <div class="bind-row"><span>Turn left</span><button disabled>A</button></div>
              <div class="bind-row"><span>Turn right</span><button disabled>D</button></div>
              <div class="bind-row"><span>Jump</span><button disabled>Space</button></div>
              <div class="bind-row"><span>Build</span><button disabled>1</button></div>
              <div class="bind-row"><span>Interact</span><button disabled>E</button></div>
              <div class="bind-row"><span>Zoom</span><button disabled>Wheel</button></div>
              <div class="bind-row"><span>Steer move</span><button disabled>Right mouse</button></div>
              <div class="bind-row"><span>Orbit view</span><button disabled>Left mouse</button></div>
            </section>
            <section class="menu-section" data-menu-section="manual">
              <div class="manual-tabs">
                <button class="active" data-manual-tab="start">Start</button>
                <button data-manual-tab="ai">AI</button>
                <button data-manual-tab="lmstudio">LM Studio</button>
                <button data-manual-tab="config">Config</button>
                <button data-manual-tab="rules">Rules</button>
              </div>
              <div class="manual-section active" data-manual-section="start">
                <h2>Start</h2>
                <p>Run <code>npm run dev</code> from the project root. Open the local URL printed by Vite.</p>
              </div>
              <div class="manual-section" data-manual-section="ai">
                <h2>AI Flow</h2>
                <p>Agents observe the world, receive a prompt, propose one JSON action, and the engine validates it before applying anything.</p>
              </div>
              <div class="manual-section" data-manual-section="lmstudio">
                <h2>LM Studio</h2>
                <p>Start LM Studio's local server at <code>http://127.0.0.1:1234</code>. The app uses the native REST v1 proxy at <code>/lmstudio/api/v1/chat</code>.</p>
              </div>
              <div class="manual-section" data-manual-section="config">
                <h2>Config</h2>
                <p>Use AI Connection in this menu to set provider, base URL, model, and key. Code edits are not required.</p>
              </div>
              <div class="manual-section" data-manual-section="rules">
                <h2>Rules</h2>
                <p>The model cannot mutate the world, teleport, invent actions, control cameras, or decide success. Invalid output falls back safely.</p>
              </div>
            </section>
            <section class="menu-section" data-menu-section="avatar">
              <div class="avatar-manager">
                <div class="manager-toolbar">
                  <h2>Avatar Manager</h2>
                  <button data-open-avatar-create>Create Avatar</button>
                </div>
                <div class="avatar-list" data-avatar-manager-list></div>
              </div>
            </section>
            <section class="menu-section" data-menu-section="spawn">
              <div class="menu-card">
                <h2>Spawn Controls</h2>
                <p>Spawn an AI-controlled avatar near the starting Tesla Node. It will use the current AI connection settings.</p>
                <button data-spawn-ai>Spawn AI Agent</button>
              </div>
            </section>
            <section class="menu-section" data-menu-section="llm">
              <div class="llm-form">
                <div class="llm-presets">
                  <button data-lmstudio-native>LM Studio REST v1</button>
                  <button data-lmstudio-openai>OpenAI-compatible</button>
                  <button data-check-llm>Check Connection</button>
                  <button data-refresh-lmstudio-models>Find Models</button>
                </div>
                <label>
                  <span>Provider</span>
                  <select id="llmProvider">
                    <option value="lmstudio-rest" ${this.llmProvider === 'lmstudio-rest' ? 'selected' : ''}>LM Studio REST v1</option>
                    <option value="openai-compatible" ${this.llmProvider === 'openai-compatible' ? 'selected' : ''}>OpenAI-compatible</option>
                  </select>
                </label>
                <label>
                  <span>Base URL</span>
                  <input id="llmBaseUrl" value="${escapeAttribute(this.llmBaseUrl)}" />
                </label>
                <label>
                  <span>Model</span>
                  <input id="llmModel" value="${escapeAttribute(this.llmModel)}" />
                </label>
                <div class="llm-models" data-llm-models></div>
                <label>
                  <span>API key</span>
                  <input id="llmApiKey" value="${escapeAttribute(this.llmApiKey)}" />
                </label>
                <p data-llm-endpoint></p>
                <div class="llm-status-stack">
                  <p class="llm-connection-state unchecked" data-llm-connection-state>LLM server: not verified</p>
                  <p class="llm-simulation-state disconnected" data-llm-simulation-state>Simulation link: inactive, avatar behavior engine removed</p>
                </div>
                <button data-apply-llm>Apply AI Connection</button>
                <p data-llm-status>Configured: ${escapeAttribute(this.llmProvider)} / ${escapeAttribute(this.llmModel)}. Not verified.</p>
              </div>
            </section>
          </div>
        </div>
      </section>
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
          <div class="field-row">
            <label for="eyeStyle">Eye style</label>
            <select id="eyeStyle">
              <option value="normal">Normal</option>
            </select>
          </div>
          <div class="field-row">
            <label for="creationType">Creation type</label>
            <select id="creationType">
              <option value="manual">Empty Vessel</option>
              <option value="ai">AI Agent</option>
            </select>
          </div>
          <div class="ai-create-fields" data-ai-create-fields>
            <label>
              <span>AI provider</span>
              <select id="createAiProvider">
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>
            </label>
            <label>
              <span>Model</span>
              <input id="createAiModel" value="${escapeAttribute(this.llmModel)}" />
            </label>
          </div>
          <button class="primary-action" data-create-button>Enter World</button>
        </div>
      </section>
      <section class="hud">
        <div class="hud-main">
          <div class="avatar-rail">
            <div class="avatar-switcher">
              <label for="avatarQuickSelect">Avatar</label>
              <select id="avatarQuickSelect" data-avatar-quick-select></select>
              <span data-current-avatar-name>--</span>
              <span data-current-avatar-status>--</span>
            </div>
            <details class="stat-drawer">
              <summary>
                <span class="meter">
                  <span class="stat-owner" data-stat-owner>Stats: --</span>
                  <span class="meter-label">
                    <span>Energy</span>
                    <span data-energy-value>--</span>
                  </span>
                  <span class="meter-track"><span class="meter-fill" data-energy-fill></span></span>
                </span>
                <span class="stat-toggle-label">Stats</span>
              </summary>
              <div class="stat-details">
                <div class="stat-drain" data-stat-drain-details>Drain: --</div>
              </div>
            </details>
          </div>
          <div class="control-deck">
            <div class="primary-controls">
              <button class="build-toggle" data-build-toggle>Build</button>
              <div class="camera-cluster">
                <div class="mode-strip">
                  <button data-mode="third_person">Third</button>
                  <button data-mode="avatar_pov">POV</button>
                  <button data-mode="free_camera">Free</button>
                  </div>
                  <div class="camera-tuning">
                  <div class="orbit-controls" data-orbit-controls>
                    <button class="orbit-toggle ${this.orbitHorizontalInverted ? 'active' : ''}" data-orbit-horizontal-toggle>${this.orbitHorizontalInverted ? 'L/R inverted' : 'L/R normal'}</button>
                    <button class="orbit-toggle ${this.orbitVerticalInverted ? 'active' : ''}" data-orbit-vertical-toggle>${this.orbitVerticalInverted ? 'U/D inverted' : 'U/D normal'}</button>
                  </div>
                  <div class="avatar-speed">
                    <label for="avatarSpeed">Move speed</label>
                    <input id="avatarSpeed" type="range" min="${AVATAR_SPEED_MIN}" max="${AVATAR_SPEED_MAX}" step="0.1" value="${this.avatarWalkSpeed}" />
                    <span data-avatar-speed-value>${this.avatarWalkSpeed.toFixed(1)}</span>
                  </div>
                  <div class="free-speed" data-free-speed-wrap>
                    <label for="freeSpeed">Free speed</label>
                    <input id="freeSpeed" type="range" min="3" max="28" step="1" value="10" />
                    <span data-free-speed-value>10</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="hud-lines">
              <span data-stat-drain>Drain: --</span>
              <span data-field-line>Field: --</span>
            </div>
          </div>
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
      <section class="status-stack">
        <div data-context-line></div>
        <div data-status-line>Create an avatar to begin.</div>
      </section>
      <details class="world-log" data-world-log>
        <summary>
          <span>World Log</span>
          <span class="world-log-summary-actions">
            <span class="drag-hint">Drag</span>
          </span>
        </summary>
        <div class="world-log-tabs">
          <button class="active" data-world-log-tab="actions">Actions</button>
          <button data-world-log-tab="thoughts">Thoughts</button>
          <button data-world-log-tab="system">System</button>
        </div>
        <div class="world-log-filters" data-world-log-filters></div>
        <div class="world-log-list" data-world-log-list></div>
      </details>
      <section class="avatar-panel hidden" data-avatar-panel>
        <div class="avatar-panel-header">
          <div>
            <strong data-avatar-panel-name>Avatar</strong>
            <span data-avatar-panel-status>--</span>
          </div>
          <button data-avatar-panel-close>Close</button>
        </div>
        <div class="avatar-panel-details" data-avatar-panel-details></div>
        <div class="avatar-chat">
          <div class="avatar-chat-log" data-avatar-chat-log></div>
          <textarea data-avatar-chat-input rows="3" placeholder="Prompt this avatar's connected model..."></textarea>
          <div class="avatar-chat-actions">
            <span data-avatar-chat-status>Direct model chat. Simulation control inactive.</span>
            <button data-avatar-chat-send>Send</button>
          </div>
        </div>
      </section>
    `;

    this.buildPanel = this.get('[data-build-panel]');
    this.buildToggleButton = this.get('[data-build-toggle]');
    this.avatarNameLine = this.get('[data-current-avatar-name]');
    this.avatarStatusLine = this.get('[data-current-avatar-status]');
    this.avatarQuickSelect = this.get<HTMLSelectElement>('[data-avatar-quick-select]');
    this.avatarManagerList = this.get('[data-avatar-manager-list]');
    this.worldLogPanel = this.get('[data-world-log]');
    this.worldLogList = this.get('[data-world-log-list]');
    this.worldLogTabs = [...this.root.querySelectorAll<HTMLButtonElement>('[data-world-log-tab]')];
    this.worldLogFilters = this.get('[data-world-log-filters]');
    this.avatarPanel = this.get('[data-avatar-panel]');
    this.avatarPanelName = this.get('[data-avatar-panel-name]');
    this.avatarPanelStatus = this.get('[data-avatar-panel-status]');
    this.avatarPanelDetails = this.get('[data-avatar-panel-details]');
    this.avatarChatLog = this.get('[data-avatar-chat-log]');
    this.avatarChatInput = this.get<HTMLTextAreaElement>('[data-avatar-chat-input]');
    this.avatarChatStatus = this.get('[data-avatar-chat-status]');
    this.avatarChatSendButton = this.get<HTMLButtonElement>('[data-avatar-chat-send]');
    this.energyFill = this.get('[data-energy-fill]');
    this.energyValue = this.get('[data-energy-value]');
    this.statOwnerLine = this.get('[data-stat-owner]');
    this.statDrainLine = this.get('[data-stat-drain]');
    this.statDrainDetails = this.get('[data-stat-drain-details]');
    this.statusLine = this.get('[data-status-line]');
    this.fieldLine = this.get('[data-field-line]');
    this.contextLine = this.get('[data-context-line]');
    this.povReactorReflection = this.get('[data-pov-reactor-reflection]');
    this.freeSpeedWrap = this.get('[data-free-speed-wrap]');
    this.createPanel = this.get('[data-create-panel]');
    this.menuOverlay = this.get('[data-menu-overlay]');
    this.llmStatusLine = this.get('[data-llm-status]');
    this.llmEndpointLine = this.get('[data-llm-endpoint]');
    this.llmConnectionLine = this.get('[data-llm-connection-state]');
    this.llmSimulationLine = this.get('[data-llm-simulation-state]');
    this.llmModelsList = this.get('[data-llm-models]');
    this.contributionInput = this.get<HTMLInputElement>('#teslaContribution');
    this.transferInput = this.get<HTMLInputElement>('#transferCap');

    this.bindCreatePanel();
    this.bindMenuClickSound();
    this.bindMenuPanel();
    this.bindHud();
    this.bindBuildPanel();
    this.bindManualPanel();
    this.bindWorldLogTabs();
    this.bindWorldLogDrag();
    this.bindAvatarPanel();
    this.releaseControlsAfterPointerUse();
    this.refreshLlmEndpointHint();
    this.refreshLlmSimulationStatus();
    this.refreshBuildPanel();
    this.setCameraMode(this.cameraMode);
    this.applyButtonTooltips();
  }

  private initialLlmProvider(): LLMProviderConfig['provider'] {
    const storedProvider = storageValue(LLM_STORAGE_KEYS.provider, DEFAULT_LM_STUDIO_CONFIG.provider);
    const provider = isLlmProvider(storedProvider) ? storedProvider : DEFAULT_LM_STUDIO_CONFIG.provider;
    const baseUrl = storageValue(LLM_STORAGE_KEYS.baseUrl, DEFAULT_LM_STUDIO_CONFIG.baseUrl ?? '');
    return shouldPreferLmStudioRest(provider, baseUrl) ? 'lmstudio-rest' : provider;
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

  private applyButtonTooltips(scope: ParentNode = this.root): void {
    scope.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const tooltip = this.buttonTooltip(button);
      button.title = tooltip;
      if (!button.getAttribute('aria-label')) {
        button.setAttribute('aria-label', tooltip);
      }
    });
  }

  private buttonTooltip(button: HTMLButtonElement): string {
    if (button.dataset.modelKey !== undefined) {
      return `Use ${this.buttonText(button)} as the AI model.`;
    }

    if (button.dataset.avatarAction) {
      const avatarName = button.closest('.avatar-manager-row')?.querySelector('.avatar-manager-main strong')?.textContent?.trim() ?? 'this avatar';
      const tooltips: Record<string, string> = {
        view: `Watch ${avatarName} without taking manual control.`,
        control: `Take manual control of ${avatarName} if it is an empty/manual avatar.`,
        'assign-ai': `Assign the current AI connection to ${avatarName}.`,
        'disconnect-ai': `Disconnect AI from ${avatarName} and make it an empty/manual avatar.`,
        delete: `Remove ${avatarName} from the world.`,
      };
      return tooltips[button.dataset.avatarAction] ?? `Manage ${avatarName}.`;
    }

    if (button.dataset.menuTab) {
      const tooltips: Record<string, string> = {
        avatar: 'Open the full Avatar Manager.',
        llm: 'Configure the AI provider, endpoint, model, and key.',
        spawn: 'Open controls for spawning AI avatars.',
        settings: 'Open visual glow and bloom settings.',
        audio: 'Open ambient music and Tesla Node sound settings.',
        bindings: 'Show the current keyboard and mouse bindings.',
        manual: 'Open the in-app reference notes.',
      };
      return tooltips[button.dataset.menuTab] ?? `Open ${this.buttonText(button)}.`;
    }

    if (button.dataset.manualTab) {
      const tooltips: Record<string, string> = {
        start: 'Show startup instructions.',
        ai: 'Show how AI actions flow through validation.',
        lmstudio: 'Show LM Studio connection notes.',
        config: 'Show AI connection configuration notes.',
        rules: 'Show the world action rules.',
      };
      return tooltips[button.dataset.manualTab] ?? `Show ${this.buttonText(button)} notes.`;
    }

    if (button.dataset.mode) {
      const tooltips: Record<string, string> = {
        third_person: 'Attach the camera behind the selected avatar.',
        avatar_pov: 'Look through the selected avatar camera.',
        free_camera: 'Detach the camera and fly freely without controlling an avatar.',
      };
      return tooltips[button.dataset.mode] ?? 'Switch camera mode.';
    }

    if (button.dataset.worldLogTab) {
      const tooltips: Record<string, string> = {
        actions: 'Show accepted and rejected agent actions.',
        thoughts: 'Show short agent intention summaries.',
        system: 'Show system/world messages.',
      };
      return tooltips[button.dataset.worldLogTab] ?? `Show ${this.buttonText(button)} log entries.`;
    }

    const bindingLabel = button.closest('.bind-row')?.querySelector('span')?.textContent?.trim();
    if (bindingLabel) {
      return `${this.buttonText(button)} is bound to ${bindingLabel}.`;
    }

    if (button.classList.contains('swatch')) {
      const color = button.style.getPropertyValue('--swatch').trim();
      return color ? `Select color ${color}.` : 'Select this color.';
    }

    if (button.classList.contains('shape-card')) {
      return `Select ${button.querySelector('span')?.textContent?.trim() ?? 'this block'} for building.`;
    }

    if (button.hasAttribute('data-menu-open')) {
      return 'Open the main menu.';
    }
    if (button.hasAttribute('data-menu-close')) {
      return 'Close the main menu.';
    }
    if (button.hasAttribute('data-open-avatar-create')) {
      return 'Open the avatar creation panel.';
    }
    if (button.hasAttribute('data-spawn-ai')) {
      return 'Spawn a new AI-controlled avatar using the current AI connection.';
    }
    if (button.hasAttribute('data-lmstudio-native')) {
      return 'Use the LM Studio native REST v1 endpoint preset.';
    }
    if (button.hasAttribute('data-lmstudio-openai')) {
      return 'Use the OpenAI-compatible LM Studio endpoint preset.';
    }
    if (button.hasAttribute('data-refresh-lmstudio-models')) {
      return 'Fetch the model list from LM Studio and select a loaded model.';
    }
    if (button.hasAttribute('data-check-llm')) {
      return 'Check whether the configured LLM server is reachable.';
    }
    if (button.hasAttribute('data-apply-llm')) {
      return 'Save and apply the current AI connection settings.';
    }
    if (button.hasAttribute('data-create-button')) {
      return 'Create this avatar and enter the world.';
    }
    if (button.hasAttribute('data-build-toggle')) {
      return 'Open or close the build panel for the controlled avatar.';
    }
    if (button.hasAttribute('data-orbit-horizontal-toggle')) {
      return 'Toggle horizontal camera orbit inversion.';
    }
    if (button.hasAttribute('data-orbit-vertical-toggle')) {
      return 'Toggle vertical camera orbit inversion.';
    }
    if (button.hasAttribute('data-rotate')) {
      return 'Rotate the selected build shape by 90 degrees.';
    }
    const text = this.buttonText(button);
    return text ? `Use ${text}.` : 'Use this button.';
  }

  private buttonText(button: HTMLButtonElement): string {
    return (button.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  startAmbientAudio(): void {
    this.ambientAudio.start();
  }

  getGlowSettings(world?: WorldState): GlowSettings {
    const activeAiAvatarIds = new Set<string>();
    if (world) {
      for (const avatar of world.avatars.values()) {
        if (this.isAiModelConnectedToAvatar(world, avatar)) {
          activeAiAvatarIds.add(avatar.id);
        }
      }
    }

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
        activeAiAvatarIds,
      },
    };
  }

  update(world: WorldState, placement?: ActionResult, context = '', events: WorldEvent[] = []): void {
    this.latestWorld = world;
    this.maybeAutoCheckLlmConnection(world);
    const avatar = world.getSelectedAvatar();
    this.updateAvatarControls(world);
    this.updateWorldLog(events, world);
    this.refreshAvatarPanel(world);

    if (!avatar) {
      this.statOwnerLine.textContent = 'Stats: no avatar selected';
      this.energyValue.textContent = '--';
      this.energyFill.style.width = '0%';
      this.setEnergyState(0, false);
      this.statDrainLine.textContent = 'Drain: --';
      this.statDrainDetails.textContent = 'Drain: --';
      this.fieldLine.textContent = 'Field: --';
      this.contextLine.textContent = context;
      this.statusLine.textContent = world.lastMessage;
      this.updatePovReactorReflection(undefined);
      this.teslaNodeAudio.update(0);
      this.ambientAudio.setTeslaDucking(0);
      return;
    }

    const energy = Math.max(0, avatar.energy);
    this.statOwnerLine.textContent = `Stats: ${avatar.name} (${this.avatarStatusLabel(avatar)})`;
    this.energyValue.textContent = `${energy.toFixed(0)} / ${WORLD_RULES.maxEnergy}`;
    this.energyFill.style.width = `${energy}%`;
    this.setEnergyState(energy, avatar.shutdown);

    const field = world.getTeslaFieldEffectAt(avatar.position);
    const baseDrain = avatar.isMoving ? WORLD_RULES.movementDrainPerSecond : WORLD_RULES.idleDrainPerSecond;
    const netDrain = avatar.shutdown ? 0 : baseDrain - field;
    if (netDrain > 0) {
      this.statDrainLine.textContent = `Drain: -${netDrain.toFixed(2)} Energy/s`;
    } else if (netDrain < 0) {
      this.statDrainLine.textContent = `Recharge: +${Math.abs(netDrain).toFixed(2)} Energy/s`;
    } else {
      this.statDrainLine.textContent = 'Drain: stable';
    }
    this.statDrainDetails.textContent = this.statDrainLine.textContent;

    if (avatar.shutdown) {
      this.fieldLine.textContent = 'Field: shutdown - avatar needs energy transfer';
    } else if (field > 0) {
      this.fieldLine.textContent = 'Field: recharge zone +3 Energy/s';
    } else if (field < 0) {
      this.fieldLine.textContent = 'Field: interference drain -3 Energy/s';
    } else {
      this.fieldLine.textContent = 'Field: open grid idle drain';
    }

    this.contextLine.textContent = context || (placement ? placement.message : '');
    this.statusLine.textContent = world.lastMessage;
    this.refreshShapeCosts(energy);
    this.updatePovReactorReflection(avatar);
    this.updateTeslaNodeAudio(world, avatar);
  }

  private updateTeslaNodeAudio(world: WorldState, avatar: AvatarState): void {
    let strongest = 0;

    for (const node of world.teslaNodes.values()) {
      if (!node.active || node.interference) {
        continue;
      }

      const distance = Math.max(0, Math.hypot(avatar.position.x - node.position.x, avatar.position.z - node.position.z));
      if (distance > node.radius) {
        continue;
      }

      const normalized = 1 - distance / node.radius;
      const proximity = 0.08 + Math.pow(normalized, 1.65) * 0.92;
      strongest = Math.max(strongest, proximity);
    }

    this.teslaNodeAudio.update(strongest);
    this.ambientAudio.setTeslaDucking(strongest);
  }

  private setEnergyState(energy: number, shutdown: boolean): void {
    this.energyFill.classList.toggle('medium', energy <= 65 && energy > 25);
    this.energyFill.classList.toggle('critical', energy <= 25);
    this.energyFill.classList.toggle('shutdown', shutdown);
  }

  private updateAvatarControls(world: WorldState): void {
    const selected = world.getSelectedAvatar();
    this.avatarNameLine.textContent = selected ? selected.name : '--';
    this.avatarStatusLine.textContent = selected ? this.avatarStatusLabel(selected) : '--';

    const manualAvatars = [...world.avatars.values()].filter((avatar) => avatar.control === 'manual' && !avatar.inhabitedByAi && !avatar.shutdown);
    const currentOptions = new Set([...this.avatarQuickSelect.options].map((option) => option.value));
    const nextOptions = new Set(manualAvatars.map((avatar) => avatar.id));
    const shouldRebuild =
      currentOptions.size !== nextOptions.size ||
      manualAvatars.some((avatar) => !currentOptions.has(avatar.id));

    if (shouldRebuild) {
      this.avatarQuickSelect.innerHTML = '';
      if (manualAvatars.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No manual avatars';
        this.avatarQuickSelect.appendChild(option);
      } else {
        for (const avatar of manualAvatars) {
          const option = document.createElement('option');
          option.value = avatar.id;
          option.textContent = avatar.name;
          this.avatarQuickSelect.appendChild(option);
        }
      }
    }

    this.avatarQuickSelect.value = selected && nextOptions.has(selected.id) ? selected.id : '';
    this.avatarQuickSelect.disabled = manualAvatars.length === 0;
    const buildDisabled = !selected || selected.control !== 'manual' || selected.inhabitedByAi || selected.shutdown;
    this.buildToggleButton.disabled = buildDisabled;
    if (buildDisabled && this.buildOpen) {
      this.buildOpen = false;
      this.refreshBuildPanel();
    }

    const managerSignature = [...world.avatars.values()]
      .map((avatar) => {
        const brain = avatar.brainId ? world.brains.get(avatar.brainId) : undefined;
        return [
          avatar.id,
          world.selectedAvatarId === avatar.id,
          avatar.name,
          avatar.control,
          avatar.inhabitedByAi,
          avatar.shutdown,
          Math.round(avatar.energy),
          avatar.color,
          brain?.provider ?? '',
          brain?.model ?? '',
        ].join(':');
      })
      .join('|');

    if (managerSignature !== this.avatarManagerSignature) {
      this.avatarManagerSignature = managerSignature;
      this.avatarManagerList.innerHTML = [...world.avatars.values()].map((avatar) => this.avatarManagerRow(world, avatar)).join('');
      this.applyButtonTooltips(this.avatarManagerList);
    }
  }

  openAvatarPanel(world: WorldState, avatarId: string, screenPoint?: ScreenPoint): void {
    this.latestWorld = world;
    this.avatarPanelAvatarId = avatarId;
    this.avatarPanel.classList.remove('hidden');
    if (screenPoint) {
      this.positionAvatarPanel(screenPoint.x + 18, screenPoint.y - 20);
    }
    this.refreshAvatarPanel(world);
    this.avatarChatInput.focus();
  }

  private closeAvatarPanel(): void {
    this.avatarPanelAvatarId = undefined;
    this.avatarPanel.classList.add('hidden');
  }

  private refreshAvatarPanel(world: WorldState): void {
    if (!this.avatarPanelAvatarId || this.avatarPanel.classList.contains('hidden')) {
      return;
    }

    const avatar = world.avatars.get(this.avatarPanelAvatarId);
    if (!avatar) {
      this.closeAvatarPanel();
      return;
    }

    const brain = avatar.brainId ? world.brains.get(avatar.brainId) : undefined;
    const modelStatus = brain ? `${brain.provider} / ${brain.model}` : 'No AI brain assigned';
    const serverStatus =
      this.llmConnectionState === 'connected'
        ? 'LLM server connected'
        : this.llmConnectionState === 'checking'
          ? 'LLM server checking'
          : this.llmConnectionState === 'disconnected'
            ? 'LLM server disconnected'
            : 'LLM server not verified';

    this.avatarPanelName.textContent = avatar.name;
    this.avatarPanelName.style.setProperty('--avatar-panel-color', avatar.color);
    this.avatarPanelStatus.textContent = this.avatarStatusLabel(avatar);
    this.avatarPanelDetails.innerHTML = [
      ['Category', this.avatarStatusLabel(avatar)],
      ['AI control', this.aiControlStatusLabel(world, avatar)],
      ['Brain config', modelStatus],
      ['Model chat', serverStatus],
      ['Simulation', 'inactive; chat cannot move/build/control the world'],
      ['Energy', `${Math.round(avatar.energy)} / ${WORLD_RULES.maxEnergy}`],
      ['Position', `${avatar.position.x.toFixed(1)}, ${avatar.position.y.toFixed(1)}, ${avatar.position.z.toFixed(1)}`],
      ['Goal', avatar.currentGoal],
      ['Recent', avatar.recentDecision],
    ]
      .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join('');

    this.refreshAvatarChatLog(avatar.id);
  }

  private avatarManagerRow(world: WorldState, avatar: AvatarState): string {
    const canControl = avatar.control === 'manual' && !avatar.inhabitedByAi && !avatar.shutdown;
    const brain = avatar.brainId ? world.brains.get(avatar.brainId) : undefined;
    const selected = world.selectedAvatarId === avatar.id;
    return `
      <article class="avatar-manager-row ${selected ? 'selected' : ''}" data-avatar-row-id="${escapeAttribute(avatar.id)}">
        <span class="avatar-color" style="--avatar-color: ${escapeAttribute(avatar.color)}"></span>
        <div class="avatar-manager-main">
          <strong>${escapeHtml(avatar.name)}</strong>
          <span>${this.avatarStatusLabel(avatar)} · Energy ${Math.round(avatar.energy)} / ${WORLD_RULES.maxEnergy}</span>
          <span>${brain ? `${escapeHtml(brain.provider)} / ${escapeHtml(brain.model)}` : 'Brain: none'}</span>
        </div>
        <div class="avatar-actions">
          <button data-avatar-action="view" data-avatar-id="${escapeAttribute(avatar.id)}">View</button>
          <button data-avatar-action="control" data-avatar-id="${escapeAttribute(avatar.id)}" ${canControl ? '' : 'disabled title="AI-occupied avatar cannot be directly controlled."'}>Control</button>
          <button data-avatar-action="assign-ai" data-avatar-id="${escapeAttribute(avatar.id)}" ${avatar.control === 'ai' || avatar.shutdown ? 'disabled' : ''}>Assign AI</button>
          <button data-avatar-action="disconnect-ai" data-avatar-id="${escapeAttribute(avatar.id)}" ${avatar.control === 'ai' ? '' : 'disabled'}>Disconnect AI</button>
          <button data-avatar-action="delete" data-avatar-id="${escapeAttribute(avatar.id)}">Delete</button>
        </div>
      </article>
    `;
  }

  private avatarStatusLabel(avatar: AvatarState): string {
    if (avatar.shutdown) {
      return 'Shutdown';
    }
    return avatar.control === 'ai' || avatar.inhabitedByAi ? 'AI Avatar Shell' : 'Empty / Manual';
  }

  private isAiModelConnectedToAvatar(world: WorldState, avatar: AvatarState): boolean {
    const brain = avatar.brainId ? world.brains.get(avatar.brainId) : undefined;
    return (
      !avatar.shutdown &&
      avatar.control === 'ai' &&
      avatar.inhabitedByAi &&
      !!brain &&
      this.llmConnectionState === 'connected'
    );
  }

  private aiControlStatusLabel(world: WorldState, avatar: AvatarState): string {
    if (avatar.shutdown) {
      return 'Offline: avatar is shutdown';
    }
    if (avatar.control !== 'ai' && !avatar.inhabitedByAi) {
      return 'Human/manual when selected';
    }

    const brain = avatar.brainId ? world.brains.get(avatar.brainId) : undefined;
    if (!brain) {
      return 'No model assigned';
    }
    if (this.llmConnectionState !== 'connected') {
      return 'No live model: server is not connected';
    }
    return 'Model connected; avatar inhabited, simulation control inactive';
  }

  private updateWorldLog(events: WorldEvent[], world: WorldState): void {
    this.updateWorldLogFilters(world);
    const filtered = this.filteredWorldLogEvents(events);
    if (filtered.length === 0) {
      const emptySignature = `empty:${this.activeWorldLogTab}:${this.currentWorldLogFilterSignature()}`;
      if (this.worldLogSignature !== emptySignature) {
        this.worldLogSignature = emptySignature;
        this.worldLogList.innerHTML = `<div class="world-log-empty">No recent ${this.activeWorldLogTab}.</div>`;
      }
      return;
    }

    const compacted = this.compactWorldLogEvents(filtered.slice(-18));
    const logSignature = `${this.activeWorldLogTab}:${this.currentWorldLogFilterSignature()}:` + compacted.map((entry) => `${entry.event.id}:${entry.event.message}:${entry.count}`).join('|');
    if (logSignature === this.worldLogSignature) {
      return;
    }

    this.worldLogSignature = logSignature;
    this.worldLogList.innerHTML = compacted
      .reverse()
      .map(({ event, count }) => {
        void world;
        const speaker = 'System';
        const repeated = count > 1 ? `<strong>x${count}</strong>` : '';
        return `<div class="world-log-entry ${event.type}"><span class="world-log-speaker">[${escapeHtml(speaker)}]</span> ${this.worldLogMessageHtml(event)}${repeated}</div>`;
      })
      .join('');
  }

  private worldLogMessageHtml(event: WorldEvent): string {
    return `<span class="world-log-message">${escapeHtml(event.message)}</span>`;
  }

  private filteredWorldLogEvents(events: WorldEvent[]): WorldEvent[] {
    switch (this.activeWorldLogTab) {
      case 'thoughts':
        return [];
      case 'system':
        return events.filter((event) => event.type === 'world');
      case 'actions':
      default:
        return [];
    }
  }

  private updateWorldLogFilters(world: WorldState): void {
    const avatars = [...world.avatars.values()];
    const avatarIds = new Set(avatars.map((avatar) => avatar.id));

    for (const avatar of avatars) {
      if (!this.worldLogAgentFilters.has(avatar.id)) {
        this.worldLogAgentFilters.set(avatar.id, true);
      }
    }

    for (const avatarId of [...this.worldLogAgentFilters.keys()]) {
      if (!avatarIds.has(avatarId)) {
        this.worldLogAgentFilters.delete(avatarId);
      }
    }

    const signature = `${this.activeWorldLogTab}:` + avatars.map((avatar) => `${avatar.id}:${avatar.name}:${avatar.color}:${this.worldLogAgentFilters.get(avatar.id) !== false}`).join('|');
    if (signature === this.worldLogFilterSignature) {
      return;
    }

    this.worldLogFilterSignature = signature;
    if (this.activeWorldLogTab === 'system' || avatars.length === 0) {
      this.worldLogFilters.innerHTML = '';
      this.worldLogFilters.classList.remove('open');
      return;
    }

    const allChecked = avatars.every((avatar) => this.worldLogAgentFilters.get(avatar.id) !== false);
    this.worldLogFilters.innerHTML = [
      `<label class="world-log-filter all"><input type="checkbox" data-world-log-filter-all ${allChecked ? 'checked' : ''} />All</label>`,
      ...avatars.map((avatar) => {
        const checked = this.worldLogAgentFilters.get(avatar.id) !== false ? 'checked' : '';
        return `<label class="world-log-filter" style="--entry-color: ${escapeAttribute(avatar.color)}"><input type="checkbox" data-world-log-filter="${escapeAttribute(avatar.id)}" ${checked} /><span>${escapeHtml(avatar.name)}</span></label>`;
      }),
    ].join('');
  }

  private currentWorldLogFilterSignature(): string {
    return [...this.worldLogAgentFilters.entries()].map(([id, enabled]) => `${id}:${enabled}`).join('|');
  }

  private compactWorldLogEvents(events: WorldEvent[]): Array<{ event: WorldEvent; count: number }> {
    const compacted: Array<{ event: WorldEvent; count: number }> = [];
    for (const event of events) {
      const previous = compacted[compacted.length - 1];
      if (previous && this.worldLogCompactKey(previous.event) === this.worldLogCompactKey(event)) {
        previous.event = event;
        previous.count += 1;
      } else {
        compacted.push({ event, count: 1 });
      }
    }
    return compacted.slice(-12);
  }

  private worldLogCompactKey(event: WorldEvent): string {
    return `${event.type}:${event.message}`;
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
    const color = avatar.energy > 25 ? '245, 255, 247' : '255, 0, 0';

    this.povReactorReflection.style.setProperty('--pov-reactor-color', color);
    this.povReactorReflection.style.setProperty('--pov-reactor-opacity', opacity.toFixed(3));
    this.povReactorReflection.style.setProperty('--pov-reactor-size', size.toFixed(3));
  }

  private bindMenuClickSound(): void {
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement | null)?.closest('button');
      if (!button || !this.root.contains(button)) {
        return;
      }

      this.callbacks.onMenuClick();
    });
  }

  private bindCreatePanel(): void {
    const createPanel = this.get<HTMLElement>('[data-create-panel]');
    const colorWrap = this.get<HTMLElement>('[data-create-colors]');
    const nameInput = this.get<HTMLInputElement>('#avatarName');
    const eyeStyleInput = this.get<HTMLSelectElement>('#eyeStyle');
    const creationTypeInput = this.get<HTMLSelectElement>('#creationType');
    const aiFields = this.get<HTMLElement>('[data-ai-create-fields]');
    const aiProviderInput = this.get<HTMLSelectElement>('#createAiProvider');
    const aiModelInput = this.get<HTMLInputElement>('#createAiModel');
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

    const refreshCreationFields = () => {
      aiFields.classList.toggle('visible', creationTypeInput.value === 'ai');
    };
    creationTypeInput.addEventListener('change', refreshCreationFields);
    refreshCreationFields();

    this.get<HTMLButtonElement>('[data-create-button]').addEventListener('click', () => {
      this.callbacks.onCreateAvatar({
        name: nameInput.value,
        color: selectedCreateColor,
        eyeStyle: eyeStyleInput.value as 'normal',
        creationType: creationTypeInput.value as 'manual' | 'ai',
        provider: aiProviderInput.value,
        model: aiModelInput.value.trim(),
      });
      createPanel.classList.add('hidden');
    });
  }

  private bindMenuPanel(): void {
    const menuTitle = this.get<HTMLElement>('[data-menu-title]');
    const menuButtons = [...this.root.querySelectorAll<HTMLButtonElement>('[data-menu-tab]')];
    const menuSections = [...this.root.querySelectorAll<HTMLElement>('[data-menu-section]')];

    this.get<HTMLButtonElement>('[data-menu-open]').addEventListener('click', () => {
      this.menuOverlay.classList.remove('hidden');
    });

    this.get<HTMLButtonElement>('[data-menu-close]').addEventListener('click', () => {
      this.menuOverlay.classList.add('hidden');
    });

    this.menuOverlay.addEventListener('click', (event) => {
      if (event.target === this.menuOverlay) {
        this.menuOverlay.classList.add('hidden');
      }
    });

    menuButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.menuTab;
        menuButtons.forEach((entry) => entry.classList.toggle('active', entry === button));
        menuSections.forEach((section) => {
          section.classList.toggle('active', section.dataset.menuSection === key);
        });
        menuTitle.textContent = button.textContent ?? 'Menu';
      });
    });

    this.get<HTMLButtonElement>('[data-open-avatar-create]').addEventListener('click', () => {
      this.createPanel.classList.remove('hidden');
      this.menuOverlay.classList.add('hidden');
    });

    this.get<HTMLButtonElement>('[data-spawn-ai]').addEventListener('click', () => {
      this.callbacks.onSpawnAiAvatar();
      this.llmStatusLine.textContent = 'Spawned AI agent using current connection settings.';
    });

    this.get<HTMLButtonElement>('[data-apply-llm]').addEventListener('click', () => this.applyLlmConfig());
    this.get<HTMLButtonElement>('[data-check-llm]').addEventListener('click', () => {
      void this.checkLlmConnection();
    });
    this.get<HTMLButtonElement>('[data-lmstudio-native]').addEventListener('click', () => {
      this.setLlmFormPreset('lmstudio-rest');
    });
    this.get<HTMLButtonElement>('[data-lmstudio-openai]').addEventListener('click', () => {
      this.setLlmFormPreset('openai-compatible');
    });
    this.get<HTMLButtonElement>('[data-refresh-lmstudio-models]').addEventListener('click', () => {
      void this.refreshLmStudioModels();
    });
    this.get<HTMLSelectElement>('#llmProvider').addEventListener('change', () => this.refreshLlmEndpointHint());
    this.get<HTMLInputElement>('#llmBaseUrl').addEventListener('input', () => this.refreshLlmEndpointHint());

    this.avatarManagerList.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement | null)?.closest('[data-avatar-action]') as HTMLButtonElement | null;
      if (!button || button.disabled) {
        return;
      }

      const avatarId = button.dataset.avatarId;
      if (!avatarId) {
        return;
      }

      switch (button.dataset.avatarAction) {
        case 'view':
          this.callbacks.onSelectAvatar(avatarId, 'view');
          break;
        case 'control':
          this.callbacks.onSelectAvatar(avatarId, 'control');
          break;
        case 'assign-ai':
          this.callbacks.onAssignAi(avatarId);
          break;
        case 'disconnect-ai':
          this.callbacks.onDisconnectAi(avatarId);
          break;
        case 'delete':
          this.callbacks.onDeleteAvatar(avatarId);
          break;
      }
    });

    this.avatarManagerList.addEventListener('contextmenu', (event) => {
      const row = (event.target as HTMLElement | null)?.closest('[data-avatar-row-id]') as HTMLElement | null;
      const avatarId = row?.dataset.avatarRowId;
      if (!avatarId || !this.latestWorld) {
        return;
      }

      event.preventDefault();
      this.openAvatarPanel(this.latestWorld, avatarId);
    });
  }

  private bindAvatarPanel(): void {
    this.get<HTMLButtonElement>('[data-avatar-panel-close]').addEventListener('click', () => this.closeAvatarPanel());
    this.avatarPanel.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.avatarChatSendButton.addEventListener('click', () => {
      void this.sendAvatarChat();
    });
    this.avatarChatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.sendAvatarChat();
      }
    });

    const header = this.avatarPanel.querySelector<HTMLElement>('.avatar-panel-header');
    if (!header) {
      return;
    }

    let drag:
      | {
          pointerId: number;
          offsetX: number;
          offsetY: number;
        }
      | undefined;

    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.target as HTMLElement | null)?.closest('button')) {
        return;
      }

      const rect = this.avatarPanel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    header.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      this.positionAvatarPanel(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    });

    header.addEventListener('pointerup', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      header.releasePointerCapture(event.pointerId);
      drag = undefined;
    });
  }

  private positionAvatarPanel(x: number, y: number): void {
    const rect = this.avatarPanel.getBoundingClientRect();
    const panelWidth = rect.width || 360;
    const panelHeight = rect.height || 520;
    const maxX = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxY = Math.max(8, window.innerHeight - Math.min(panelHeight, window.innerHeight - 16) - 8);
    const left = Math.min(maxX, Math.max(8, x));
    const top = Math.min(maxY, Math.max(8, y));

    this.avatarPanel.style.left = `${left}px`;
    this.avatarPanel.style.top = `${top}px`;
    this.avatarPanel.style.right = 'auto';
  }

  private async sendAvatarChat(): Promise<void> {
    const avatarId = this.avatarPanelAvatarId;
    const message = this.avatarChatInput.value.trim();
    if (!avatarId || !message) {
      return;
    }

    this.appendAvatarChat(avatarId, { role: 'user', text: message });
    this.avatarChatInput.value = '';
    this.avatarChatSendButton.disabled = true;
    this.avatarChatStatus.textContent = 'Asking connected model...';

    try {
      const response = await this.callbacks.onAvatarChat(avatarId, message);
      this.setLlmConnectionState('connected', `LLM server: connected, chat succeeded with ${this.llmModel}`);
      this.appendAvatarChat(avatarId, { role: 'model', text: response });
      this.avatarChatStatus.textContent = 'Direct model chat. Simulation control inactive.';
      if (this.latestWorld) {
        this.refreshAvatarPanel(this.latestWorld);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown error';
      this.setLlmConnectionState('disconnected', `LLM server: disconnected, ${errorMessage}`);
      this.appendAvatarChat(avatarId, {
        role: 'system',
        text: `Model chat failed: ${errorMessage}`,
      });
      this.avatarChatStatus.textContent = 'Model chat failed.';
      if (this.latestWorld) {
        this.refreshAvatarPanel(this.latestWorld);
      }
    } finally {
      this.avatarChatSendButton.disabled = false;
    }
  }

  private appendAvatarChat(avatarId: string, entry: AvatarChatEntry): void {
    const history = this.avatarChatHistory.get(avatarId) ?? [];
    history.push(entry);
    this.avatarChatHistory.set(avatarId, history.slice(-20));
    this.refreshAvatarChatLog(avatarId);
  }

  private refreshAvatarChatLog(avatarId: string): void {
    const history = this.avatarChatHistory.get(avatarId) ?? [];
    if (history.length === 0) {
      this.avatarChatLog.innerHTML = '<div class="avatar-chat-empty">No direct chat yet.</div>';
      return;
    }

    this.avatarChatLog.innerHTML = history
      .map((entry) => {
        const label = entry.role === 'user' ? 'You' : entry.role === 'model' ? 'Model' : 'System';
        return `<div class="avatar-chat-entry ${entry.role}"><span>${label}</span><p>${escapeHtml(entry.text)}</p></div>`;
      })
      .join('');
    this.avatarChatLog.scrollTop = this.avatarChatLog.scrollHeight;
  }

  private applyLlmConfig(): void {
    const selectedProviderValue = this.get<HTMLSelectElement>('#llmProvider').value;
    const selectedProvider = isLlmProvider(selectedProviderValue) ? selectedProviderValue : DEFAULT_LM_STUDIO_CONFIG.provider;
    const baseUrlInput = this.get<HTMLInputElement>('#llmBaseUrl');
    const provider = shouldPreferLmStudioRest(selectedProvider, baseUrlInput.value) ? 'lmstudio-rest' : selectedProvider;
    const baseUrl = normalizeLlmBaseUrl(baseUrlInput.value || DEFAULT_LM_STUDIO_CONFIG.baseUrl, provider);
    const model = this.get<HTMLInputElement>('#llmModel').value.trim() || DEFAULT_LM_STUDIO_CONFIG.model;
    const apiKey = this.get<HTMLInputElement>('#llmApiKey').value.trim() || DEFAULT_LM_STUDIO_CONFIG.apiKey;

    this.llmProvider = provider;
    this.llmBaseUrl = baseUrl;
    this.llmModel = model ?? 'local-model';
    this.llmApiKey = apiKey ?? 'not-needed';
    baseUrlInput.value = this.llmBaseUrl;
    this.get<HTMLSelectElement>('#llmProvider').value = this.llmProvider;

    try {
      window.localStorage.setItem(LLM_STORAGE_KEYS.provider, this.llmProvider);
      window.localStorage.setItem(LLM_STORAGE_KEYS.baseUrl, this.llmBaseUrl);
      window.localStorage.setItem(LLM_STORAGE_KEYS.model, this.llmModel);
      window.localStorage.setItem(LLM_STORAGE_KEYS.apiKey, this.llmApiKey);
    } catch {
      this.llmStatusLine.textContent = 'Connection applied, but browser storage was unavailable.';
    }

    this.callbacks.onLlmConfigChange({
      provider: this.llmProvider,
      baseUrl: this.llmBaseUrl,
      model: this.llmModel,
      apiKey: this.llmApiKey,
      temperature: DEFAULT_LM_STUDIO_CONFIG.temperature,
      maxTokens: DEFAULT_LM_STUDIO_CONFIG.maxTokens,
      timeoutMs: DEFAULT_LM_STUDIO_CONFIG.timeoutMs,
    });
    this.llmStatusLine.textContent = `Configured: ${this.llmProvider} / ${this.llmModel}. Checking server...`;
    this.refreshLlmEndpointHint();
    void this.checkLlmConnection();
  }

  private setLlmFormPreset(provider: Extract<LLMProviderConfig['provider'], 'lmstudio-rest' | 'openai-compatible'>): void {
    const providerInput = this.get<HTMLSelectElement>('#llmProvider');
    const baseUrlInput = this.get<HTMLInputElement>('#llmBaseUrl');
    const apiKeyInput = this.get<HTMLInputElement>('#llmApiKey');

    providerInput.value = provider;
    baseUrlInput.value = provider === 'lmstudio-rest' ? LM_STUDIO_REST_BASE_URL : LM_STUDIO_OPENAI_BASE_URL;
    apiKeyInput.value = 'not-needed';
    this.refreshLlmEndpointHint();
  }

  private refreshLlmEndpointHint(): void {
    const providerValue = this.get<HTMLSelectElement>('#llmProvider').value;
    const provider = isLlmProvider(providerValue) ? providerValue : DEFAULT_LM_STUDIO_CONFIG.provider;
    const baseUrl = normalizeLlmBaseUrl(this.get<HTMLInputElement>('#llmBaseUrl').value, provider);
    const endpoint =
      provider === 'lmstudio-rest'
        ? `${baseUrl || LM_STUDIO_REST_BASE_URL}/api/v1/chat`
        : `${baseUrl || LM_STUDIO_OPENAI_BASE_URL}/chat/completions`;

    this.llmEndpointLine.textContent = `Endpoint: ${endpoint}`;
    this.setLlmConnectionState('unchecked', 'LLM server: not verified');
  }

  private refreshLlmSimulationStatus(): void {
    this.llmSimulationLine.className = 'llm-simulation-state disconnected';
    this.llmSimulationLine.textContent = 'Simulation link: inactive, avatar behavior engine removed';
  }

  private maybeAutoCheckLlmConnection(world: WorldState): void {
    const hasAiBrain = [...world.avatars.values()].some(
      (avatar) => !avatar.shutdown && (avatar.control === 'ai' || avatar.inhabitedByAi) && !!avatar.brainId,
    );
    if (!hasAiBrain || this.llmCheckInFlight) {
      return;
    }

    const now = performance.now();
    if (now - this.lastLlmAutoCheckAt < 10000) {
      return;
    }

    this.lastLlmAutoCheckAt = now;
    this.llmCheckInFlight = true;
    void this.checkLlmConnection({ quiet: true }).finally(() => {
      this.llmCheckInFlight = false;
      if (this.latestWorld) {
        this.refreshAvatarPanel(this.latestWorld);
      }
    });
  }

  private setLlmConnectionState(state: LlmConnectionState, message: string): void {
    this.llmConnectionState = state;
    this.llmConnectionLine.className = `llm-connection-state ${state}`;
    this.llmConnectionLine.textContent = message;
  }

  private async checkLlmConnection(options: { quiet?: boolean } = {}): Promise<boolean> {
    const providerValue = this.get<HTMLSelectElement>('#llmProvider').value;
    const provider = isLlmProvider(providerValue) ? providerValue : DEFAULT_LM_STUDIO_CONFIG.provider;
    const baseUrl = normalizeLlmBaseUrl(this.get<HTMLInputElement>('#llmBaseUrl').value || DEFAULT_LM_STUDIO_CONFIG.baseUrl, provider);
    const model = this.get<HTMLInputElement>('#llmModel').value.trim();
    const apiKey = this.get<HTMLInputElement>('#llmApiKey').value.trim();
    const listUrl = provider === 'lmstudio-rest' ? `${baseUrl || LM_STUDIO_REST_BASE_URL}/api/v1/models` : `${baseUrl || LM_STUDIO_OPENAI_BASE_URL}/models`;
    const headers: Record<string, string> = {};

    if (provider === 'openai-compatible' && apiKey && apiKey !== 'not-needed') {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    if (!options.quiet) {
      this.setLlmConnectionState('checking', 'LLM server: checking...');
    }

    try {
      const response = await fetch(listUrl, { headers });
      if (!response.ok) {
        this.setLlmConnectionState('disconnected', `LLM server: disconnected, HTTP ${response.status}`);
        this.llmStatusLine.textContent = `Configured: ${provider} / ${model || 'no model'}. Server not reachable.`;
        return false;
      }

      const data = (await response.json()) as LMStudioModelListResponse & { data?: Array<{ id?: string }> };
      const modelKeys = provider === 'lmstudio-rest'
        ? (data.models ?? []).map((entry) => entry.key).filter(Boolean)
        : (data.data ?? []).map((entry) => entry.id).filter(Boolean);
      const modelKnown = model ? modelKeys.includes(model) : false;
      const modelNote = modelKnown ? `model found: ${model}` : model ? `server reachable, model not confirmed: ${model}` : 'server reachable';

      this.setLlmConnectionState('connected', `LLM server: connected, ${modelNote}`);
      this.llmStatusLine.textContent = `Configured: ${provider} / ${model || 'no model'}. Server connected. Simulation link inactive.`;
      return true;
    } catch (error) {
      this.setLlmConnectionState('disconnected', `LLM server: disconnected, ${error instanceof Error ? error.message : 'unknown error'}`);
      this.llmStatusLine.textContent = `Configured: ${provider} / ${model || 'no model'}. Server not reachable.`;
      return false;
    }
  }

  private async refreshLmStudioModels(): Promise<void> {
    const baseUrlInput = this.get<HTMLInputElement>('#llmBaseUrl');
    const modelInput = this.get<HTMLInputElement>('#llmModel');
    const baseUrl = normalizeLlmBaseUrl(baseUrlInput.value || LM_STUDIO_REST_BASE_URL, 'lmstudio-rest').replace(/\/v1\/?$/, '');
    baseUrlInput.value = baseUrl;

    this.llmStatusLine.textContent = 'Checking LM Studio models...';
    this.setLlmConnectionState('checking', 'LLM server: checking LM Studio models...');

    try {
      const response = await fetch(`${baseUrl}/api/v1/models`);
      if (!response.ok) {
        this.llmStatusLine.textContent = `Model check failed: HTTP ${response.status}.`;
        this.setLlmConnectionState('disconnected', `LLM server: disconnected, HTTP ${response.status}`);
        return;
      }

      const data = (await response.json()) as LMStudioModelListResponse;
      const llms = (data.models ?? []).filter((model) => model.type === 'llm' && model.key);
      if (llms.length === 0) {
        this.llmModelsList.innerHTML = '<span>No local LLMs found.</span>';
        this.llmStatusLine.textContent = 'LM Studio reachable, but no LLM models were listed.';
        this.setLlmConnectionState('connected', 'LLM server: connected, no LLM models listed');
        return;
      }

      const loaded = llms.find((model) => (model.loaded_instances?.length ?? 0) > 0) ?? llms[0];
      if (loaded.key) {
        modelInput.value = loaded.key;
      }

      this.llmModelsList.innerHTML = llms
        .map((model) => {
          const loadedLabel = (model.loaded_instances?.length ?? 0) > 0 ? 'READY' : 'available';
          const features = [
            model.params_string,
            model.capabilities?.vision ? 'vision' : undefined,
            model.capabilities?.trained_for_tool_use ? 'tools' : undefined,
          ]
            .filter(Boolean)
            .join(' / ');
          return `<button data-model-key="${escapeAttribute(model.key ?? '')}">${escapeHtml(model.display_name ?? model.key ?? 'Model')} <span>${loadedLabel}${features ? ` · ${escapeHtml(features)}` : ''}</span></button>`;
        })
        .join('');

      this.llmModelsList.querySelectorAll<HTMLButtonElement>('[data-model-key]').forEach((button) => {
        button.addEventListener('click', () => {
          modelInput.value = button.dataset.modelKey ?? modelInput.value;
        });
      });
      this.applyButtonTooltips(this.llmModelsList);

      this.llmStatusLine.textContent = `LM Studio reachable. Selected ${loaded.key}. Simulation link inactive.`;
      this.setLlmConnectionState('connected', `LLM server: connected, selected ${loaded.key}`);
    } catch (error) {
      this.llmStatusLine.textContent = `Model check failed: ${error instanceof Error ? error.message : 'Unknown error'}.`;
      this.setLlmConnectionState('disconnected', `LLM server: disconnected, ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private bindHud(): void {
    this.buildToggleButton.addEventListener('click', () => this.toggleBuildPanel());
    this.avatarQuickSelect.addEventListener('change', () => {
      if (this.avatarQuickSelect.value) {
        this.callbacks.onSelectAvatar(this.avatarQuickSelect.value, 'control');
      }
    });

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
      saveStorageValue(CONTROL_STORAGE_KEYS.avatarWalkSpeed, value.toFixed(1));
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
    this.bindSlider('#ambientVolume', '[data-ambient-volume-value]', (value) => {
      this.ambientVolume = value;
      this.ambientAudio.setVolume(value / 100);
    });
    this.bindSlider('#teslaNodeVolume', '[data-tesla-node-volume-value]', (value) => {
      this.teslaNodeVolume = value;
      this.teslaNodeAudio.setVolumeScale(value / 50);
    });

    const ambientToggle = this.get<HTMLInputElement>('#ambientMusic');
    ambientToggle.addEventListener('change', () => {
      this.ambientEnabled = ambientToggle.checked;
      this.ambientAudio.setEnabled(this.ambientEnabled);
    });
    const teslaNodeSoundToggle = this.get<HTMLInputElement>('#teslaNodeSound');
    teslaNodeSoundToggle.addEventListener('change', () => {
      this.teslaNodeSoundEnabled = teslaNodeSoundToggle.checked;
      this.teslaNodeAudio.setEnabled(this.teslaNodeSoundEnabled);
    });

    this.bindToggle('[data-orbit-horizontal-toggle]', (active) => {
      this.orbitHorizontalInverted = active;
      saveStorageValue(CONTROL_STORAGE_KEYS.orbitHorizontalInverted, String(active));
      return active ? 'L/R inverted' : 'L/R normal';
    });
    this.bindToggle('[data-orbit-vertical-toggle]', (active) => {
      this.orbitVerticalInverted = active;
      saveStorageValue(CONTROL_STORAGE_KEYS.orbitVerticalInverted, String(active));
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

  private bindManualPanel(): void {
    const tabs = [...this.root.querySelectorAll<HTMLButtonElement>('[data-manual-tab]')];
    const sections = [...this.root.querySelectorAll<HTMLElement>('[data-manual-section]')];

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.manualTab;
        tabs.forEach((entry) => entry.classList.toggle('active', entry === tab));
        sections.forEach((section) => {
          section.classList.toggle('active', section.dataset.manualSection === key);
        });
      });
    });
  }

  private bindWorldLogTabs(): void {
    this.worldLogTabs.forEach((tab) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextTab = tab.dataset.worldLogTab as WorldLogTab | undefined;
        if (!nextTab) {
          return;
        }
        this.activeWorldLogTab = nextTab;
        this.worldLogTabs.forEach((entry) => entry.classList.toggle('active', entry === tab));
        this.worldLogSignature = '';
        this.worldLogFilterSignature = '';
        this.closeWorldLogFilters();
      });
    });

    this.worldLogPanel.addEventListener('contextmenu', (event) => {
      if (this.worldLogFilters.contains(event.target as Node)) {
        return;
      }
      if (this.activeWorldLogTab === 'system' || this.worldLogAgentFilters.size === 0) {
        return;
      }

      event.preventDefault();
      this.openWorldLogFilters(event);
    });

    this.worldLogFilters.addEventListener('change', (event) => {
      const input = (event.target as HTMLElement | null)?.closest('input[type="checkbox"]') as HTMLInputElement | null;
      if (!input) {
        return;
      }

      if (input.dataset.worldLogFilterAll !== undefined) {
        this.worldLogAgentFilters.forEach((_enabled, avatarId) => {
          this.worldLogAgentFilters.set(avatarId, input.checked);
        });
      } else if (input.dataset.worldLogFilter) {
        this.worldLogAgentFilters.set(input.dataset.worldLogFilter, input.checked);
      }

      this.worldLogSignature = '';
      this.worldLogFilterSignature = '';
    });

    document.addEventListener('pointerdown', (event) => {
      const target = event.target as Node | null;
      if (!target || this.worldLogPanel.contains(target)) {
        return;
      }
      this.closeWorldLogFilters();
    });
  }

  private openWorldLogFilters(event?: MouseEvent): void {
    if (this.activeWorldLogTab === 'system' || this.worldLogAgentFilters.size === 0) {
      return;
    }

    if (event) {
      const rect = this.worldLogPanel.getBoundingClientRect();
      const left = Math.min(Math.max(8, event.clientX - rect.left), Math.max(8, rect.width - 168));
      const top = Math.min(Math.max(34, event.clientY - rect.top), Math.max(34, rect.height - 36));
      this.worldLogFilters.style.left = `${left}px`;
      this.worldLogFilters.style.top = `${top}px`;
      this.worldLogFilters.style.right = 'auto';
    } else {
      this.worldLogFilters.style.left = '';
      this.worldLogFilters.style.top = '';
      this.worldLogFilters.style.right = '';
    }

    this.worldLogFilters.classList.add('open');
  }

  private closeWorldLogFilters(): void {
    this.worldLogFilters.classList.remove('open');
  }

  private bindWorldLogDrag(): void {
    const summary = this.worldLogPanel.querySelector('summary');
    if (!summary) {
      return;
    }

    this.restoreWorldLogPosition();

    let drag:
      | {
          pointerId: number;
          startX: number;
          startY: number;
          offsetX: number;
          offsetY: number;
          moved: boolean;
        }
      | undefined;
    let suppressNextClick = false;

    summary.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }

      const rect = this.worldLogPanel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false,
      };
      summary.setPointerCapture(event.pointerId);
    });

    summary.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const dx = Math.abs(event.clientX - drag.startX);
      const dy = Math.abs(event.clientY - drag.startY);
      if (dx + dy < 4 && !drag.moved) {
        return;
      }

      drag.moved = true;
      event.preventDefault();
      this.positionWorldLog(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    });

    summary.addEventListener('pointerup', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      if (drag.moved) {
        event.preventDefault();
        this.saveWorldLogPosition();
        suppressNextClick = true;
      }

      summary.releasePointerCapture(event.pointerId);
      drag = undefined;
    });

    summary.addEventListener('click', (event) => {
      if (suppressNextClick) {
        event.preventDefault();
        suppressNextClick = false;
      }
    });
  }

  private restoreWorldLogPosition(): void {
    try {
      const raw = window.localStorage.getItem(WORLD_LOG_POSITION_KEY);
      if (!raw) {
        return;
      }

      const position = JSON.parse(raw) as { x?: number; y?: number };
      if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
        this.positionWorldLog(Number(position.x), Number(position.y));
      }
    } catch {
      // Ignore malformed saved UI coordinates.
    }
  }

  private saveWorldLogPosition(): void {
    const rect = this.worldLogPanel.getBoundingClientRect();
    try {
      window.localStorage.setItem(WORLD_LOG_POSITION_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
    } catch {
      // Non-essential preference.
    }
  }

  private positionWorldLog(x: number, y: number): void {
    const rect = this.worldLogPanel.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width - 8);
    const maxY = Math.max(0, window.innerHeight - 38);
    const left = Math.min(maxX, Math.max(8, x));
    const top = Math.min(maxY, Math.max(8, y));

    this.worldLogPanel.classList.add('user-positioned');
    this.worldLogPanel.style.left = `${left}px`;
    this.worldLogPanel.style.top = `${top}px`;
  }

  private refreshBuildPanel(): void {
    this.buildPanel.classList.toggle('open', this.buildOpen);
    this.root.classList.toggle('build-open', this.buildOpen);
    this.buildToggleButton.classList.toggle('active', this.buildOpen);
    this.buildToggleButton.textContent = this.buildOpen ? 'Build On' : 'Build';
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
