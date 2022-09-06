import {createRoot} from "react-dom/client";
import WebView from "./webview";

// @ts-ignore
__webpack_nonce__ = window.VS_NONCE;

const container = document.getElementById("taipy-web-root")
if (container) {
    createRoot(container).render(<WebView />);
}