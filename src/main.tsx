import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TipHost } from "./tip";
import { DialogProvider } from "./ui";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DialogProvider>
      <App />
      <TipHost />
    </DialogProvider>
  </React.StrictMode>,
);
