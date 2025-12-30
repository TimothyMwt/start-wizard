# @timothymwt/start-wizard-cli

## 0.1.3

### Patch Changes

- 7aba105: Fix interactive select prompts exiting after readline input by resuming paused stdin and restoring TTY state.
- Updated dependencies [7aba105]
  - @timothymwt/start-wizard-core@0.1.1

## 0.1.2

### Patch Changes

- 2734233: Fix CLI entrypoint detection so `start-wizard` runs correctly when invoked via the `node_modules/.bin` symlink.

## 0.1.1

### Patch Changes

- 27c3a85: Fix interactive prompts getting corrupted by background logs by resolving product port conflicts before starting the local stack, and treating local stack ports as owned (not product-level conflicts).

## 0.1.0

### Minor Changes

- Initial public release.

### Patch Changes

- Updated dependencies
  - @timothymwt/start-wizard-core@0.1.0
  - @timothymwt/start-wizard-next@0.1.0
  - @timothymwt/start-wizard-expo@0.1.0
