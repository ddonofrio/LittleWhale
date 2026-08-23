/** Canonical English-only publication manifest for the documentation website. */

export type DocsLocale = 'en'
export type DocsSidebar = 'guide' | 'develop' | 'reference'

export interface DocsPage {
  locale: DocsLocale
  contentLocale: 'en-US'
  source: string
  route: string
  label: string
  sidebar: DocsSidebar | null
  section: string
  order: number
  outline?: number | readonly [number, number] | 'deep' | false
  sourceAliases?: string[]
}

function page(source: string, route: string, label: string, sidebar: DocsSidebar | null, section: string, order: number, options: Pick<DocsPage, 'outline' | 'sourceAliases'> = {}): DocsPage {
  return { locale: 'en', contentLocale: 'en-US', source, route, label, sidebar, section, order, ...options }
}

const homeAndGuide = [
  page('docs/user/index.md', 'index.md', 'Little Whale', null, 'Home', 0),
  page('docs/user/guide/index.md', 'guide/quickstart.md', 'Use the Web UI', 'guide', 'Guide', 1, { sourceAliases: ['docs/user/guide'] }),
  page('docs/user/guide/providers.md', 'guide/providers.md', 'Configure models', 'guide', 'Guide', 2),
  page('docs/user/guide/python-sdk.md', 'guide/python-sdk.md', 'Python', 'guide', 'SDK', 1),
]

const develop = [
  page('docs/user/develop/basic/index.md', 'develop/basic/index.md', 'Your first Little Whale plugin', 'develop', 'Basics', 1, { sourceAliases: ['docs/user/develop/basic'] }),
  page('docs/user/develop/basic/tool.md', 'develop/basic/tool.md', 'Build a tool', 'develop', 'Basics', 2),
  page('docs/user/develop/basic/config.md', 'develop/basic/config.md', 'Plugin configuration', 'develop', 'Basics', 3),
  page('docs/user/develop/basic/publish.md', 'develop/basic/publish.md', 'Package and install', 'develop', 'Basics', 4),
  page('docs/user/develop/framework/index.md', 'develop/framework/index.md', 'Plugin lifecycle', 'develop', 'Framework', 1, { sourceAliases: ['docs/user/develop/framework'] }),
  page('docs/user/develop/framework/service.md', 'develop/framework/service.md', 'Services and dependencies', 'develop', 'Framework', 2),
  page('docs/user/develop/framework/events.md', 'develop/framework/events.md', 'Event system', 'develop', 'Framework', 3),
  page('docs/user/develop/practice/index.md', 'develop/practice/index.md', 'Capability layering', 'develop', 'Practice', 1, { sourceAliases: ['docs/user/develop/practice'] }),
  page('docs/user/develop/practice/llm-adapter.md', 'develop/practice/llm-adapter.md', 'LLM adapter', 'develop', 'Practice', 2),
]

const tutorialFiles = [
  ['index.md', 'Overview'], ['01-first-plugin.md', '1. Your first plugin'], ['02-lifecycle-and-effects.md', '2. Lifecycle and effects'],
  ['03-services.md', '3. Services'], ['04-events.md', '4. Events'], ['05-config.md', '5. Configuration'],
  ['06-composition-and-hmr.md', '6. Composition and HMR'], ['07-into-the-harness.md', '7. Into Little Whale'],
] as const
const cordisTutorial = tutorialFiles.map(([file, label], order) => page(`docs/cordis-tutorial/${file}`, `develop/cordis-tutorial/${file}`, label, 'develop', 'Cordis framework tutorial', order, file === 'index.md' ? { sourceAliases: ['docs/cordis-tutorial'] } : {}))

const cordisPrimerReference = [page('docs/cordis-primer.md', 'reference/cordis-primer.md', 'Cordis primer', 'reference', 'Concepts', 1)]

const subsystemGroups = [
  ['Overview', [['README.md', 'Subsystems']]],
  ['Core and scopes', [['core.md', 'Core'], ['scope.md', 'Scopes'], ['invariants.md', 'Runtime invariants']]],
  ['Sessions and persistence', [['session.md', 'Sessions'], ['session-query.md', 'Session query'], ['session-reference.md', 'Session references'], ['session-title.md', 'Session titles'], ['session-projection.md', 'Session projections'], ['persistence.md', 'Session persistence'], ['spill.md', 'Spill storage'], ['session-telemetry.md', 'SessionTelemetryBackend']]],
  ['Model and context', [['llm-streaming.md', 'LLM streaming'], ['token-meter.md', 'Token metering'], ['system-prompt.md', 'System prompts'], ['compaction.md', 'Compaction']]],
  ['Execution and tools', [['tools.md', 'Tools'], ['shell.md', 'Bash execution'], ['subprocess.md', 'Subprocesses'], ['terminal.md', 'PTY sessions'], ['jobs.md', 'Background jobs'], ['filesystem.md', 'Filesystem'], ['lsp.md', 'LSP navigation'], ['code-runtime.md', 'Code runtime'], ['web.md', 'Web access'], ['skills.md', 'Skills'], ['workflow.md', 'Workflows'], ['subagent.md', 'Subagents']]],
  ['Policy and interaction', [['approval.md', 'Approvals'], ['permission-presets.md', 'Permission presets'], ['sandbox.md', 'Sandboxing'], ['plan.md', 'Plan mode'], ['user-questions.md', 'User interaction'], ['commands.md', 'Human commands'], ['goal.md', 'Goals'], ['schedule.md', 'Scheduled reminders']]],
  ['Platform and access', [['web-server.md', 'HTTP server'], ['typert.md', 'Typert'], ['client-modules.md', 'Client modules'], ['storage.md', 'Storage'], ['workspace.md', 'Workspaces'], ['settings.md', 'User settings'], ['credentials.md', 'User credentials']]],
] as const
const subsystemsReference = subsystemGroups.flatMap(([section, files]) => files.map(([file, label], order) => page(`docs/subsystems/${file}`, file === 'README.md' ? 'reference/subsystems/index.md' : `reference/subsystems/${file}`, label, 'reference', section, order, { outline: [2, 3], ...(file === 'README.md' ? { sourceAliases: ['docs/subsystems'] } : {}) })))

