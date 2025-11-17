import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function TokenPage() {
    const token = localStorage.getItem("token");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [username, setUsername] = useState("");
    const navigate = useNavigate();

    const checkTokenStatus = async () => {
        if(!token) {
            setError ("No token found.");
            return;
        }

        setLoading(true);
        setError("");
        setStatus("");
        setUsername("");

        try{
            const res = await fetch(
                `http://localhost:5000/check-agent-status?token=${encodedURIComponent(token)}`);

                if(!res.ok){
                    throw new Error(`HTTP error! status: ${res.status}`);
                }

                const data = await res.json();
                console.log("Token check response:", data);

            if (data.status === "connected") {
                setStatus("Connected");
                setUsername(data.username || "");
            }  else if (data.status === "invalid") {
                setStatus("invalid");
            } else {
             await checkTokenViaDatabase();
            }
        } catch (err) {
            console.error("TWebSocket token check failed, trying database check:", err);
            await checkTokenViaDatabase();
        }
        setLoading(false);
        };

         const checkTokenViaDatabase = async () => {
        try {
            const res = await fetch(
                `http://localhost:5000/validate-token?token=${encodeURIComponent(token)}`
            );

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            console.log("Database token check response:", data);

            if (data.valid && data.status === "connected") {
                setStatus("connected");
                setUsername(data.username || "");
            } else if (data.valid) {
                setStatus("valid-but-disconnected");
                setError("Token is valid but agent is not connected");
                setUsername(data.username || "");
                 } else {
                setStatus("invalid");
            }
        } catch (err) {
            console.error("Database token check error:", err);
            setStatus("invalid");
            setError("Failed to check token status via both methods");
        }
    };

        const goToDashboard = () => {
            navigate("/dashboard");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-slate-800">
            <div className="bg-white/10 backdrop-blur-lg p-10 rounded-2xl shadow-2xl w-[450px] border border-white/20 text-center text-white">
                
                <h1 className="text-2xl font-semibold mb-6">Authentication Token</h1>

                <div className="bg-black/30 rounded-xl p-4 border border-white/10 mb-6">
                    <p className="break-words text-sm text-gray-200">
                        <strong>Token:</strong> {token || "No token found"}
                    </p>
                </div>

                <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste token here"
                    className="w-full px-4 py-3 rounded-lg bg-white/20 border border-gray-400 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition mb-4"
                />

                <button
                    onClick={checkTokenStatus}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition shadow-md"
                >
                    {loading ? "Checking..." : "Check Token Status"}
                </button>

                {error && (
                    <div className="mt-4 text-red-400 font-semibold">
                        {error}
                        </div>
                )}

                  {status === "valid-but-disconnected" && (
                    <div className="mt-6 text-yellow-400 font-semibold">
                        Token is valid but agent is not connected to WebSocket
                        {username && <p className="text-sm mt-2">Username: {username}</p>}
                        <br />
                        <button
                            onClick={checkTokenStatus}
                            className="mt-4 w-full bg-yellow-600 hover:bg-yellow-700 text-white py-3 rounded-lg font-semibold transition"
                        >
                            Check Again
                        </button>
                    </div>
                )}

                {status === "connected" && (
                    <div className="mt-6 text-green-400">
                        Agent connected successfully!
                     {username && <p className="text-sm mt-2">Username: {username}</p>}

                        <br />

                        <button
                            onClick={goToDashboard}
                            className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition"
                        >
                            Continue to Dashboard
                        </button>
                    </div>
                )}

                {status === "invalid" && (
                    <div className="mt-6 text-red-400 font-semibold">
                         Token not validated
                    </div>
                )}
            </div>
        </div>
    );
}
