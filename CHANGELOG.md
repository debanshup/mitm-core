# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.0.2](https://github.com/debanshup/mitm-core/compare/v0.0.1...v0.0.2) (2026-10-22)


### Features

* add check:certs script for certificate verification ([8e8d60e](https://github.com/debanshup/mitm-core/commit/8e8d60edf713e05015203e0caaef16bcf5dd66d0))
* add leafCacheDir configuration option ([c264cea](https://github.com/debanshup/mitm-core/commit/c264cea50237c0d41cd4a2aa791594feef7ac086))
* add proxy configuration options ([eec961b](https://github.com/debanshup/mitm-core/commit/eec961b9b79f554296793a9990ff20741d6cf02f))
* add script to check for missing CA certificate files ([bef95be](https://github.com/debanshup/mitm-core/commit/bef95bec985134ef990f360f90b25720398cbce9))
* add secure context management utilities ([ef11a21](https://github.com/debanshup/mitm-core/commit/ef11a21f5d63a13609b5b843871fd22f01201fcb))
* **context:** implement active request tracking and lifecycle management in ContextManager ([066dde4](https://github.com/debanshup/mitm-core/commit/066dde42d5c5c6aab29eeec6082390922097579a))
* **exports:** expose additional rule, config, and ws types from public api ([d9de6e7](https://github.com/debanshup/mitm-core/commit/d9de6e74c6afce94536d73dba6cbf17f1f44bdc1))
* **exports:** expose additional types and modules for greater extensibility ([bcac5e3](https://github.com/debanshup/mitm-core/commit/bcac5e3d6afd94a4bc6d589d42e1ed98ac8482d1))
* **h1:** add telemetry metrics and harden error dispatching in H1OutboundBridge ([f8e484b](https://github.com/debanshup/mitm-core/commit/f8e484b166a874518fa120aefd300246252ad0ed))
* **mitm-core:** update public API exports and add module documentation ([b006671](https://github.com/debanshup/mitm-core/commit/b0066715690143bf9ba6adcde4501e38d14dbe31))
* **pipeline:** enhance PipelineAbortSignal and add AbortMessage type ([d520f99](https://github.com/debanshup/mitm-core/commit/d520f9938004cc6953f5359969037658c1e5d986))
* remove old logo file ([6d36457](https://github.com/debanshup/mitm-core/commit/6d36457f2c267370cd3466843521c3eb2afb9454))
* **stream:** add utility to parse stream body ([c67fbd7](https://github.com/debanshup/mitm-core/commit/c67fbd761aabdeaa05529f31230750b28a7635b4))
* **tls:** optimize SNI handling and secure request lifecycle cleanup ([b299529](https://github.com/debanshup/mitm-core/commit/b29952976240851a38a6335bfbee3879f94752ff))
* update mocha.config.json to include upstream certificate generation ([9d9a055](https://github.com/debanshup/mitm-core/commit/9d9a055a201d91f12f8a1f786b07c4a2f72d3441))


### Bug Fixes

* Add default leaf directory path in constants ([0cb5a6d](https://github.com/debanshup/mitm-core/commit/0cb5a6d5b711b6cfa8f726d79f84b57a02ce4ee8))
* add WebSocket event handling and error reporting ([db5e41c](https://github.com/debanshup/mitm-core/commit/db5e41c0985a026d531f75f79e956b5a2423439f))
* fix potential resource leak issue ([9f32b24](https://github.com/debanshup/mitm-core/commit/9f32b2438e88b3dc011ba5982e04ef9a4b3c2bbf))
* handle WebSocket connection failures more gracefully ([ebf8625](https://github.com/debanshup/mitm-core/commit/ebf862580ecfec507d43cde367d951ea8e49cfe6))
* **http1:** sanitize hop-by-hop headers and increase stream buffer size ([c667a98](https://github.com/debanshup/mitm-core/commit/c667a9801ba998b797aa8e87f4dbe68eba08039d))
* **http:** strip square brackets from IPv6 literal hostnames ([d5cd7b9](https://github.com/debanshup/mitm-core/commit/d5cd7b93a8dfc01c7eef666ac2d7618e1b541a87))
* improve H1InboundBridge and UpstreamInitiator to handle errors more gracefully ([26e9b67](https://github.com/debanshup/mitm-core/commit/26e9b677e19e627c83cfd46acfdbe51fa21e20e2))
* improve ResponseCacheProcessor to handle large responses ([36a7b38](https://github.com/debanshup/mitm-core/commit/36a7b38d2e70882ae90ecd717fe46ff14831af9d))
* remove ScopeMutator.failPipeline call ([5afadec](https://github.com/debanshup/mitm-core/commit/5afadec3f4cc85bc9366af39b2a83e9a707e738b))
* **test:** run linter and fix minor test artifact issues ([361d47a](https://github.com/debanshup/mitm-core/commit/361d47a7da7d15813c28344eb9ec6930b53e520a))
* update .gitignore ([58e5ed7](https://github.com/debanshup/mitm-core/commit/58e5ed7b38b07eded5e00f93309353ccd63eff13))
* update CA certificate paths in test files ([dcfaba3](https://github.com/debanshup/mitm-core/commit/dcfaba3351f7d6135eff78446a14a3f096cb31e0))
* update CA paths in proxy.ts ([46de156](https://github.com/debanshup/mitm-core/commit/46de156f7323dceff92e1c18cce8f2bf6a4c3ebc))
* update certificate cache handling ([5677ea2](https://github.com/debanshup/mitm-core/commit/5677ea2ca29e6d46a4180cdb4ac0680e65969ddf))
* update CertificateCacheManager to save to leafDir ([98e4a26](https://github.com/debanshup/mitm-core/commit/98e4a26b393c2c191bc9701315db7b9d7c4f553e))
* update error reporting in PipelineCompiler ([2be1a54](https://github.com/debanshup/mitm-core/commit/2be1a54a768ddae0627fafaf4de1738ea4efebd7))
* update H1OutboundBridge to handle response caching and error reporting ([d36d47d](https://github.com/debanshup/mitm-core/commit/d36d47d736ff737caf6deb00801a1cc06be9d6be))
* update proxy configuration to include leaf cache directory ([ab828ef](https://github.com/debanshup/mitm-core/commit/ab828efcbd40fb8f6c95a55c168795207887c18a))
* update README.md to use CA.pem instead of CA.crt ([fbd11f6](https://github.com/debanshup/mitm-core/commit/fbd11f6d0414dee21c19bab2b03e2df9bd1a4003))
* update secure context manager for handshake handler ([d709418](https://github.com/debanshup/mitm-core/commit/d709418ef7ac311c3853e3fe5b11e5e31bb8f951))
* update TEST_CA_DIR path to include 'creds' directory ([07c7d9c](https://github.com/debanshup/mitm-core/commit/07c7d9cdb54acaa8e4bc2c21360b08e3d77a245f))
* update WebSocket plugin dispatch failures ([34694f2](https://github.com/debanshup/mitm-core/commit/34694f270927e3d1422cfdc23f122380bd38ecd8))
* **ws:** trigger pipeline finalisation on socket tunnel teardown ([d9d47fd](https://github.com/debanshup/mitm-core/commit/d9d47fd0621f9d28bbab99baac8dc76947ef8c86))

## [0.0.1] - 2026-04-19

Initial release of `mitm-core`.

### Added

- **Strictly Typed Pipeline** — Phased execution architecture (`tcp → connect → request → response`) with strict boundary control during raw socket and stream manipulation.
- **Custom Event-Driven Architecture** — A dedicated `TypedEventEmitter` with a custom `emitAsync` implementation that executes asynchronous listeners in parallel while safely catching all rejected promises.
- **Async Plugin Support** — A plugin system integrated with the event bus. The pipeline explicitly awaits all asynchronous plugin hooks before advancing, preventing unhandled rejections from hanging the Node.js event loop.
- **Rule Engine** — Built-in rule engine to evaluate connection contexts and automatically bypass pinned domains via direct TCP tunneling.

[0.0.1]: https://github.com/debanshup/mitm-core/releases/tag/v0.0.1