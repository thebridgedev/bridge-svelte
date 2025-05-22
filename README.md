# nBlocks Svelte Demo & Library Documentation

This repository contains both the nBlocks Svelte library and a demo application showcasing its features.

## Quick Links
- [Quickstart Guide](learning/quickstart.md) - Get started quickly with nBlocks in your Svelte application
- [Examples](learning/examples.md) - Detailed examples of nBlocks features

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [Feature Flags](#feature-flags)
- [Demo Application](#demo-application)

## Installation

```bash
npm install @nblocks/svelte
```

## Configuration

For detailed configuration instructions, see the [Quickstart Guide](learning/quickstart.md).

### Environment Variables

The following environment variables can be configured:

```env
VITE_NBLOCKS_APP_ID=your_app_id
VITE_NBLOCKS_AUTH_BASE_URL=https://auth.nblocks.cloud
VITE_NBLOCKS_CALLBACK_URL=your_callback_url
VITE_NBLOCKS_TEAM_MANAGEMENT_URL=https://backendless.nblocks.cloud/user-management-portal/users
VITE_NBLOCKS_DEFAULT_REDIRECT_ROUTE=/
VITE_NBLOCKS_LOGIN_ROUTE=/login
VITE_NBLOCKS_DEBUG=false
```

## Authentication

For authentication examples and implementation details, see:
- [Quickstart Guide - Authentication](learning/quickstart.md#authentication)
- [Examples - Authentication](learning/examples.md#authentication)

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

The demo application in this repository contains runnable examples of the usage patterns found in the [examples](learning/examples.md) documentation.

To run the demo:

```bash
# From the project root
bun install
bun run dev
```

The demo showcases:
- Feature flag implementation
- Team management features
- Authentication flows
- Integration examples

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
