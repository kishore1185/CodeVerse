import aiApi from "@/api/aiApi"
import { AIChatMessage, CopilotMode, ICopilotContext } from "@/types/copilot"
import { createContext, ReactNode, useContext, useState } from "react"
import toast from "react-hot-toast"
import { v4 as uuidv4 } from "uuid"
import { useFileSystem } from "./FileContext"

const CopilotContext = createContext<ICopilotContext | null>(null)

export const useCopilot = () => {
    const context = useContext(CopilotContext)
    if (context === null) {
        throw new Error(
            "useCopilot must be used within a CopilotContextProvider",
        )
    }
    return context
}

const getLanguageFromFilename = (fileName?: string): string => {
    if (!fileName) return ""
    const ext = fileName.split(".").pop()?.toLowerCase() || ""
    const map: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        java: "java",
        cpp: "cpp",
        c: "c",
        cs: "csharp",
        go: "go",
        rs: "rust",
        php: "php",
        rb: "ruby",
        html: "html",
        css: "css",
        json: "json",
        sql: "sql",
        sh: "bash",
    }
    return map[ext] || ext
}

const CopilotContextProvider = ({ children }: { children: ReactNode }) => {
    const { activeFile } = useFileSystem()

    const [mode, setMode] = useState<CopilotMode>("generate")
    const [input, setInput] = useState<string>("")
    const [output, setOutput] = useState<string>("")
    const [isRunning, setIsRunning] = useState<boolean>(false)
    const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([])

    const clearChat = () => setChatMessages([])
    const clearOutput = () => setOutput("")

    const generateCode = async (customPrompt?: string) => {
        const promptToSend = customPrompt !== undefined ? customPrompt : input
        if (!promptToSend || promptToSend.trim().length === 0) {
            toast.error("Please enter a prompt to generate code")
            return
        }

        const toastId = toast.loading("Generating code...")
        setIsRunning(true)
        try {
            const response = await aiApi.post("/copilot", {
                action: "generate",
                prompt: promptToSend,
                code: activeFile?.content || "",
                fileName: activeFile?.name || "",
                language: getLanguageFromFilename(activeFile?.name),
            })

            const content = response.data?.data?.content || response.data?.message || ""
            setOutput(content)
            toast.success("Code generated successfully", { id: toastId })
        } catch (error: any) {
            console.error("AI Generate Error:", error)
            const errorMsg =
                error.response?.data?.error ||
                error.message ||
                "Failed to generate the code"
            toast.error(errorMsg, { id: toastId })
        } finally {
            setIsRunning(false)
        }
    }

    const explainCode = async (customPrompt?: string) => {
        if (!activeFile || !activeFile.content || activeFile.content.trim().length === 0) {
            toast.error("Please open a file with code to explain")
            return
        }

        const promptToSend = customPrompt !== undefined ? customPrompt : input
        const toastId = toast.loading("Explaining code...")
        setIsRunning(true)
        try {
            const response = await aiApi.post("/copilot", {
                action: "explain",
                prompt: promptToSend,
                code: activeFile.content,
                fileName: activeFile.name,
                language: getLanguageFromFilename(activeFile.name),
            })

            const content = response.data?.data?.content || response.data?.message || ""
            setOutput(content)
            toast.success("Code explained successfully", { id: toastId })
        } catch (error: any) {
            console.error("AI Explain Error:", error)
            const errorMsg =
                error.response?.data?.error ||
                error.message ||
                "Failed to explain the code"
            toast.error(errorMsg, { id: toastId })
        } finally {
            setIsRunning(false)
        }
    }

    const debugCode = async (customPrompt?: string) => {
        if (!activeFile || !activeFile.content || activeFile.content.trim().length === 0) {
            toast.error("Please open a file with code to debug")
            return
        }

        const promptToSend = customPrompt !== undefined ? customPrompt : input
        const toastId = toast.loading("Analyzing code for bugs...")
        setIsRunning(true)
        try {
            const response = await aiApi.post("/copilot", {
                action: "debug",
                prompt: promptToSend,
                code: activeFile.content,
                fileName: activeFile.name,
                language: getLanguageFromFilename(activeFile.name),
            })

            const content = response.data?.data?.content || response.data?.message || ""
            setOutput(content)
            toast.success("Debugging analysis complete", { id: toastId })
        } catch (error: any) {
            console.error("AI Debug Error:", error)
            const errorMsg =
                error.response?.data?.error ||
                error.message ||
                "Failed to debug the code"
            toast.error(errorMsg, { id: toastId })
        } finally {
            setIsRunning(false)
        }
    }

    const improveCode = async (customPrompt?: string) => {
        if (!activeFile || !activeFile.content || activeFile.content.trim().length === 0) {
            toast.error("Please open a file with code to improve")
            return
        }

        const promptToSend = customPrompt !== undefined ? customPrompt : input
        const toastId = toast.loading("Improving code...")
        setIsRunning(true)
        try {
            const response = await aiApi.post("/copilot", {
                action: "improve",
                prompt: promptToSend,
                code: activeFile.content,
                fileName: activeFile.name,
                language: getLanguageFromFilename(activeFile.name),
            })

            const content = response.data?.data?.content || response.data?.message || ""
            setOutput(content)
            toast.success("Improvements generated successfully", { id: toastId })
        } catch (error: any) {
            console.error("AI Improve Error:", error)
            const errorMsg =
                error.response?.data?.error ||
                error.message ||
                "Failed to improve the code"
            toast.error(errorMsg, { id: toastId })
        } finally {
            setIsRunning(false)
        }
    }

    const sendChatMessage = async (customPrompt?: string) => {
        const promptToSend = customPrompt !== undefined ? customPrompt : input
        if (!promptToSend || promptToSend.trim().length === 0) {
            toast.error("Please enter a message")
            return
        }

        const now = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        })

        const userMsg: AIChatMessage = {
            id: uuidv4(),
            role: "user",
            content: promptToSend,
            timestamp: now,
        }

        const updatedHistory = [...chatMessages, userMsg]
        setChatMessages(updatedHistory)
        setInput("")

        const toastId = toast.loading("Thinking...")
        setIsRunning(true)
        try {
            const response = await aiApi.post("/copilot", {
                action: "chat",
                prompt: promptToSend,
                code: activeFile?.content || "",
                fileName: activeFile?.name || "",
                language: getLanguageFromFilename(activeFile?.name),
                messages: chatMessages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            })

            const content = response.data?.data?.content || response.data?.message || ""
            const assistantMsg: AIChatMessage = {
                id: uuidv4(),
                role: "assistant",
                content,
                timestamp: new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                }),
            }

            setChatMessages([...updatedHistory, assistantMsg])
            setOutput(content)
            toast.dismiss(toastId)
        } catch (error: any) {
            console.error("AI Chat Error:", error)
            const errorMsg =
                error.response?.data?.error ||
                error.message ||
                "Failed to get AI response"
            toast.error(errorMsg, { id: toastId })
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <CopilotContext.Provider
            value={{
                mode,
                setMode,
                input,
                setInput,
                output,
                setOutput,
                isRunning,
                chatMessages,
                generateCode,
                explainCode,
                debugCode,
                improveCode,
                sendChatMessage,
                clearChat,
                clearOutput,
            }}
        >
            {children}
        </CopilotContext.Provider>
    )
}

export { CopilotContextProvider }
export default CopilotContext
