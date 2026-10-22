import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const apiDir = join(root, "docs/api");

const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);

const template = await readFile(
  join(root, "scripts/templates/api-index.md"),
  "utf8",
);

const landingPage = template.replaceAll("{{VERSION}}", packageJson.version);

await writeFile(join(apiDir, "index.md"), landingPage);

const indexes = {
  classes: `# Classes

Browse the public classes exported by \`mitm-core\`.

- [BasePlugin](./BasePlugin)
- [PipelineAbortSignal](./PipelineAbortSignal)
- [Proxy](./Proxy)
- [RuleEngine](./RuleEngine)
`,
  interfaces: `# Interfaces

Browse the public interfaces exported by \`mitm-core\`.

- [IProxy](./IProxy)
- [IRuleParser](./IRuleParser)
- [PluginEventMap](./PluginEventMap)
- [ProxyEventMap](./ProxyEventMap)
- [WatchableRuleFile](./WatchableRuleFile)
- [WsMessageContext](./WsMessageContext)
`,
  "type-aliases": `# Type Aliases

Browse the public type aliases exported by \`mitm-core\`.

- [AbortMessage](./AbortMessage)
- [PluginPayload](./PluginPayload)
- [ProxyConfig](./ProxyConfig)
- [ProxyOptions](./ProxyOptions)
- [RequestContext](./RequestContext)
- [RequestLifecycle](./RequestLifecycle)
- [RequestScope](./RequestScope)
- [SessionContext](./SessionContext)
- [WebSocketContext](./WebSocketContext)
`,
};

for (const [directory, content] of Object.entries(indexes)) {
  const directoryPath = join(apiDir, directory);

  await mkdir(directoryPath, { recursive: true });
  await writeFile(join(directoryPath, "index.md"), content);
}

console.log(
  `Generated API landing page and category indexes for mitm-core v${packageJson.version}`,
);
