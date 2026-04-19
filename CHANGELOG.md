# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.0.1] - 2026-04-19

Initial release of `mitm-core`.

### Added

- **Strictly Typed Pipeline** — Phased execution architecture (`tcp → connect → request → response`) with strict boundary control during raw socket and stream manipulation.
- **Custom Event-Driven Architecture** — A dedicated `TypedEventEmitter` with a custom `emitAsync` implementation that executes asynchronous listeners in parallel while safely catching all rejected promises.
- **Async Plugin Support** — A plugin system integrated with the event bus. The pipeline explicitly awaits all asynchronous plugin hooks before advancing, preventing unhandled rejections from hanging the Node.js event loop.
- **Rule Engine** — Built-in rule engine to evaluate connection contexts and automatically bypass pinned domains via direct TCP tunneling.

[0.0.1]: https://github.com/debanshup/mitm-core/releases/tag/v0.0.1