import { useState } from "react";
import { Link , useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import axios from "axios";

export default function SignupPage(){
    const [ username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] =useState("");
    const [showPassword, setShowPassword] =useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const navigate = useNavigate();

    const handleSignup = async () => {
        setError("");

        if(!username || !password || !confirmPassword){
            setError("All fields are required");
            return;
        }

        if (password !== confirmPassword){
            setError("Passwords do not match!");
            return;
        }

        try {
            const res = await axios.post("http://localhost:5000/api/signup", {
                username, password,
            });
            alert(res.data.message || "Account created successfully!");
            navigate("/");
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || "Signup failed. Try again.");
        }
    };
    
    return(
        <div className="relative min-h-screen flex items-center justify-center text-white bg-animated overflow-hidden">
            {Array.from({ length: 20 }).map((_, i) => (
                <div
                key={i}
                className="particle"
                style={{
                    width: `${Math.random() * 12 + 6}px`,
                    height: `${Math.random() * 12 +6}px`,
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    animationDelay:`${Math.random() * 8}s`,
                }}
                ></div>
            ))}
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 p-10 rounded-2xl shadow-2xl w-[400px] animate-fadeIn relative z-10">
            <h1 className ="text-3xl font-bold text-center mb-6 tracking-wide">
                Create your Account
            </h1>

            {error && (
                <div className="mb-4 bg-red-500/20 border border-red-400 text-red-300 px-4 py-2 rounded-lg text-center text-sm animate-pulse">
                    {error}
                    </div>
            )}

            <div className="space-y-5">
                <input 
                type="text"
                placeholder="Username"
                className="w-full px-4 py-3 rounded-lg bg-white/20 border border-gray-400 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                />
                
                <div className="relative">
                    <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    className="w-full px-4 py-3 rounded-lg bg-white/20 border border-gray-400 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-300 hover:text-white"
                    >
                        {showPassword ? <EyeOff size={20} /> :<Eye size={20} />}
                    </button>
                </div>

                <div className="relative">
                    <input 
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm Password"
                    className="w-full px-4 py-3 rounded-lg bg-white/20 border border-gray-400 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition pr-10"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-gray-300 hover:text-white">
                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                </div>
          
                <button 
                onClick={handleSignup}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition duration-200 shadow-md hover:shadow-blue-800/50">
                    Sign up
                </button>
            </div>

            <p className="text-gray-400 text-center mt-6">
                Already have an account?{" "}
                <Link to="/" className="text-blue-400 hover:underline">
                Login
                </Link>
            </p>
            </div>
        </div>
    );
}