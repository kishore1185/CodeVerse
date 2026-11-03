import { Request, Response } from "express"

export interface ChatMessage {
    role: "system" | "user" | "assistant"
    content: string
}

export interface CopilotRequestBody {
    action?: "generate" | "explain" | "debug" | "improve" | "chat"
    prompt?: string
    code?: string
    language?: string
    fileName?: string
    messages?: ChatMessage[]
}

export const handleCopilotRequest = async (req: Request, res: Response) => {
    try {
        const {
            action = "generate",
            prompt = "",
            code = "",
            language = "",
            fileName = "",
            messages = [],
        } = req.body as CopilotRequestBody

        // 1. Validate inputs based on action
        if (!prompt && (!messages || messages.length === 0) && !code) {
            return res.status(400).json({
                success: false,
                error: "Please provide a prompt or code context.",
            })
        }

        if (
            (action === "explain" || action === "debug" || action === "improve") &&
            (!code || code.trim().length === 0)
        ) {
            return res.status(400).json({
                success: false,
                error: `Code content is required for the '${action}' action. Please open a file with code in the editor.`,
            })
        }

        // 2. Validate API key presence
        const apiKey = process.env.GROQ_API_KEY
        if (!apiKey || apiKey.trim() === "") {
            return res.status(500).json({
                success: false,
                error: "GROQ_API_KEY is not configured on the server. Please set GROQ_API_KEY in server/.env and restart the server.",
            })
        }

        const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b"

        // 3. Construct messages payload for Groq
        const groqMessages: ChatMessage[] = []

        if (action === "explain") {
            groqMessages.push({
                role: "system",
                content:
                    "You are an expert programming tutor and code analyst in CodeVerse. Explain the provided code clearly, concisely, and accurately. Break down key concepts, functions, logic flow, and algorithms used. Use clear markdown formatting.",
            })
            const userContent = `Please explain the following code from file '${fileName || "active file"}' (${language || "code"}):\n\`\`\`${language}\n${code}\n\`\`\`${
                prompt && prompt.trim() ? `\n\nSpecific question / focus: ${prompt}` : ""
            }`
            groqMessages.push({
                role: "user",
                content: userContent,
            })
        } else if (action === "debug") {
            groqMessages.push({
                role: "system",
                content:
                    "You are an expert software debugging assistant in CodeVerse. Analyze the provided code for syntax errors, runtime bugs, logical issues, security risks, or performance bottlenecks. Clearly identify any problems found, explain the root cause, and provide the corrected code in markdown code blocks.",
            })
            const userContent = `Please debug the following code from file '${fileName || "active file"}' (${language || "code"}):\n\`\`\`${language}\n${code}\n\`\`\`${
                prompt && prompt.trim() ? `\n\nReported issue / error / context: ${prompt}` : ""
            }`
            groqMessages.push({
                role: "user",
                content: userContent,
            })
        } else if (action === "improve") {
            groqMessages.push({
                role: "system",
                content:
                    "You are a senior software engineer and code reviewer in CodeVerse. Analyze the provided code and suggest improvements for performance, readability, modern best practices, modularity, and maintainability. Provide the refactored code in markdown code blocks along with a concise explanation of what was improved.",
            })
            const userContent = `Please review and improve the following code from file '${fileName || "active file"}' (${language || "code"}):\n\`\`\`${language}\n${code}\n\`\`\`${
                prompt && prompt.trim() ? `\n\nSpecific improvement request: ${prompt}` : ""
            }`
            groqMessages.push({
                role: "user",
                content: userContent,
            })
        } else if (action === "chat") {
            groqMessages.push({
                role: "system",
                content:
                    "You are CodeVerse AI, an intelligent coding copilot and technical assistant in CodeVerse, a real-time collaborative development workspace. Help the user with programming queries, technical architecture, logic, and debugging. Provide clear, technical, concise, and helpful answers with markdown formatting for code.",
            })

            // If active file context exists, inject as context
            if (code && code.trim().length > 0) {
                groqMessages.push({
                    role: "system",
                    content: `[Current active file in editor: ${fileName || "unnamed"} (${language || "code"})]\n\`\`\`${language}\n${code}\n\`\`\``,
                })
            }

            // Append existing chat history
            if (Array.isArray(messages) && messages.length > 0) {
                for (const msg of messages) {
                    if (msg.role && msg.content) {
                        groqMessages.push({
                            role: msg.role,
                            content: msg.content,
                        })
                    }
                }
            }

            // Append latest prompt if provided
            if (prompt && prompt.trim().length > 0) {
                groqMessages.push({
                    role: "user",
                    content: prompt,
                })
            }
        } else {
            // Default: "generate"
            groqMessages.push({
                role: "system",
                content:
                    "You are an expert AI code generator in CodeVerse. Generate clean, efficient, and well-structured code based on the user's prompt. Provide only the code, formatted in Markdown using the appropriate language syntax (e.g., ```js for JavaScript, ```py for Python). Avoid unnecessary conversational filler.",
            })

            let userContent = prompt
            if (code && code.trim().length > 0) {
                userContent = `Context from current file (${fileName || "file"}${language ? `, ${language}` : ""}):\n\`\`\`${language}\n${code}\n\`\`\`\n\nPrompt: ${prompt}`
            }

            groqMessages.push({
                role: "user",
                content: userContent,
            })
        }

        // 4. Request Groq API directly using native fetch
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 60000)

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey.trim()}`,
            },
            body: JSON.stringify({
                model,
                messages: groqMessages,
                temperature: 0.5,
                max_tokens: 4096,
            }),
            signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!groqResponse.ok) {
            let errorDetail = `Groq API returned HTTP ${groqResponse.status}: ${groqResponse.statusText}`
            try {
                const errorData = (await groqResponse.json()) as any
                if (errorData?.error?.message) {
                    errorDetail = errorData.error.message
                }
            } catch {
                // Ignore parse errors on failure response
            }
            return res.status(groqResponse.status).json({
                success: false,
                error: errorDetail,
            })
        }

        const data = (await groqResponse.json()) as any
        const content = data?.choices?.[0]?.message?.content || ""

        return res.status(200).json({
            success: true,
            data: {
                content,
                role: "assistant",
                model: data?.model || model,
            },
            message: content,
        })
    } catch (error: any) {
        if (error.name === "AbortError") {
            return res.status(504).json({
                success: false,
                error: "Groq API request timed out after 60 seconds.",
            })
        }
        console.error("AI Controller Error:", error.message || error)
        return res.status(502).json({
            success: false,
            error: error.message || "Failed to communicate with Groq API.",
        })
    }
}

