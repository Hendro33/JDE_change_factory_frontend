/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the FastAPI service. Defaults to http://localhost:8000 if unset. */
  readonly VITE_API_BASE_URL?: string;
}

declare const __BUILD_COMMIT__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
