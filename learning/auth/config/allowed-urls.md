# Allowed URLs

The config object you pass to `bridgeBootstrap`:

```typescript
interface BridgeConfig {
  /** Base URL for the Bridge API. All endpoints are derived from this.
   *  @default 'https://api.thebridge.dev' */
  apiBaseUrl?: string;

  /** Base URL for the Bridge hosted UI (login page, plan selection, etc.).
   *  @default 'https://auth.thebridge.dev' */
  hostedUrl?: string;
}
```
