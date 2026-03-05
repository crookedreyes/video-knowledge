import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function App() {
  const [name, setName] = useState('')
  const [greeting, setGreeting] = useState('')

  const handleGreet = async () => {
    if (!name) return
    try {
      const message = await invoke<string>('greet', { name })
      setGreeting(message)
    } catch (error) {
      console.error('Error calling greet:', error)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Video Knowledge</CardTitle>
          <CardDescription>Desktop application powered by Tauri, React, and Tailwind CSS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Enter your name:
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGreet()}
              placeholder="Type your name..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            />
          </div>
          <Button onClick={handleGreet} className="w-full">
            Send Greeting
          </Button>
          {greeting && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-sm text-slate-700">{greeting}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default App
