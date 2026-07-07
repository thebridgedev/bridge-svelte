# Callback URLs

The config object you pass to `bridgeBootstrap`:

```typescript
interface BridgeConfig {
  /** Where the login flow redirects back to.
   *  @default `${window.location.origin}/auth/oauth-callback` */
  callbackUrl?: string;

  /** Route to redirect to after login. @default '/' */
  defaultRedirectRoute?: string;
}
```
