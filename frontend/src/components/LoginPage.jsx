import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const API_URL = import.meta.env.VITE_API_URL || 'http://my_ip:server_port';

    useEffect(() => {
        console.log("API URL:", API_URL);
        
        try {
            new URL(API_URL);
            console.log("URL is valid");
        } catch (err) {
            console.error("Invalid URL:", API_URL);
            setError(`Invalid server URL: ${API_URL}. Please check configuration.`);
        }
        
        localStorage.removeItem('token');
        console.log('Cleared token on login page load');
    }, [API_URL]);

    useEffect(() => {
        const rememberedUser = localStorage.getItem("rememberedUser");
        if (rememberedUser) {
            setUsername(rememberedUser);
            setRememberMe(true);
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        if (!username || !password) {
            setError("Please fill in all fields");
            setLoading(false);
            return;
        }

        try {
            try {
                new URL(API_URL);
            } catch (err) {
                throw new Error(`Invalid server URL: ${API_URL}`);
            }

            console.log("Attempting login to:", `${API_URL}/api/login`);
            
            const res = await axios.post(`${API_URL}/api/login`, {
                username,
                password,
            }, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log("Login successful, token received");
            const token = res.data.token;
            localStorage.setItem("token", token);

            if (rememberMe) { 
                localStorage.setItem("rememberedUser", username); 
            } else { 
                localStorage.removeItem("rememberedUser"); 
            }

            navigate("/token");
        } catch (err) {
            console.error("Login error:", err);
            
            if (err.message.includes('Invalid server URL')) {
                setError(err.message);
            } else if (err.response) {
                setError(err.response.data?.error || `Login failed: ${err.response.status}`);
            } else if (err.request) {
                setError("Cannot connect to server. Please check if backend is running.");
            } else {
                setError(err.message || "Login failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <div className="absolute top-0 left-0 right-0 bg-green-800 h-2"></div>
            <div className="absolute top-2 left-0 right-0 bg-white py-4 px-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-green-800">Automate</h1>
                    <div className="text-sm text-gray-500">
                        Server: {API_URL}
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl w-96 shadow-xl border-t-4 border-green-600">
                <h2 className="text-3xl font-bold text-green-700 text-center mb-6">Login</h2>

                {error && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-center text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-green-800 mb-2">Username</label>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                            disabled={loading} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-green-800 mb-2"> Password </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition pr-12"
                                disabled={loading} />

                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition"
                                disabled={loading}>
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center gap-2 cursor-pointer text-gray-600">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                disabled={loading} />
                            Remember me
                        </label>
                        <Link
                            to="/forgot-password"
                            className="text-green-600 hover:text-green-700 hover:underline">
                            Forgot password?
                        </Link>
                    </div>

                    <button
                        onClick={handleLogin}
                        disabled={loading || !username || !password}
                        className={`w-full ${loading ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'} text-white py-3 rounded-lg font-semibold transition duration-200 shadow-md hover:shadow-lg flex justify-center items-center`}>
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Logging in...
                            </>
                        ) : "Login"}
                    </button>
                </div>

                <p className="text-gray-600 text-center mt-6">
                    Don't have an account?{" "}
                    <Link to="/signup" className="text-green-600 hover:text-green-700 hover:underline font-medium"> Sign up</Link>
                </p>
            </div>
        </div>
    );
}