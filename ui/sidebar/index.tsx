/// <reference lib="dom" />

import "../shared.scss";

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("root");
  if (container) {
    createRoot(container).render(<App />);
  }
});
