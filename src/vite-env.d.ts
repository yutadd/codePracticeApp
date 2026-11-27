/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 静的配信版（vite build --mode static）なら true */
  readonly STATIC_ONLY: boolean;
}
