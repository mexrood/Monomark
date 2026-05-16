import React from 'react'
import { SettingsPage, Section, Row } from '../SettingsPage'
import { Button } from '../../ui/Button'
import { Switch } from '../../ui/Switch'
import { useAppStore } from '../../../store/useAppStore'

export const LaunchPanel: React.FC = () => {
  const { autostartEnabled, toggleAutostart } = useAppStore()

  const handleQuit = () => {
    window.dispatchEvent(new Event('monomark:quit-requested'))
  }

  return (
    <SettingsPage title="Launch" description="Startup and shutdown behavior">
      <Section title="Startup">
        <Row
          title="Launch at login"
          description="Start Monomark automatically when you log in"
          action={<Switch checked={autostartEnabled} onChange={() => toggleAutostart()} />}
        />
      </Section>

      <Section title="App">
        <Row
          title="Quit Monomark"
          description="Fully exit Monomark (not just hide to tray). Closing the window hides Monomark to the system tray — the MCP server keeps running so Claude can always reach your vault."
          action={
            <Button variant="secondary" onClick={handleQuit}>
              Quit Monomark
            </Button>
          }
        />
      </Section>
    </SettingsPage>
  )
}
