# start-wizard

Config-driven development startup wizard for monorepos (local/dev/prod) with safe port conflict handling.

This repo publishes:

- `@timothymwt/start-wizard-core`
- `@timothymwt/start-wizard-next`
- `@timothymwt/start-wizard-expo`
- `@timothymwt/start-wizard-cli` (installs the `start-wizard` command)

## Repo integration (consumer)

1. Install:

```bash
npm i -D @timothymwt/start-wizard-cli
```

2. Add `start-wizard.config.mjs` at your repo root:

```js
import { defineConfig } from '@timothymwt/start-wizard-core';

export default defineConfig({
  products: [
    {
      id: 'mobile',
      label: 'Mobile app',
      start: async () => {
        // spawn your app here
      },
    },
  ],
});
```

3. Run:

```bash
start-wizard
```


