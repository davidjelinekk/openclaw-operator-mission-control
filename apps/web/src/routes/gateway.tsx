import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Server } from 'lucide-react'
import { useGatewayStatus, useGatewaySessions } from '@/hooks/api/gateway'

export const Route = createFileRoute('/gateway')({
  component: GatewayPage,
})

function GatewayPage() {
  const { data: status, isLoading: statusLoading, dataUpdatedAt } = useGatewayStatus()
  const { data: sessions, isLoading: sessionsLoading } = useGatewaySessions()

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>gateway
        </h1>
        {dataUpdatedAt > 0 && (
          <span className="font-mono text-[10px] text-[#6e7681]">
            checked {new Date(dataUpdatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection card */}
        <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-[#6e7681]" />
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Connection</span>
          </div>

          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#58a6ff]" />
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 border-t border-[#21262d] pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">status</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${status?.connected ? 'bg-[#3fb950]' : 'bg-[#f85149]'}`} />
                  <span className={`font-mono text-xs ${status?.connected ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {status?.connected ? 'connected' : 'disconnected'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">url</span>
                <span className="font-mono text-xs text-[#8b949e] truncate max-w-[200px] text-right">
                  {status?.gatewayUrl ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">ok</span>
                <span className={`font-mono text-xs ${status?.ok ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                  {status?.ok ? 'yes' : 'no'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Health card */}
        <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
          <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Health</span>
          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#58a6ff]" />
            </div>
          ) : (
            <div className="border-t border-[#21262d] pt-3">
              {!status?.health ? (
                <span className="font-mono text-xs text-[#6e7681]">no health data</span>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {Object.entries(status.health as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest flex-shrink-0 pt-0.5">{k}</span>
                      {typeof v === 'object' ? (
                        <pre className="font-mono text-xs text-[#8b949e] text-right whitespace-pre-wrap break-all max-w-[300px]">
                          {JSON.stringify(v, null, 2)}
                        </pre>
                      ) : (
                        <span className="font-mono text-xs text-[#8b949e] text-right break-all max-w-[300px]">
                          {String(v)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sessions card */}
        <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Active Sessions</span>
            <span className="font-mono text-[10px] text-[#58a6ff] border border-[#1f6feb]/30 bg-[#1f6feb]/10 px-1.5 py-0.5">
              {(sessions ?? []).length}
            </span>
          </div>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#58a6ff]" />
            </div>
          ) : (
            <div className="border-t border-[#21262d] pt-3">
              {(sessions ?? []).length === 0 ? (
                <span className="font-mono text-xs text-[#6e7681]">no active sessions</span>
              ) : (
                <div className="flex flex-col gap-0">
                  <div className="grid grid-cols-4 gap-3 pb-1.5 mb-1 border-b border-[#21262d]">
                    {['key', 'kind', 'model', 'updated'].map((h) => (
                      <span key={h} className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">{h}</span>
                    ))}
                  </div>
                  {(sessions ?? []).map((s, i) => (
                    <div
                      key={s.key}
                      className={`grid grid-cols-4 gap-3 py-2 ${i < (sessions ?? []).length - 1 ? 'border-b border-[#21262d]' : ''}`}
                    >
                      <span className="font-mono text-xs text-[#c9d1d9] truncate" title={s.key}>
                        {s.key}
                      </span>
                      <span className="font-mono text-xs text-[#8b949e] truncate">
                        {s.kind ?? '—'}
                      </span>
                      <span className="font-mono text-xs text-[#8b949e] truncate">{s.model ?? '—'}</span>
                      <span className="font-mono text-xs text-[#6e7681]">
                        {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
