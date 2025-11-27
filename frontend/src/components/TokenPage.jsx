import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../Context/WebSocketContext";

export default function TokenPage() {
    const navigate = useNavigate();
    const { isConnected, startConnection, reconnect } = useWebSocket();

    const [tokenInput, setTokenInput] = useState(localStorage.getItem("token") || "");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [username, setUsername] = useState("");
    const [tokenConfirmed, setTokenConfirmed] = useState(false);

    const connectionAttemptedRef = useRef(false);
    const navigationAttemptedRef = useRef(false);

    const checkTokenStatus = async () => {
        console.log('Starting token check...');

        if (!tokenInput || tokenInput.length < 10) {
            setError("Please enter a valid token.");
            return;
        }

        localStorage.setItem("token", tokenInput);
        setLoading(true);
        setError("");
        setStatus("");
        setUsername("");
        setTokenConfirmed(false);

        connectionAttemptedRef.current = false;
        navigationAttemptedRef.current = false;

        try {
            console.log('Calling check-agent-status API...');
            const res = await fetch(
                `http://localhost:5000/check-agent-status?token=${encodeURIComponent(tokenInput)}`
            );

            if (!res.ok) throw new Error("Failed to contact backend.");

            const data = await res.json();
            console.log("Token check response:", data);

            if (data.status === "connected") {
                console.log('Token status: CONNECTED');
                setStatus("connected");
                setUsername(data.username || "");
                setTokenConfirmed(true);
            } else if (data.status === "invalid") {
                console.log('Token status: INVALID');
                setStatus("invalid");
            } else {
                console.log('Falling back to database check');
                await fallbackCheckDatabase();
            }
        } catch (err) {
            console.error('API call failed:', err);
            await fallbackCheckDatabase();
        }

        setLoading(false);
    };

    const fallbackCheckDatabase = async () => {
        try {
            console.log('Calling validate-token API...');
            const res = await fetch(
                `http://localhost:5000/validate-token?token=${encodeURIComponent(tokenInput)}`
            );
            const data = await res.json();
            console.log("Validate token response:", data);

            if (data.valid) {
                console.log('Token validated via database');
                setStatus("valid-but-disconnected");
                setUsername(data.username || "");
                setTokenConfirmed(true);
            } else {
                console.log('Token invalid in database');
                setStatus("invalid");
            }
        } catch (err) {
            console.error('Database check failed:', err);
            setStatus("invalid");
            setError("Could not validate token");
        }
    };

    useEffect(() => {
        console.log('Connection useEffect - tokenConfirmed:', tokenConfirmed, 'isConnected:', isConnected, 'attempted:', connectionAttemptedRef.current);

        if (tokenConfirmed && !isConnected && !connectionAttemptedRef.current) {
            console.log('Starting WebSocket connection manually...');
            connectionAttemptedRef.current = true;
            startConnection();
        }
    }, [tokenConfirmed, isConnected, startConnection]);


    useEffect(() => {
        console.log('Navigation useEffect - isConnected:', isConnected, 'status:', status, 'navigationAttempted:', navigationAttemptedRef.current);

        if (isConnected && (status === "connected" || status === "valid-but-disconnected") && !navigationAttemptedRef.current) {
            console.log('WebSocket connected and ready!');
            setStatus("fully-ready");

            const timer = setTimeout(() => {
                console.log('Auto-navigating to dashboard...');
                navigationAttemptedRef.current = true;
                navigate("/dashboard");
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [isConnected, status, navigate]);

    const goToDashboard = () => {
        console.log('Manual navigation to dashboard...');
        navigationAttemptedRef.current = true;
        navigate("/dashboard");
    };

    return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <div className="absolute top-0 left-0 right-0 bg-green-800 h-2"></div>

            <div className="bg-white p-8 rounded-2xl w-96 shadow-xl border-t-4 border-green-600 mt-16">
                <h2 className="text-3xl font-bold text-green-700 text-center mb-6">
                    Authentication Token
                </h2>

                {error && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-center text-sm">
                        {error}
                    </div>
                )}

                <label className="block text-sm font-medium text-green-800 mb-2">Token</label>
                <input
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste token here"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300"
                />

                <button
                    onClick={checkTokenStatus}
                    disabled={loading}
                    className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg"
                >
                    {loading ? "Checking..." : "Check Status"}
                </button>

                {status === "invalid" && (
                    <p className="mt-4 text-red-600 text-center font-semibold">
                        Invalid Token
                    </p>
                )}

                {tokenConfirmed && !isConnected && (
                    <div className="mt-4 bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-center">
                        <p className="text-yellow-700 text-sm">Token valid - Connecting WebSocket...</p>
                    </div>
                )}

                {isConnected && !status.includes("fully-ready") && (
                    <div className="mt-4 bg-blue-50 border border-blue-200 p-3 rounded-lg text-center">
                        <p className="text-blue-700 text-sm">WebSocket connected - Finalizing...</p>
                    </div>
                )}

                {status === "fully-ready" && (
                    <div className="mt-6 bg-green-50 border border-green-200 p-4 rounded-lg text-center">
                        <p className="font-semibold text-green-700">Token Valid & WebSocket Connected!</p>
                        {username && <p className="text-sm mt-1">User: {username}</p>}
                        <p className="text-xs text-green-600 mt-1">Ready to proceed</p>

                        <button
                            onClick={goToDashboard}
                            className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg"
                        >
                            Continue to Dashboard
                        </button>
                    </div>
                )}

                <div className="mt-4 text-xs text-gray-500 text-center space-y-1">
                    <p>Token Confirmed: {tokenConfirmed ? "Confirmed" : "notConfirmed"}</p>
                    <p>WebSocket: {isConnected ? "Connected" : "Disconnected"}</p>
                    <p>Status: {status || "none"}</p>
                    <p>Username: {username || "none"}</p>
                </div>
            </div>
        </div>
    );
}