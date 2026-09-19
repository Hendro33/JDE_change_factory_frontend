/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "false" switches from the mock service to the real backend API. Any other value (or unset) keeps the mock -- nothing breaks without a .env file. */
  readonly VITE_USE_MOCK_API?: string;
  /** Base URL of the FastAPI service. Defaults to http://localhost:8000 if unset. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
