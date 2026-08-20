import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary fallbackTitle="Trading Flow Execution Fault">
    <App />
  </ErrorBoundary>
);
