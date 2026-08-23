import { describe, expect, it } from 'vitest'
import { docsPages, landingLink, localeCollections, orderedPages, routeLink } from '../website/docs.ts'
import { llmsTxt, projectedPageContent, rawMarkdownPageContent } from './project-doc-site.ts'

describe('English documentation manifest', () => {
  it('publishes one locale and three navigation collections', () => {
    expect(Object.keys(localeCollections)).toEqual(['en'])
    expect(localeCollections.en).toEqual(['guide', 'develop', 'reference'])
    expect(docsPages.every(page => page.locale === 'en' && page.contentLocale === 'en-US')).toBe(true)
    expect(docsPages.some(page => page.route.startsWith('en/'))).toBe(false)
  })

  it('orders every collection and derives its landing link', () => {
    for (const collection of localeCollections.en) {
      const pages = orderedPages('en', collection)
      expect(pages.length).toBeGreaterThan(0)
      expect(landingLink('en', collection)).toBe(routeLink(pages[0]!.route))
    }
  })

  it('lists the same English pages in llms.txt', () => {
    const text = llmsTxt({ base: '/', title: 'Little Whale', description: 'English documentation.' })
    expect(text).toContain('## English')
    expect(text).not.toContain('/en/')
    expect(text).not.toContain('中文')
    expect(text).not.toContain('.zh.md')
    expect(text).not.toContain('.i18n.yaml')
  })

  it('removes only repository chrome from projected content', () => {
    const badge = '[![status](https://img.shields.io/badge/status-ok-green)](https://example.com)'
    const source = `# Guide\n\nBody.\n\n${badge}\n`
    const page = docsPages.find(candidate => candidate.route === 'guide/providers.md')!
    expect(projectedPageContent(source, page)).toBe('# Guide\n\nBody.\n')
    expect(rawMarkdownPageContent(source, page.source)).toBe('# Guide\n\nBody.\n')
  })
})
