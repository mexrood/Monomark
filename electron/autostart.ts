import { app } from 'electron'
import AutoLaunch from 'auto-launch'

const launcher = new AutoLaunch({
  name: 'Monomark',
  path: app.getPath('exe'),
  isHidden: false, // start visible
})

export async function getAutostartEnabled(): Promise<boolean> {
  try {
    return await launcher.isEnabled()
  } catch {
    return false
  }
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await launcher.enable()
    } else {
      await launcher.disable()
    }
  } catch (err) {
    console.error('[autostart] Failed to set autostart:', err)
    throw err
  }
}
