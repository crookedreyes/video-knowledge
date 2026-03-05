import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import './App.css'

export default function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')

  async function greet() {
    setGreetMsg(await invoke('greet', { name }))
  }

  return (
    <main className="flex items-center justify-center min-h-screen bg-slate-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Tauri + React</CardTitle>
          <CardDescription>Desktop app with Tailwind and shadcn/ui</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <input
              id="greet-input"
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Enter a name..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-slate-950"
            />
          </div>
          <Button onClick={() => greet()} className="w-full">
            Greet
          </Button>
          {greetMsg && <p className="text-center text-slate-600">{greetMsg}</p>}
        </CardContent>
      </Card>
    </main>
  )
}
