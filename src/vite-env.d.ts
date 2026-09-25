/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" switches to the in-browser sample data (clearly labelled). Unset or anything else: the real backend. */
  readonly VITE_USE_MOCK_API?: string;
  /** Base URL of the FastAPI service. Defaults to http://localhost:8000 if unset. */
  readonly VITE_API_BASE_URL?: string;
}

declare const __BUILD_COMMIT__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
