import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DeleteProviderModal } from '../src/renderer/components/DeleteProviderModal.js';
import { ServicesManifest } from '../src/shared/types.js';

describe('DeleteProviderModal Component', () => {
  const mockManifest: ServicesManifest = {
    version: '1.0',
    services: {
      custom_api_test: {
        id: 'custom_api_test' as any,
        name: 'Test API Provider',
        company: 'Custom AI Inc',
        enabled: true,
        hidden: false,
        experimental: false,
        providerType: 'api',
        supportsModelRouting: true,
      },
      webview_custom_model: {
        id: 'webview_custom_model' as any,
        name: 'Custom Webview AI',
        company: 'Custom Web Inc',
        enabled: true,
        hidden: false,
        experimental: true,
        providerType: 'webview',
        supportsModelRouting: true,
      },
    },
  };

  it('should render confirmation modal for custom API provider', () => {
    const html = renderToString(
      React.createElement(DeleteProviderModal, {
        providerId: 'custom_api_test' as any,
        providerName: 'Test API Provider',
        isWebview: false,
        servicesManifest: mockManifest,
        isDeleting: false,
        onConfirm: () => {},
        onClose: () => {},
      })
    );

    expect(html).toContain('Remove Provider');
    expect(html).toContain('Test API Provider');
    expect(html).toContain('custom_api_test');
    expect(html).toContain('Custom API');
    expect(html).toContain('Permanent Deletion');
    expect(html).toContain('This action cannot be undone');
    expect(html).toContain('Cancel');
  });

  it('should render confirmation modal for custom Webview provider', () => {
    const html = renderToString(
      React.createElement(DeleteProviderModal, {
        providerId: 'webview_custom_model' as any,
        providerName: 'Custom Webview AI',
        isWebview: true,
        servicesManifest: mockManifest,
        isDeleting: false,
        onConfirm: () => {},
        onClose: () => {},
      })
    );

    expect(html).toContain('Remove Provider');
    expect(html).toContain('Custom Webview AI');
    expect(html).toContain('webview_custom_model');
    expect(html).toContain('Webview Provider');
    expect(html).toContain('Permanent Deletion');
  });

  it('should show loading spinner and text when isDeleting is true', () => {
    const html = renderToString(
      React.createElement(DeleteProviderModal, {
        providerId: 'webview_custom_model' as any,
        providerName: 'Custom Webview AI',
        isWebview: true,
        servicesManifest: mockManifest,
        isDeleting: true,
        onConfirm: () => {},
        onClose: () => {},
      })
    );

    expect(html).toContain('Removing...');
  });
});
