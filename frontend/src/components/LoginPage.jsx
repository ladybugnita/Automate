import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage(){
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) =>{
        e.preventDefault();
        setError("");

        if (!username || !password) {
            setError("Please fill in all fields");
            return;
        }

        try {
            const res = await axios.post("http://localhost:5000/api/login", {
                username, 
                password,
            });

            const token = res.data.token;
            localStorage.setItem("token", token);

            if(rememberMe) localStorage.setItem("rememberedUser", username);
            else localStorage.removeItem("rememberedUser");

            navigate("/token");
        } catch(err) {
            console.error(err);
            if(err.response && err.response.data?.error)
                setError(err.response.data.error);
            else setError("Login failed. Please try again.");
        }
    };
    
    return (
        <div className = "relative min-h-screen flex items-center justify-center text-white bg-animated overflow-hidden">
            {Array.from({ length: 20 }).map((_, i) => (
                <div
                key={i}
                className="particle"
                style={{
                    width: `${Math.random() * 12 + 6}px`,
                    height: `${Math.random() * 12 + 6}px`,
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 8}s`,
                }}
                ></div>
            ))}
            <div className = "bg-white/10 backdrop-blur-xl border border-white/20 p-10 rounded-2xl shadow-2xl w-[400px] animate-fadeIn relative z-10">
                <h1 className = "text-3xl font-bold text-center mb-6 tracking-wide"> Login  </h1>

                {error && (
                    <div className="mb-4 bg-red-500/20 border border-red-400 text-red-300 px-4 py-2 rounded-lg text-center text-sm animate-pulse">
                        {error}
                        </div>
                )}
               
                <div className="space-y-5">

                <input
                type= "text"
                placeholder = "Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/20 border border-gray-400 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />  
                
                <div className="relative">
                <input 
                type ={showPassword ? "text" : "password"}
                placeholder= "Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/20 border border-gray-400 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                
                <button
                type = "button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-300 hover:text-white transition"
                >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-300">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="accent-blue-500 h-4 w-4 rounded border-gray-400"
                        />
                        Remember me
                    </label>
                    <Link
                    to="/forgot-password"
                    className="text-blue-400 hover:underline"
                    >
                        Forgot password?
                    </Link>
                </div>

                <button
                onClick={handleLogin}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition duration-200 shadow-md hover:shadow-blue-800/50">
                    Login
                </button>

                 </div>

                 <p className="text-gray-400 text-center mt-6">
                    Don't have an account?{" "}
                    <Link to="/signup" className="text-blue-400 hover:underline"> Sign up</Link>
                 </p>
            </div>
        </div>
    );
}