const reference = [
  page('docs/architecture.md', 'reference/index.md', 'Architecture', 'reference', 'Concepts', 0),
  page('docs/capability-seams.md', 'reference/capability-seams.md', 'Capability services', 'reference', 'Concepts', 2),
  page('docs/agent-lifecycle.md', 'reference/agent-lifecycle.md', 'Agent lifecycle', 'reference', 'Concepts', 3),
  page('docs/tool-execution-pipeline.md', 'reference/tool-execution-pipeline.md', 'Tool execution', 'reference', 'Concepts', 4),
  page('docs/config-catalog.md', 'reference/config-catalog.md', 'Plugin configuration', 'reference', 'Generated reference', 0),
  page('docs/tool-catalog.md', 'reference/tool-catalog.md', 'Tool schemas', 'reference', 'Generated reference', 1),
  page('docs/persistence-catalog.md', 'reference/persistence-catalog.md', 'Persistence events', 'reference', 'Generated reference', 2, { outline: 'deep' }),
  ...['context.md', 'events.md', 'fiber.md', 'registry.md', 'service.md'].map((file, order) => page(`docs/cordis-api/${file}`, `reference/cordis-api/${file}`, file.replace('.md', '').replace(/^./, c => c.toUpperCase()), 'reference', 'Cordis Core API', order)),
  page('docs/cordis-api/inherited.md', 'reference/cordis-api/inherited.md', 'Inherited surface', 'reference', 'Cordis Core API', 5),
  ...([
    ['adding-a-package.md', 'Adding a package'], ['adding-a-tool.md', 'Adding a tool'], ['adding-an-llm-adapter.md', 'Adding an LLM adapter'],
    ['adding-a-settings-card.md', 'Adding a settings card'], ['extension-cookbook.md', 'Extension patterns'], ['adding-a-conversation-node.md', 'Adding a Conversation Node'],
  ] as const).map(([file, label], order) => page(`docs/cookbook/${file}`, `reference/cookbook/${file}`, label, 'reference', 'Cookbook', order)),
]

export const localeCollections = { en: ['guide', 'develop', 'reference'] } as const satisfies Record<DocsLocale, readonly DocsSidebar[]>
export interface DocsSection { label: string; collapsed?: boolean }
const sections: readonly DocsSection[] = [
  { label: 'Guide' }, { label: 'SDK' }, { label: 'Basics' }, { label: 'Framework' }, { label: 'Practice' }, { label: 'Cordis framework tutorial' },
  { label: 'Concepts' }, { label: 'Generated reference' }, { label: 'Cordis Core API' }, { label: 'Cookbook' }, { label: 'Overview' },
  { label: 'Core and scopes', collapsed: true }, { label: 'Sessions and persistence', collapsed: true }, { label: 'Model and context', collapsed: true },
  { label: 'Execution and tools', collapsed: true }, { label: 'Policy and interaction', collapsed: true }, { label: 'Platform and access', collapsed: true },
]

export function sectionSpec(_locale: DocsLocale, label: string): DocsSection & { index: number } {
  const section = sections.find(candidate => candidate.label === label)
  if (section === undefined) throw new Error(`Sidebar section "${label}" has no placement in the English locale.`)
  return { ...section, index: sections.indexOf(section) }
}

export const docsPages: DocsPage[] = [
  ...homeAndGuide,
  ...develop,
  ...cordisTutorial,
  ...cordisPrimerReference,
  ...subsystemsReference,
  ...reference,
]
export function orderedPages(_locale: DocsLocale, collection: DocsSidebar): DocsPage[] {
  return docsPages
    .filter(page => page.sidebar === collection)
    .sort((left, right) => sectionSpec(_locale, left.section).index - sectionSpec(_locale, right.section).index || left.order - right.order)
}
export function routeLink(route: string): string { return `/${route.replace(/(?:index)?\.md$/, '')}` }
export function landingLink(locale: DocsLocale, collection: DocsSidebar): string {
  const first = orderedPages(locale, collection)[0]
  if (first === undefined) throw new Error(`Sidebar collection "${collection}" publishes no page.`)
  return routeLink(first.route)
}
