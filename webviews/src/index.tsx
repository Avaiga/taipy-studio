import { createRoot } from "react-dom/client";

import { containerId } from "../../shared/views";
import WebView from "./webview";

// @ts-ignore
__webpack_nonce__ = document.currentScript?.nonce;

const container = document.getElementById(containerId);
if (container) {
  createRoot(container).render(<WebView />);
}
