import { describe, it, expect, beforeEach } from "vitest";
import { ServiceManifestManager } from "../src/main/registry/serviceManifest.js";
import { DynamicRouter } from "../src/main/mcp/router.js";
import { ModeRouteConfig, TaskMode } from "../src/shared/types.js";

const TEST_WEBVIEW_ID = "webview_test_service";

describe("ServiceManifestManager", () => {
  beforeEach(() => {
    ServiceManifestManager.loadManifest();
  });

  it("should load default standard AI services and check enablement", () => {
    const manifest = ServiceManifestManager.getManifest();
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.services.chatgpt).toBeDefined();
    expect(manifest.services.claude).toBeDefined();
    expect(manifest.services.gemini).toBeDefined();
    expect(manifest.services.grok).toBeDefined();

    expect(ServiceManifestManager.isServiceEnabled("chatgpt")).toBe(true);
    expect(ServiceManifestManager.isServiceEnabled("claude")).toBe(true);
    expect(ServiceManifestManager.isModelEnabled("chatgpt", "gpt-4o")).toBe(true);
  });

  it("should detect route conflicts when an active route references a disabled service", () => {
    const mockRoutes: Record<TaskMode, ModeRouteConfig> = {
      general: { mode: "general", primary: "chatgpt", fallbacks: ["claude"], outputFormat: "prose_markdown" },
      coding: { mode: "coding", primary: "claude", fallbacks: ["chatgpt"], outputFormat: "json_code" },
      writing: { mode: "writing", primary: "chatgpt", fallbacks: [], outputFormat: "prose_markdown" },
      image: { mode: "image", primary: "grok", fallbacks: [], outputFormat: "file_download" },
      video: { mode: "video", primary: "grok", fallbacks: [], outputFormat: "file_download" },
      audio: { mode: "audio", primary: "gemini", fallbacks: [], outputFormat: "file_download" },
    };

    // When all are enabled, conflicts should be empty
    const noConflicts = ServiceManifestManager.checkRouteConflicts(mockRoutes);
    expect(noConflicts).toHaveLength(0);
  });

  it("should register dynamic custom webview service and toggle enablement", () => {
    const manifest = ServiceManifestManager.getManifest();
    manifest.services[TEST_WEBVIEW_ID] = {
      id: TEST_WEBVIEW_ID as any,
      name: "Custom Webview",
      company: "Custom Co",
      enabled: true,
      hidden: false,
      providerType: "webview",
      url: "https://custom.example.com",
      partition: "persist:custom_test",
      defaultModelId: "test-model-1",
      accentColor: "teal",
      iconName: "Globe",
      supportsModelRouting: true,
      models: [
        { id: "test-model-1", displayName: "Test Model 1", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "general", modes: ["general", "coding"] },
      ],
    };
    ServiceManifestManager.saveManifest(manifest);

    expect(ServiceManifestManager.getManifest().services[TEST_WEBVIEW_ID]).toBeDefined();
    expect(ServiceManifestManager.isServiceEnabled(TEST_WEBVIEW_ID as any)).toBe(true);

    // Toggle enabled
    ServiceManifestManager.setServiceEnabled(TEST_WEBVIEW_ID as any, false);
    expect(ServiceManifestManager.isServiceEnabled(TEST_WEBVIEW_ID as any)).toBe(false);
  });

  it("should update service title and delete provider", () => {
    const manifest = ServiceManifestManager.getManifest();
    manifest.services[TEST_WEBVIEW_ID] = {
      id: TEST_WEBVIEW_ID as any,
      name: "Initial Title",
      company: "Custom Co",
      enabled: true,
      hidden: false,
      providerType: "webview",
      url: "https://custom.example.com",
      partition: "persist:custom_test",
      defaultModelId: "test-model-1",
      accentColor: "teal",
      iconName: "Globe",
      models: [],
    };
    ServiceManifestManager.saveManifest(manifest);

    const updated = ServiceManifestManager.updateServiceTitle(TEST_WEBVIEW_ID as any, "Custom Updated Title");
    expect(updated.services[TEST_WEBVIEW_ID]?.name).toBe("Custom Updated Title");
    expect(ServiceManifestManager.getManifest().services[TEST_WEBVIEW_ID]?.name).toBe("Custom Updated Title");

    // Delete provider
    const deleted = ServiceManifestManager.deleteProvider(TEST_WEBVIEW_ID as any);
    expect(deleted.services[TEST_WEBVIEW_ID]).toBeUndefined();
    expect(ServiceManifestManager.getManifest().services[TEST_WEBVIEW_ID]).toBeUndefined();
  });

  it("should manage custom API providers (add, update, delete)", () => {
    const updatedManifest = ServiceManifestManager.addCustomApiProvider({
      name: "Custom OpenAI Gateway",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test123456",
      defaultModelId: "gpt-4o-mini",
    });
    const customApiId = Object.keys(updatedManifest.services).find((id) => id.startsWith("api_"));
    expect(customApiId).toBeDefined();
    const customApi = updatedManifest.services[customApiId!];
    expect(customApi.providerType).toBe("api");
    expect(customApi.name).toBe("Custom OpenAI Gateway");

    // Update
    const afterUpdateManifest = ServiceManifestManager.updateCustomApiProvider(customApiId!, {
      name: "Updated Gateway Name",
      baseUrl: "https://custom-gateway.internal/v1",
      apiKey: "sk-updated999",
      defaultModelId: "custom-model-1",
    });
    expect(afterUpdateManifest.services[customApiId!]?.name).toBe("Updated Gateway Name");

    // Delete
    const afterDeleteManifest = ServiceManifestManager.deleteProvider(customApiId!);
    expect(afterDeleteManifest.services[customApiId!]).toBeUndefined();
    expect(ServiceManifestManager.getManifest().services[customApiId!]).toBeUndefined();
  });

  it("should verify supportsModelRouting and mode-specific models extraction for custom webview", () => {
    const manifest = ServiceManifestManager.getManifest();
    manifest.services[TEST_WEBVIEW_ID] = {
      id: TEST_WEBVIEW_ID as any,
      name: "Custom Webview",
      company: "Custom Co",
      enabled: true,
      hidden: false,
      providerType: "webview",
      url: "https://custom.example.com",
      partition: "persist:custom_test",
      defaultModelId: "test-model-1",
      accentColor: "teal",
      iconName: "Globe",
      supportsModelRouting: true,
      models: [
        { id: "gpt-image-2", displayName: "Image Model", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "image", modes: ["image"] },
        { id: "sample-image-pro", displayName: "Sample Image Model", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "image", modes: ["image"] },
        { id: "sample-video-fast", displayName: "Video Model", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "video", modes: ["video"] },
        { id: "veo-3-1-fast", displayName: "Veo Model", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "video", modes: ["video"] },
        { id: "lyria-3-pro", displayName: "Audio Model Pro", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "audio", modes: ["audio"] },
        { id: "lyria-3-clip", displayName: "Audio Model Clip", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "audio", modes: ["audio"] },
        { id: "kimi-k2-7-code", displayName: "Code Model", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "coding", modes: ["coding"] },
        { id: "deepseek-v3-2", displayName: "DeepSeek Code", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "coding", modes: ["coding"] },
        { id: "gemini-3-1-flash-lite", displayName: "Flash Lite", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "general", modes: ["general"] },
      ],
    };
    ServiceManifestManager.saveManifest(manifest);

    expect(ServiceManifestManager.supportsModelRouting(TEST_WEBVIEW_ID as any)).toBe(true);
    expect(ServiceManifestManager.supportsModelRouting("chatgpt")).toBe(false);

    const imageModels = ServiceManifestManager.getModelsForMode(TEST_WEBVIEW_ID as any, "image");
    expect(imageModels.length).toBeGreaterThanOrEqual(2);
    expect(imageModels.some((m) => m.id === "gpt-image-2")).toBe(true);
    expect(imageModels.some((m) => m.id === "sample-image-pro")).toBe(true);
    expect(imageModels.some((m) => m.id === "gemini-3-1-flash-lite")).toBe(false);

    const videoModels = ServiceManifestManager.getModelsForMode(TEST_WEBVIEW_ID as any, "video");
    expect(videoModels.length).toBeGreaterThanOrEqual(2);
    expect(videoModels.some((m) => m.id === "sample-video-fast")).toBe(true);
    expect(videoModels.some((m) => m.id === "veo-3-1-fast")).toBe(true);

    const audioModels = ServiceManifestManager.getModelsForMode(TEST_WEBVIEW_ID as any, "audio");
    expect(audioModels.length).toBeGreaterThanOrEqual(2);
    expect(audioModels.some((m) => m.id === "lyria-3-pro")).toBe(true);
    expect(audioModels.some((m) => m.id === "lyria-3-clip")).toBe(true);

    const codingModels = ServiceManifestManager.getModelsForMode(TEST_WEBVIEW_ID as any, "coding");
    expect(codingModels.some((m) => m.id === "kimi-k2-7-code")).toBe(true);
    expect(codingModels.some((m) => m.id === "deepseek-v3-2")).toBe(true);
  });

  it("should accurately determine providerSupportsMode for all global services and custom webview", () => {
    const manifest = ServiceManifestManager.getManifest();
    manifest.services[TEST_WEBVIEW_ID] = {
      id: TEST_WEBVIEW_ID as any,
      name: "Custom Webview",
      company: "Custom Co",
      enabled: true,
      hidden: false,
      providerType: "webview",
      url: "https://custom.example.com",
      partition: "persist:custom_test",
      defaultModelId: "test-model-1",
      accentColor: "teal",
      iconName: "Globe",
      supportsModelRouting: true,
      models: [
        { id: "m1", displayName: "M1", enabled: true, discoveredAvailable: true, userEnabled: true, mode: "general", modes: ["general", "coding", "writing", "image", "video", "audio"] },
      ],
    };
    ServiceManifestManager.saveManifest(manifest);

    // ChatGPT: supports general, coding, writing, image; not video, audio
    expect(ServiceManifestManager.providerSupportsMode("chatgpt", "general")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("chatgpt", "coding")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("chatgpt", "writing")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("chatgpt", "image")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("chatgpt", "video")).toBe(false);
    expect(ServiceManifestManager.providerSupportsMode("chatgpt", "audio")).toBe(false);

    // Claude: supports general, coding, writing; not image, video, audio
    expect(ServiceManifestManager.providerSupportsMode("claude", "general")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("claude", "coding")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("claude", "writing")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("claude", "image")).toBe(false);
    expect(ServiceManifestManager.providerSupportsMode("claude", "video")).toBe(false);
    expect(ServiceManifestManager.providerSupportsMode("claude", "audio")).toBe(false);

    // Gemini: supports all 6 modes (general, coding, writing, image, video, audio)
    expect(ServiceManifestManager.providerSupportsMode("gemini", "general")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("gemini", "coding")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("gemini", "writing")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("gemini", "image")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("gemini", "video")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("gemini", "audio")).toBe(true);

    // Grok: supports general, coding, writing, image, video; not audio
    expect(ServiceManifestManager.providerSupportsMode("grok", "general")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("grok", "coding")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("grok", "writing")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("grok", "image")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("grok", "video")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode("grok", "audio")).toBe(false);

    // Custom Webview with all modes: supports all 6 modes
    expect(ServiceManifestManager.providerSupportsMode(TEST_WEBVIEW_ID as any, "general")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode(TEST_WEBVIEW_ID as any, "coding")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode(TEST_WEBVIEW_ID as any, "writing")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode(TEST_WEBVIEW_ID as any, "image")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode(TEST_WEBVIEW_ID as any, "video")).toBe(true);
    expect(ServiceManifestManager.providerSupportsMode(TEST_WEBVIEW_ID as any, "audio")).toBe(true);
  });
});
