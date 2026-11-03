export type CopilotMode = "generate" | "chat" | "explain" | "debug" | "improve"

export interface AIChatMessage {
    id: string
    role: "user" | "assistant" | "system"
    content: string
    timestamp?: string
}

export interface ICopilotContext {
    mode: CopilotMode
    setMode: (mode: CopilotMode) => void
    input: string
    setInput: (input: string) => void
    output: string
    setOutput: (output: string) => void
    isRunning: boolean
    chatMessages: AIChatMessage[]
    generateCode: (prompt?: string) => Promise<void>
    explainCode: (prompt?: string) => Promise<void>
    debugCode: (prompt?: string) => Promise<void>
    improveCode: (prompt?: string) => Promise<void>
    sendChatMessage: (prompt?: string) => Promise<void>
    clearChat: () => void
    clearOutput: () => void
}
