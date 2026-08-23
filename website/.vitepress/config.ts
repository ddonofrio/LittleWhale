import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Little Whale',
  description: 'A local-model-first agentic coding assistant.',
  lang: 'en-US',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Local providers', link: '/providers' },
    ],
    sidebar: [{ text: 'Little Whale', items: [
      { text: 'Home', link: '/' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Local providers', link: '/providers' },
    ] }],
    socialLinks: [{ icon: 'github', link: 'https://github.com/ddonofrio/LittleWhale' }],
  },
})
