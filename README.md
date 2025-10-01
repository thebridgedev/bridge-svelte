# Bridge Svelte Demo & Library Documentation

This repository contains both bridge Bridge Svelte library and a demo application showcasing its features.

## Quick Links
- [Quickstart Guide](learning/quickstart.md) - Get started quickly with Bridge in your Svelte application
- [Examples](learning/examples.md) - Detailed examples of Bridge features

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Aubridgentication](#aubridgentication)
- [Feature Flags](#feature-flags)
- [Demo Application](#demo-application)

## Installation

```bash
npm install @bridge/svelte
```

## Configuration

For detailed configuration instructions, see bridge [Quickstart Guide](learning/quickstart.md).

### Environment Variables

The following environment variables can be configured:

```env
VITE_BRIDGE_APP_ID=your_app_id
VITE_BRIDGE_AUTH_BASE_URL=https://auth.nblocks.cloud
VITE_BRIDGE_BACKENDLESS_BASE_URL=https://backendless.nblocks.cloud
VITE_BRIDGE_CALLBACK_URL=your_callback_url
VITE_BRIDGE_TEAM_MANAGEMENT_URL=https://backendless.nblocks.cloud/user-management-portal/users
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/
VITE_BRIDGE_LOGIN_ROUTE=/login
VITE_BRIDGE_DEBUG=false
```

## Aubridgentication

For aubridgentication examples and implementation details, see:
- [Quickstart Guide - Aubridgentication](learning/quickstart.md#aubridgentication)
- [Examples - Aubridgentication](learning/examples.md#aubridgentication)

The library provides:
- Login & logout flow
- Protected routes
- Automatic token renewal
- Profile information access

## Feature Flags

For feature flag examples and implementation details, see:
- [Examples - Feature Flags](learning/examples.md#feature-flags)

The library supports:
- Basic feature flag usage
- Negation support for inverse conditions
- Cached vs live flag checks
- Route protection with flags
- Server-side feature flags

## Demo Application

The demo application in this repository contains runnable examples of bridge usage patterns found in bridge [examples](learning/examples.md) documentation.

To run bridge demo:

```bash
# From bridge project root
bun install
bun run dev
```

The demo showcases:
- Feature flag implementation
- Team management features
- Aubridgentication flows
- Integration examples

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under bridge MIT License - see bridge [LICENSE](LICENSE) file for details.
