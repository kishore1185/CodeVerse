import { useCopilot } from "@/context/CopilotContext"
import { useFileSystem } from "@/context/FileContext"
import { useSocket } from "@/context/SocketContext"
import useResponsive from "@/hooks/useResponsive"
import { CopilotMode } from "@/types/copilot"
import { SocketEvent } from "@/types/socket"
import cn from "classnames"
import { KeyboardEvent, useEffect, useRef } from "react"
import toast from "react-hot-toast"
import {
    LuClipboardPaste,
    LuCopy,
    LuRepeat,
    LuSendHorizonal,
    LuTrash2,
} from "react-icons/lu"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

function CopilotView() {
    const { socket } = useSocket()
    const { viewHeight } = useResponsive()
    const {
        mode,
        setMode,
        input,
        setInput,
        output,
        isRunning,
        chatMessages,
        generateCode,
        explainCode,
        debugCode,
        improveCode,
        sendChatMessage,
        clearChat,
        clearOutput,
    } = useCopilot()
    const { activeFile, updateFileContent, setActiveFile } = useFileSystem()
    const chatEndRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (mode === "chat") {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }
    }, [chatMessages, mode])

    const copyText = async (text: string) => {
        try {
            const content = text.replace(/```[\w]*\n?/g, "").trim()
            await navigator.clipboard.writeText(content)
            toast.success("Output copied to clipboard")
        } catch (error) {
            toast.error("Unable to copy output to clipboard")
            console.error(error)
        }
    }

    const pasteCodeInFile = (text: string) => {
        if (!activeFile) {
            toast.error("Please open a file in the editor first")
            return
        }
        const fileContent = activeFile.content ? `${activeFile.content}\n` : ""
        const content = `${fileContent}${text.replace(/```[\w]*\n?/g, "").trim()}`
        updateFileContent(activeFile.id, content)
        setActiveFile({ ...activeFile, content })
        toast.success("Code pasted successfully")
        socket.emit(SocketEvent.FILE_UPDATED, {
            fileId: activeFile.id,
            newContent: content,
        })
    }

    const replaceCodeInFile = (text: string) => {
        if (!activeFile) {
            toast.error("Please open a file in the editor first")
            return
        }
        const isConfirmed = confirm(
            `Are you sure you want to replace the code in ${activeFile.name}?`,
        )
        if (!isConfirmed) return
        const content = text.replace(/```[\w]*\n?/g, "").trim()
        updateFileContent(activeFile.id, content)
        setActiveFile({ ...activeFile, content })
        toast.success("Code replaced successfully")
        socket.emit(SocketEvent.FILE_UPDATED, {
            fileId: activeFile.id,
            newContent: content,
        })
    }

    const handleAction = () => {
        if (mode === "generate") {
            generateCode()
        } else if (mode === "explain") {
            explainCode()
        } else if (mode === "debug") {
            debugCode()
        } else if (mode === "improve") {
            improveCode()
        } else if (mode === "chat") {
            sendChatMessage()
        }
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        if (e.key === "Enter") {
            if (mode === "chat" && !e.shiftKey) {
                e.preventDefault()
                handleAction()
            } else if ((e.ctrlKey || e.metaKey) && mode !== "chat") {
                e.preventDefault()
                handleAction()
            }
        }
    }

    const getButtonLabel = () => {
        if (isRunning) return "Processing..."
        switch (mode) {
            case "generate":
                return "Generate Code"
            case "explain":
                return "Explain Code"
            case "debug":
                return "Debug Code"
            case "improve":
                return "Improve Code"
            case "chat":
                return "Send Message"
        }
    }

    const getPlaceholder = () => {
        switch (mode) {
            case "generate":
                return "What code do you want to generate?"
            case "explain":
                return activeFile
                    ? `Explain ${activeFile.name} (optional: focus area or question)...`
                    : "Open a file in the editor to explain its code..."
            case "debug":
                return activeFile
                    ? `Debug ${activeFile.name} (optional: error or bug description)...`
                    : "Open a file in the editor to debug its code..."
            case "improve":
                return activeFile
                    ? `Improve ${activeFile.name} (optional: performance, style, etc.)...`
                    : "Open a file in the editor to improve its code..."
            case "chat":
                return "Ask AI Copilot anything about your code..."
        }
    }

    const renderMarkdown = (content: string) => (
        <ReactMarkdown
            components={{
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "")
                    const language = match ? match[1] : "javascript"

                    return !inline ? (
                        <SyntaxHighlighter
                            style={dracula}
                            language={language}
                            PreTag="pre"
                            className="!m-0 !h-full !rounded-lg !bg-gray-900 !p-2"
                        >
                            {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                    ) : (
                        <code
                            className={cn(
                                "rounded bg-darkHover px-1 py-0.5 text-xs text-primary",
                                className,
                            )}
                            {...props}
                        >
                            {children}
                        </code>
                    )
                },
                pre({ children }) {
                    return <pre className="h-full my-1">{children}</pre>
                },
            }}
        >
            {content}
        </ReactMarkdown>
    )

    const tabs: { id: CopilotMode; label: string }[] = [
        { id: "generate", label: "Generate" },
        { id: "chat", label: "Chat" },
        { id: "explain", label: "Explain" },
        { id: "debug", label: "Debug" },
        { id: "improve", label: "Improve" },
    ]

    return (
        <div
            className="flex max-h-full min-h-[400px] w-full flex-col gap-2.5 p-4"
            style={{ height: viewHeight }}
        >
            {/* Header with Title and Active File Indicator */}
            <div className="flex items-center justify-between border-b border-darkHover pb-2">
                <h1 className="text-lg font-bold text-white">AI Copilot</h1>
                {activeFile ? (
                    <span
                        className="max-w-[130px] truncate rounded bg-darkHover px-2 py-0.5 text-xs text-primary"
                        title={activeFile.name}
                    >
                        {activeFile.name}
                    </span>
                ) : (
                    <span className="rounded bg-darkHover px-2 py-0.5 text-xs text-gray-400">
                        No file open
                    </span>
                )}
            </div>

            {/* Mode selection tabs */}
            <div className="grid grid-cols-5 gap-1 text-xs">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setMode(tab.id)}
                        className={cn(
                            "rounded py-1 px-1 text-center font-medium transition-colors",
                            mode === tab.id
                                ? "bg-primary text-black font-semibold"
                                : "bg-darkHover text-gray-300 hover:text-white",
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content for Chat Mode */}
            {mode === "chat" ? (
                <div className="flex flex-1 flex-col justify-between overflow-hidden gap-2">
                    {/* Chat Messages List */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-sm">
                        {chatMessages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center text-center text-gray-400 py-8">
                                <p className="text-sm">No chat messages yet.</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Ask anything or discuss your active file.
                                </p>
                            </div>
                        ) : (
                            chatMessages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={cn("rounded-lg p-3 text-white", {
                                        "bg-darkHover ml-4": msg.role === "user",
                                        "bg-[#1c1f24] border border-gray-800 mr-2":
                                            msg.role === "assistant",
                                    })}
                                >
                                    <div className="flex items-center justify-between mb-1 text-xs text-gray-400">
                                        <span className="font-semibold text-primary">
                                            {msg.role === "user" ? "You" : "Copilot"}
                                        </span>
                                        {msg.timestamp && (
                                            <span className="text-[10px] text-gray-500">
                                                {msg.timestamp}
                                            </span>
                                        )}
                                    </div>
                                    <div className="break-words">
                                        {renderMarkdown(msg.content)}
                                    </div>
                                    {msg.role === "assistant" && (
                                        <div className="flex justify-end gap-3 pt-2 text-gray-400">
                                            <button
                                                title="Copy"
                                                onClick={() => copyText(msg.content)}
                                                className="hover:text-white"
                                            >
                                                <LuCopy size={14} />
                                            </button>
                                            <button
                                                title="Replace code in file"
                                                onClick={() => replaceCodeInFile(msg.content)}
                                                className="hover:text-white"
                                            >
                                                <LuRepeat size={14} />
                                            </button>
                                            <button
                                                title="Paste code in file"
                                                onClick={() => pasteCodeInFile(msg.content)}
                                                className="hover:text-white"
                                            >
                                                <LuClipboardPaste size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Chat Input Bar */}
                    <div className="flex items-center gap-2 pt-1">
                        <textarea
                            className="min-h-[42px] max-h-[80px] flex-1 rounded-md border-none bg-darkHover p-2 text-sm text-white outline-none resize-none"
                            placeholder="Ask Copilot... (Enter to send)"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                        />
                        <button
                            className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-black transition-opacity disabled:opacity-50"
                            onClick={handleAction}
                            disabled={isRunning}
                            title="Send"
                        >
                            <LuSendHorizonal size={18} />
                        </button>
                        {chatMessages.length > 0 && (
                            <button
                                className="flex h-10 w-8 items-center justify-center rounded-md bg-darkHover text-gray-400 hover:text-danger"
                                onClick={clearChat}
                                title="Clear Chat"
                            >
                                <LuTrash2 size={16} />
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                /* Content for Generate, Explain, Debug, Improve Modes */
                <div className="flex flex-1 flex-col overflow-hidden gap-2">
                    <textarea
                        className="min-h-[100px] w-full rounded-md border-none bg-darkHover p-2 text-white outline-none text-sm"
                        placeholder={getPlaceholder()}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    <button
                        className="flex w-full justify-center rounded-md bg-primary p-2 font-bold text-black outline-none disabled:cursor-not-allowed disabled:opacity-50 text-sm"
                        onClick={handleAction}
                        disabled={isRunning}
                    >
                        {getButtonLabel()}
                    </button>

                    {output && (
                        <div className="flex items-center justify-between border-t border-darkHover pt-2">
                            <span className="text-xs text-gray-400 font-medium">Output:</span>
                            <div className="flex items-center gap-3">
                                <button
                                    title="Copy Output"
                                    onClick={() => copyText(output)}
                                    className="text-white hover:text-primary transition-colors"
                                >
                                    <LuCopy size={17} />
                                </button>
                                <button
                                    title="Replace code in file"
                                    onClick={() => replaceCodeInFile(output)}
                                    className="text-white hover:text-primary transition-colors"
                                >
                                    <LuRepeat size={17} />
                                </button>
                                <button
                                    title="Paste code in file"
                                    onClick={() => pasteCodeInFile(output)}
                                    className="text-white hover:text-primary transition-colors"
                                >
                                    <LuClipboardPaste size={17} />
                                </button>
                                <button
                                    title="Clear Output"
                                    onClick={clearOutput}
                                    className="text-gray-400 hover:text-danger transition-colors ml-1"
                                >
                                    <LuTrash2 size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 rounded-lg w-full overflow-y-auto p-0 text-sm">
                        {output ? (
                            renderMarkdown(output)
                        ) : (
                            <div className="flex h-32 items-center justify-center text-center text-xs text-gray-500">
                                Output will appear here after running.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default CopilotView
