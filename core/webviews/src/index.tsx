import { createRoot } from "react-dom/client";
import { config } from "@vscode/l10n";

import { containerId } from "../../shared/views";
import WebView from "./webview";

// @ts-ignore
__webpack_nonce__ = document.currentScript?.nonce;

declare global {
  interface Window {
      taipyConfig: {
          icons: Record<string, string>;
          l10nUri?: string;
      };
      [key: string]: unknown;
  }
}

window.taipyConfig.l10nUri && config({uri: window.taipyConfig.l10nUri});

const container = document.getElementById(containerId);
if (container) {
  createRoot(container).render(<WebView />);
}
