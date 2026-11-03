import { Router } from "express"
import { handleCopilotRequest } from "../controllers/aiController"

const router = Router()

// Unified Copilot endpoint for generate, explain, debug, improve, and chat
router.post("/copilot", handleCopilotRequest)

// Specialized route aliases for flexibility
router.post("/generate", (req, res) => {
    req.body.action = "generate"
    return handleCopilotRequest(req, res)
})

router.post("/explain", (req, res) => {
    req.body.action = "explain"
    return handleCopilotRequest(req, res)
})

router.post("/debug", (req, res) => {
    req.body.action = "debug"
    return handleCopilotRequest(req, res)
})

router.post("/improve", (req, res) => {
    req.body.action = "improve"
    return handleCopilotRequest(req, res)
})

router.post("/chat", (req, res) => {
    req.body.action = "chat"
    return handleCopilotRequest(req, res)
})

export default router

