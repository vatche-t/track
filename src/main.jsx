import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthGate } from "./features/AuthGate.jsx";
import { AppStyles } from "./styles/AppStyles.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppStyles />
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
);
