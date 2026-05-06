import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/Robot_Arm_Configurator/',
  plugins: [react()],
})
