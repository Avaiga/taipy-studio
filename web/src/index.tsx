import {createRoot} from "react-dom/client";
import WebView from "./webview";

const container = document.getElementById("taipy-web-root")
if (container) {
    createRoot(container).render(<WebView />);
}