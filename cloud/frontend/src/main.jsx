import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Menu, MessageCircle, Plus, Send, Sparkles, Trash2, UploadCloud, X } from 'lucide-react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'content-type': 'application/json', ...(options.headers || {}) } })
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

function App() {
  const [sessions, setSessions] = useState([])
  const [session, setSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sidebar, setSidebar] = useState(true)
  const [user, setUser] = useState(null)
  const input = useRef(null)
  const activeTitle = useMemo(() => session?.title || 'New conversation', [session])

  const refresh = async () => {
    const [sessionData, workspaceData] = await Promise.all([request('/api/sessions'), request('/api/workspaces')])
    setSessions(sessionData.sessions || [])
    setWorkspaces(workspaceData.workspaces || [])
    if (!sessionData.sessions?.length) {
      const created = await request('/api/sessions', { method: 'POST', body: JSON.stringify({}) })
      setSessions([created.session]); setSession(created.session); setMessages([])
    } else {
      const current = session && sessionData.sessions.find(item => item.id === session.id)
      const selected = current || sessionData.sessions[0]
      setSession(selected)
      const history = await request(`/api/sessions/${selected.id}/messages`)
      setMessages(history.messages || [])
    }
  }
  useEffect(() => {
    request('/auth/me').then(result => { setUser(result.user); return refresh() }).catch(e => { if (!String(e.message).includes('(401)')) setError(e.message) }).finally(() => setLoading(false))
  }, [])

  const selectSession = async item => {
    setSession(item); setError('')
    try { setMessages((await request(`/api/sessions/${item.id}/messages`)).messages || []) } catch (e) { setError(e.message) }
  }
  const newChat = async () => {
    try { const created = await request('/api/sessions', { method: 'POST', body: JSON.stringify({}) }); setSessions(items => [created.session, ...items]); setSession(created.session); setMessages([]); input.current?.focus() } catch (e) { setError(e.message) }
  }
  const send = async event => {
    event?.preventDefault(); const message = draft.trim()
    if (!message || busy || !session) return
    setDraft(''); setError(''); setBusy(true)
    setMessages(items => [...items, { id: `local-${Date.now()}`, role: 'user', content: message, createdAt: new Date().toISOString() }])
    try {
      const result = await request(`/api/sessions/${session.id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
      setMessages(items => [...items, result.assistant])
      setSession(item => ({ ...item, title: result.user.content.slice(0, 60), updatedAt: result.assistant.createdAt, messageCount: (item.messageCount || 0) + 2 }))
      setSessions(items => items.map(item => item.id === session.id ? { ...item, title: result.user.content.slice(0, 60), updatedAt: result.assistant.createdAt, messageCount: (item.messageCount || 0) + 2 } : item))
    } catch (e) { setError(e.message); setMessages(items => items.slice(0, -1)) } finally { setBusy(false); input.current?.focus() }
  }
  const upload = async event => {
    const file = event.target.files?.[0]; if (!file || !session) return
    setError(''); setBusy(true)
    try {
      const workspace = workspaces[0] || (await request('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: 'Default workspace' }) })).workspace
      if (!workspaces.length) setWorkspaces([workspace])
      const signed = await request(`/api/workspaces/${workspace.id}/presign`, { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type }) })
      const result = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file })
      if (!result.ok) throw new Error('Upload failed')
      setDraft(value => `${value}${value ? '\n' : ''}[Attached: ${file.name}]`)
    } catch (e) { setError(e.message) } finally { setBusy(false); event.target.value = '' }
  }

  if (loading) return <div className="loading"><div className="whale">◒</div><span>Waking LittleWhale…</span></div>
  if (!user) return <div className="login-page"><div className="login-card"><div className="login-logo">◒</div><div className="brand-name">LittleWhale</div><h1>Your AI workspace</h1><p>Sign in with your Atlassian account to access your conversations, files and workspaces.</p><a className="atlassian-login" href={`${API}/auth/atlassian/start?returnTo=${encodeURIComponent(window.location.origin)}`}><span className="atlassian-mark">A</span> Continue with Atlassian</a><div className="login-note">Atlassian OAuth 2.1 · No anonymous access</div>{error && <div className="login-error">{error}</div>}</div></div>
  return <div className="app">
    <aside className={`sidebar ${sidebar ? '' : 'closed'}`}>
      <div className="brand"><div className="logo">◒</div><div><div className="brand-name">LittleWhale</div><div className="brand-sub">AI workspace</div></div><button className="icon-button mobile-only" onClick={() => setSidebar(false)}><X size={18} /></button></div>
      <button className="new-chat" onClick={newChat}><Plus size={18} /> New conversation</button>
      <div className="section-label">Conversations <span>{sessions.length}</span></div>
      <div className="session-list">{sessions.map(item => <button key={item.id} className={`session ${item.id === session?.id ? 'active' : ''}`} onClick={() => selectSession(item)}><MessageCircle size={16} /><span>{item.title}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="section-label">Workspaces</div>{workspaces.length ? workspaces.map(item => <div className="workspace" key={item.id}><div className="workspace-dot" />{item.name}</div>) : <div className="empty-workspace">Files you attach appear here.</div>}</div>
      <div className="status"><span className="status-dot" /> Bedrock connected</div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="icon-button" onClick={() => setSidebar(value => !value)}><Menu size={20} /></button><div className="top-title">{activeTitle}</div><div className="top-actions"><span className="user-name">{user.displayName}</span><button className="logout" onClick={() => request('/auth/logout', { method: 'POST' }).then(() => setUser(null))}>Sign out</button><label className="attach"><FileUp size={17} /> Attach<input type="file" onChange={upload} /></label></div></header>
      <section className="conversation"><div className="messages">{messages.length === 0 ? <div className="welcome"><div className="welcome-icon"><Sparkles size={25} /></div><h1>How can I help?</h1><p>Ask LittleWhale to explore ideas, draft content, analyze a file, or solve a problem.</p><div className="suggestions"><button onClick={() => setDraft('Help me structure a new project')}>Structure a project</button><button onClick={() => setDraft('Give me three practical ideas to get started')}>Get ideas</button><button onClick={() => setDraft('Summarize the key points I should know')}>Summarize a topic</button></div></div> : messages.map(item => <div className={`message-row ${item.role}`} key={item.id}><div className={`avatar ${item.role}`}>{item.role === 'assistant' ? '◒' : 'You'}</div><div className="message-content"><div className="message-role">{item.role === 'assistant' ? 'LittleWhale' : 'You'}</div><div className="message-text">{item.content}</div></div></div>)}{busy && <div className="message-row assistant"><div className="avatar assistant">◒</div><div className="message-content"><div className="message-role">LittleWhale</div><div className="thinking"><i /><i /><i /></div></div></div>}<div /></div>
      {error && <div className="error"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      <form className="composer-wrap" onSubmit={send}><div className="composer"><textarea ref={input} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }} placeholder="Message LittleWhale…" rows="1" disabled={busy} /><div className="composer-footer"><span>Enter to send · Shift + Enter for a new line</span><button className="send" disabled={!draft.trim() || busy} aria-label="Send"><Send size={17} /></button></div></div><div className="powered">LittleWhale can make mistakes. Check important information.</div></form></section>
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
