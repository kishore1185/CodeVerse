import axios, { AxiosInstance } from "axios"

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

const aiApi: AxiosInstance = axios.create({
    baseURL: `${backendUrl}/api/ai`,
    headers: {
        "Content-Type": "application/json",
    },
})

export default aiApi

