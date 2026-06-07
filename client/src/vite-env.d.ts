/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Colyseus server endpoint, e.g. ws://localhost:2567 or wss://<domain>/colyseus. */
  readonly VITE_SERVER_URL?: string;
  /** Donation link (Ko-fi), e.g. https://ko-fi.com/yourname. */
  readonly VITE_KOFI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
