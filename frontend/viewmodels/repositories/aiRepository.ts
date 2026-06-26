import { api } from '@/lib/api';
import { getApiBase, } from '@/lib/config';
import { getStoredToken } from '@/lib/api';

export interface ModelInfo {
  id: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  label: string;
  tier: 'flagship' | 'fast' | 'deep';
  context: number;
  kind: string;
  recommended: boolean;
  supports_streaming: boolean;
}

export interface AgentModel {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model_id: string;
  tools: string[];
  enabled: boolean;
  runs: number;
  created_at: string;
}

export interface AutomationModel {
  id: string;
  name: string;
  description: string;
  trigger: string;
  steps: Array<Record<string, unknown>>;
  enabled: boolean;
  runs: number;
  last_run_at: string | null;
  created_at: string;
}

export interface McpServerModel {
  id: string;
  name: string;
  url: string;
  description: string;
  enabled: boolean;
  status: string;
  last_ping_at: string | null;
  created_at: string;
}

export interface RagDocModel {
  id: string;
  name: string;
  size: number;
  chunks: number;
  created_at: string;
}

export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  output: string | null;
  error?: string | null;
  ok?: boolean;
  duration_ms: number;
  started_at?: string;
}

export interface AgentRun {
  id: string;
  agent_id: string;
  session_id: string;
  input: string;
  output: string;
  tool_calls: AgentToolCall[];
  model_id: string;
  status: 'running' | 'complete' | 'error';
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export type RunTraceEvent =
  | { type: 'meta'; run_id: string; session_id: string; agent: { id: string; name: string; model_id: string }; tools_available: Array<{ key: string; server: string; tool: string; description: string }>; started_at: string }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown>; started_at: string }
  | { type: 'tool_result'; id: string; ok: boolean; output: string | null; error?: string | null; duration_ms: number }
  | { type: 'done'; run_id: string; session_id: string; duration_ms: number; tool_calls: number; output: string; finished_at: string; status: string; tool_calls_detail: AgentToolCall[] }
  | { type: 'error'; message: string };

export const AiRepository = {
  // Models
  listModels: () => api<ModelInfo[]>('/api/v1/ai/models'),

  // Agents
  listAgents: () => api<AgentModel[]>('/api/v1/ai/agents'),
  createAgent: (body: Omit<AgentModel, 'id' | 'runs' | 'created_at'>) =>
    api<AgentModel>('/api/v1/ai/agents', { method: 'POST', body: JSON.stringify(body) }),
  deleteAgent: (id: string) =>
    api<{ ok: boolean }>(`/api/v1/ai/agents/${id}`, { method: 'DELETE' }),

  // Automations
  listAutomations: () => api<AutomationModel[]>('/api/v1/ai/automations'),
  createAutomation: (body: Omit<AutomationModel, 'id' | 'runs' | 'last_run_at' | 'created_at'>) =>
    api<AutomationModel>('/api/v1/ai/automations', { method: 'POST', body: JSON.stringify(body) }),
  runAutomation: (id: string) =>
    api<{ ok: boolean }>(`/api/v1/ai/automations/${id}/run`, { method: 'POST' }),
  deleteAutomation: (id: string) =>
    api<{ ok: boolean }>(`/api/v1/ai/automations/${id}`, { method: 'DELETE' }),

  // MCP
  listMcp: () => api<McpServerModel[]>('/api/v1/ai/mcp/servers'),
  addMcp: (body: { name: string; url: string; description?: string }) =>
    api<McpServerModel>('/api/v1/ai/mcp/servers', { method: 'POST', body: JSON.stringify(body) }),
  pingMcp: (id: string) =>
    api<{ ok: boolean; status: string; tools: string[] }>(`/api/v1/ai/mcp/servers/${id}/ping`, { method: 'POST' }),
  deleteMcp: (id: string) =>
    api<{ ok: boolean }>(`/api/v1/ai/mcp/servers/${id}`, { method: 'DELETE' }),

  // RAG
  listDocs: () => api<RagDocModel[]>('/api/v1/ai/rag/documents'),
  queryRag: (query: string, top_k = 4) =>
    api<{ items: Array<{ text: string; meta: Record<string, unknown>; rank: number }>; answer: string }>(
      '/api/v1/ai/rag/query',
      { method: 'POST', body: JSON.stringify({ query, top_k }) },
    ),
  deleteDoc: (id: string) => api<{ ok: boolean }>(`/api/v1/ai/rag/documents/${id}`, { method: 'DELETE' }),

  async uploadDoc(file: File | Blob, name: string): Promise<{ id: string; chunks: number; name: string }> {
    const token = await getStoredToken();
    const fd = new FormData();
    fd.append('file', file, name);
    const res = await fetch(`${getApiBase()}/api/v1/ai/rag/documents`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return res.json();
  },

  /** Streams a chat response via SSE. Calls onDelta with each token chunk. */
  async streamChat(
    body: { session_id: string; message: string; model_id: string; system_prompt?: string },
    onDelta: (text: string) => void,
  ): Promise<void> {
    const token = await getStoredToken();
    const res = await fetch(`${getApiBase()}/api/v1/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.body) throw new Error('No stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const m = line.match(/^data: (.+)$/m);
        if (!m) continue;
        try {
          const payload = JSON.parse(m[1]);
          if (payload.type === 'delta') onDelta(payload.text as string);
        } catch {/* ignore */}
      }
    }
  },

  // ----- Agent Run Console -----
  listAgentRuns: (agentId: string) =>
    api<AgentRun[]>(`/api/v1/ai/agents/${agentId}/runs`),
  getAgentRun: (runId: string) =>
    api<AgentRun>(`/api/v1/ai/agent-runs/${runId}`),

  /**
   * Streams a structured agent trace: text deltas, tool_call events, tool_result events.
   * Returns the abort controller so the caller can cancel mid-stream.
   */
  async streamAgentTrace(
    agentId: string,
    input: string,
    onEvent: (ev: RunTraceEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = await getStoredToken();
    const res = await fetch(`${getApiBase()}/api/v1/ai/agents/${agentId}/run-trace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ input }),
      signal,
    });
    if (!res.ok) throw new Error(`Run failed (${res.status})`);
    if (!res.body) throw new Error('No stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const m = line.match(/^data: (.+)$/m);
        if (!m) continue;
        try {
          onEvent(JSON.parse(m[1]) as RunTraceEvent);
        } catch {/* ignore */}
      }
    }
  },
};
