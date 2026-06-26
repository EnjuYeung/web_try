import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/open-sans";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/noto-sans-jp";
import "@fontsource-variable/noto-sans-kr";
import "@fontsource-variable/noto-sans-tc";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
