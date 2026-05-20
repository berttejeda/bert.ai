import { defineAppSetup } from '@slidev/types'
import Vue3Tour from 'vue3-tour'
import 'vue3-tour/dist/vue3-tour.css'

export default defineAppSetup(({ app }) => {
  app.use(Vue3Tour)
})
