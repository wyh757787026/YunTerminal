import { resolve } from 'path'

import { fileURLToPath } from 'url'



const rootDir = fileURLToPath(new URL('.', import.meta.url))



export default {

  plugins: {

    tailwindcss: { config: resolve(rootDir, 'tailwind.config.js') },

    autoprefixer: {}

  }

}

