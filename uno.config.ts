import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons(),
  ],
  content: {
    filesystem: [
      'index.html',
      'src/**/*.{js,ts,html}',
    ],
  },
  theme: {
    colors: {
      // Add custom colors here if needed
    },
  },
})
